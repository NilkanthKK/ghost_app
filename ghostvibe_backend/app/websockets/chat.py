from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status
from app.websockets.connection import manager
from app.core.security import decode_access_token
import json
import logging
import uuid
import asyncio
import time
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.offline import OfflineMessage
from app.core.flags import flags
from app.database.session import async_session

logger = logging.getLogger(__name__)
router = APIRouter(tags=["WebSockets"])

# Module-level dictionary tracking active disappearing messages expiries
# format: { message_id: { "task": asyncio.Task, "expires_at": float, "sender_id": str, "recipient_id": str } }
active_expiries = {}

# Set of view-once message IDs that have been opened/consumed
opened_view_once_messages = set()

async def run_expiry_timer(message_id: str, ttl: int, sender_id: str, recipient_id: str):
    try:
        await asyncio.sleep(ttl)
        await handle_expired_message(message_id, sender_id, recipient_id)
    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.error(f"Error in expiry timer for message {message_id}: {e}")
    finally:
        active_expiries.pop(message_id, None)

def schedule_message_expiry(message_id: str, ttl: int, sender_id: str, recipient_id: str):
    if not message_id or ttl <= 0:
        return
        
    # Cancel existing timer if duplicate ID is scheduled
    if message_id in active_expiries:
        try:
            active_expiries[message_id]["task"].cancel()
        except Exception:
            pass

    expires_at = time.time() + ttl
    task = asyncio.create_task(run_expiry_timer(message_id, ttl, sender_id, recipient_id))
    active_expiries[message_id] = {
        "task": task,
        "expires_at": expires_at,
        "sender_id": sender_id,
        "recipient_id": recipient_id
    }
    logger.info(f"Scheduled disappearing message {message_id} with TTL {ttl}s.")

async def handle_expired_message(message_id: str, sender_id: str, recipient_id: str):
    # 1. Clean up from offline queue database if still exists
    try:
        async with async_session() as db:
            msg_uuid = uuid.UUID(message_id)
            stmt = select(OfflineMessage).where(OfflineMessage.message_id == msg_uuid)
            res = await db.execute(stmt)
            db_msg = res.scalars().first()
            if db_msg:
                await db.delete(db_msg)
                await db.commit()
                logger.info(f"Expired message {message_id} removed from offline queue.")
    except Exception as e:
        logger.error(f"Error checking/deleting expired message from database: {e}")

    # 2. Emit WebSocket events to both endpoints
    expired_event = {
        "type": "message-expired",
        "data": {
            "message_id": message_id
        }
    }
    await manager.send_personal_message(expired_event, sender_id)
    await manager.send_personal_message(expired_event, recipient_id)
    logger.info(f"Broadcasted expiry event for message: {message_id}")

async def queue_offline_message(
    sender_id: str,
    recipient_id: str,
    payload: dict,
    db: AsyncSession,
):
    """
    Saves an encrypted message to the database if the recipient is offline.
    Includes retry loops to handle SQLite write locks/contention gracefully.
    Returns the created OfflineMessage model instance.
    """
    if not flags.OFFLINE_QUEUE_ENABLED:
        return None

    logger.info("Offline message stored")
    logger.info(f"Recipient ID: {recipient_id}")
    max_retries = 5
    for attempt in range(max_retries):
        try:
            offline_msg = OfflineMessage(
                sender_id=uuid.UUID(sender_id),
                recipient_id=uuid.UUID(recipient_id),
                encrypted_payload=json.dumps(payload)
            )
            db.add(offline_msg)
            await db.commit()
            await db.refresh(offline_msg)
            logger.info("Database Commit OK")
            return offline_msg
        except Exception as e:
            await db.rollback()
            if attempt == max_retries - 1:
                logger.error(f"Failed to queue offline message after {max_retries} attempts: {e}")
                raise e
            logger.warning(f"Database write contention (attempt {attempt + 1}), retrying in 100ms: {e}")
            await asyncio.sleep(0.1)

async def deliver_offline_payloads(
    websocket: WebSocket,
    user_id: str,
    db: AsyncSession,
):
    """
    Fetches all queued offline messages for the user, batches them,
    and streams them over the websocket connection.
    Does not delete database records (deletion occurs on client ACK).
    """
    if not flags.OFFLINE_QUEUE_ENABLED:
        return

    logger.info("Offline sync started")
    try:
        user_uuid = uuid.UUID(user_id)
        stmt = (
            select(OfflineMessage)
            .where(OfflineMessage.recipient_id == user_uuid)
            .order_by(OfflineMessage.created_at.asc())
        )
        result = await db.execute(stmt)
        messages = result.scalars().all()
        logger.info(f"Messages found: {len(messages)}")

        valid_messages = []
        for msg in messages:
            try:
                payload = json.loads(msg.encrypted_payload)
            except Exception:
                payload = {}

            # Enforce View Once delivery rules
            msg_id = payload.get("data", {}).get("id") or str(msg.message_id)
            is_view_once = payload.get("data", {}).get("view_once", False)
            if is_view_once and msg_id in opened_view_once_messages:
                await db.delete(msg)
                logger.info(f"Offline view once message {msg_id} was already opened. Pruned.")
                continue

            ttl = payload.get("data", {}).get("ttl")
            if ttl is not None and isinstance(ttl, (int, float)):
                created_at = msg.created_at
                if created_at.tzinfo is None:
                    created_at = created_at.replace(tzinfo=timezone.utc)
                elapsed = (datetime.now(timezone.utc) - created_at).total_seconds()
                
                if elapsed >= ttl:
                    await db.delete(msg)
                    # Notify the sender that recipient's copy expired
                    expired_event = {
                        "type": "message-expired",
                        "data": {
                            "message_id": payload.get("data", {}).get("id") or str(msg.message_id)
                        }
                    }
                    await manager.send_personal_message(expired_event, str(msg.sender_id))
                    logger.info(f"Offline message {msg.message_id} expired before delivery. Pruned.")
                    continue
                else:
                    remaining_ttl = ttl - elapsed
                    schedule_message_expiry(
                        payload.get("data", {}).get("id") or str(msg.message_id),
                        int(remaining_ttl),
                        str(msg.sender_id),
                        str(msg.recipient_id)
                    )
            
            valid_messages.append(msg)
        
        await db.commit()

        if not valid_messages:
            await websocket.send_text(json.dumps({
                "type": "offline-sync-complete"
            }))
            return

        batch_size = 50
        for i in range(0, len(valid_messages), batch_size):
            batch = valid_messages[i:i+batch_size]
            for msg in batch:
                logger.info(f"Sending message ID: {msg.message_id}")
            sync_payload = {
                "type": "offline-sync",
                "data": {
                    "messages": [
                        {
                            "server_message_id": str(msg.message_id),
                            "sender_id": str(msg.sender_id),
                            "timestamp": msg.created_at.isoformat(),
                            "encrypted_payload": msg.encrypted_payload
                        }
                        for msg in batch
                    ]
                }
            }
            await websocket.send_text(json.dumps(sync_payload))
            logger.info("Message sent")

        await websocket.send_text(json.dumps({
            "type": "offline-sync-complete"
        }))
        logger.info("Waiting ACK")
    except Exception as e:
        logger.error(f"Error delivering offline payloads: {e}")


@router.websocket("/ws/{user_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    user_id: str,
    token: str = Query(None)
):
    """
    Full-duplex WebSocket delivery channel.
    Routes WebRTC signaling offers/answers/ICE candidates and encrypted messages.
    No database logging occurs; all messages flow transiently in memory.
    """
    # Verify authentication token if provided
    if token:
        token_user_id = decode_access_token(token)
        if not token_user_id or token_user_id != user_id:
            logger.warning(f"Unauthenticated WebSocket connection attempt for user: {user_id}")
            await websocket.accept()
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    else:
        logger.warning(f"No token supplied for WebSocket connection user: {user_id}")
        await websocket.accept()
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect(user_id, websocket)
    
    # Milestone 1: Deliver queued offline messages on startup
    try:
        async with async_session() as db:
            await deliver_offline_payloads(websocket, user_id, db)
    except Exception as e:
        logger.error(f"Failed to deliver offline queue on connection start: {e}")

    try:
        while True:
            # Wait for incoming messages
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                logger.error(f"Invalid JSON payload received from user {user_id}")
                continue

            msg_type = message.get("type")
            target_id = message.get("target_id")
            payload = message.get("data")

            if not msg_type or (not target_id and msg_type != "message-ack"):
                logger.warning(f"Missing routing params in socket message from: {user_id}")
                continue

            # Special routing logic: Presence Queries are answered directly by the server
            if msg_type == "presence-query":
                status_str = "online" if target_id in manager.active_connections else "offline"
                last_active_time = manager.last_active.get(target_id)
                response = {
                    "type": "presence-update",
                    "sender_id": "system",
                    "data": {
                        "user_id": target_id,
                        "status": status_str,
                        "last_active": last_active_time
                    }
                }
                await manager.send_personal_message(response, user_id)
                continue

            # Expiry sync event
            if msg_type == "message-sync-expiry":
                expiries = {}
                if isinstance(payload, dict):
                    for m_id in payload.get("message_ids", []):
                        if m_id in active_expiries:
                            rem = active_expiries[m_id]["expires_at"] - time.time()
                            expiries[m_id] = max(0, int(rem))
                response = {
                    "type": "message-sync-expiry",
                    "sender_id": "system",
                    "data": {
                        "expiries": expiries
                    }
                }
                await manager.send_personal_message(response, user_id)
                continue

            # Message Acknowledgement -> delete from offline queue
            if msg_type == "message-ack":
                msg_id = payload.get("server_message_id") if isinstance(payload, dict) else None
                if msg_id:
                    logger.info("ACK received")
                    try:
                        async with async_session() as db:
                            msg_uuid = uuid.UUID(msg_id)
                            stmt = select(OfflineMessage).where(OfflineMessage.message_id == msg_uuid)
                            res = await db.execute(stmt)
                            db_msg = res.scalars().first()
                            if db_msg:
                                logger.info("Deleting record")
                                await db.delete(db_msg)
                                await db.commit()
                                logger.info(f"Offline message {msg_id} acknowledged and pruned from database.")
                    except Exception as e:
                        logger.error(f"Error handling message-ack: {e}")
                
                # Also forward to sender so they get delivery receipt checkmarks if target_id is supplied
                if target_id:
                    routed_packet = {
                        "type": msg_type,
                        "sender_id": user_id,
                        "data": payload
                    }
                    await manager.send_personal_message(routed_packet, target_id)
                continue

            # View Once Media Event Routing
            if msg_type in ("media-opened", "media-expired", "media-view-status"):
                if msg_type == "media-opened":
                    message_id = payload.get("message_id") if isinstance(payload, dict) else None
                    if message_id:
                        opened_view_once_messages.add(message_id)
                        try:
                            async with async_session() as db:
                                # 1. Try deleting by database UUID if it is a valid UUID
                                try:
                                    msg_uuid = uuid.UUID(message_id)
                                    stmt = select(OfflineMessage).where(OfflineMessage.message_id == msg_uuid)
                                    res = await db.execute(stmt)
                                    db_msg = res.scalars().first()
                                    if db_msg:
                                        await db.delete(db_msg)
                                        await db.commit()
                                        logger.info(f"Opened view-once message {message_id} pruned from DB by UUID.")
                                except ValueError:
                                    # 2. If it is a custom string ID, find any message where encrypted_payload contains the custom ID
                                    stmt = select(OfflineMessage).where(
                                        OfflineMessage.recipient_id == uuid.UUID(user_id)
                                    )
                                    res = await db.execute(stmt)
                                    db_msgs = res.scalars().all()
                                    for msg in db_msgs:
                                        try:
                                            p = json.loads(msg.encrypted_payload)
                                            if p.get("data", {}).get("id") == message_id:
                                                await db.delete(msg)
                                                await db.commit()
                                                logger.info(f"Opened view-once message {message_id} pruned from DB by custom string ID.")
                                                break
                                        except Exception:
                                            continue
                        except Exception as e:
                            logger.error(f"Error pruning opened view-once message: {e}")
                
                # Assemble routed packet
                routed_packet = {
                    "type": msg_type,
                    "sender_id": user_id,
                    "data": payload
                }
                delivered = await manager.send_personal_message(routed_packet, target_id)
                if not delivered and flags.OFFLINE_QUEUE_ENABLED:
                    try:
                        async with async_session() as db:
                            await queue_offline_message(user_id, target_id, routed_packet, db)
                            logger.info(f"Offline media event {msg_type} queued for {target_id}.")
                    except Exception as e:
                        logger.error(f"Failed to queue offline media event {msg_type}: {e}")
                continue

            # Disappearing messages scheduling
            if msg_type in ("chat-message", "message-send"):
                ttl = payload.get("ttl") if isinstance(payload, dict) else None
                if ttl is not None and isinstance(ttl, (int, float)) and ttl > 0:
                    msg_id = payload.get("id")
                    if msg_id:
                        schedule_message_expiry(msg_id, int(ttl), user_id, target_id)

            # Map message-send to chat-message internally for backward compatibility
            actual_type = "chat-message" if msg_type == "message-send" else msg_type

            # Assemble direct routed packet
            routed_packet = {
                "type": actual_type,
                "sender_id": user_id,
                "data": payload
            }

            # Forward the message to the destination client
            delivered = await manager.send_personal_message(routed_packet, target_id)
            
            # Send immediate send receipt confirmation back to the sender
            sent_receipt = {
                "type": "message-sent",
                "target_id": target_id,
                "data": {
                    "client_message_id": payload.get("id"),
                    "id": payload.get("id"),
                    "recipient_id": target_id
                }
            }
            await manager.send_personal_message(sent_receipt, user_id)
            
            # If target is offline, notify the sender / queue if offline sync is enabled
            if not delivered:
                if actual_type in ("chat-message", "delete-everyone", "delivery-ack", "read-ack", "vibe-update") and flags.OFFLINE_QUEUE_ENABLED:
                    try:
                        async with async_session() as db:
                            await queue_offline_message(user_id, target_id, routed_packet, db)
                        
                        if actual_type == "chat-message":
                            queued_receipt = {
                                "type": "message-queued",
                                "data": {
                                    "client_message_id": payload.get("id"),
                                    "id": payload.get("id"),
                                    "status": "queued"
                                }
                            }
                            await manager.send_personal_message(queued_receipt, user_id)
                        logger.info(f"Routed event of type {actual_type} to user {target_id} queued in offline database.")
                    except Exception as e:
                        logger.error(f"Failed to write offline message queue: {e}")
                        if actual_type == "chat-message":
                            err_receipt = {
                                "type": "error",
                                "code": "DB_WRITE_FAIL"
                            }
                            await manager.send_personal_message(err_receipt, user_id)
                else:
                    receipt = {
                        "type": "delivery-receipt",
                        "status": "offline",
                        "target_id": target_id,
                        "original_type": msg_type
                    }
                    await manager.send_personal_message(receipt, user_id)
                    logger.info(f"Target user {target_id} offline. Delivery failed for type {msg_type}")

    except WebSocketDisconnect:
        await manager.disconnect(user_id)
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
        await manager.disconnect(user_id)
