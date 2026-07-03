from fastapi import WebSocket
import json
import logging
from datetime import datetime, timezone
from app.core.config import settings

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        # Maps user_id (string) to their active WebSocket connection
        self.active_connections: dict[str, WebSocket] = {}
        # Maps user_id (string) to their last active ISO timestamp (string)
        self.last_active: dict[str, str] = {}

    async def connect(self, user_id: str, websocket: WebSocket):
        """
        Accepts the WebSocket connection and registers the user session.
        """
        await websocket.accept()
        self.active_connections[user_id] = websocket
        logger.info(f"WebSocket session established for user: {user_id}. Active sessions: {len(self.active_connections)}")
        
        # Broadcast that this user is now online to all other active connections
        await self.broadcast_presence(user_id, "online")

    async def disconnect(self, user_id: str):
        """
        Removes a user's WebSocket connection from the active pool.
        """
        if user_id in self.active_connections:
            del self.active_connections[user_id]
            now_iso = datetime.now(timezone.utc).isoformat()
            self.last_active[user_id] = now_iso
            logger.info(f"WebSocket session disconnected for user: {user_id}. Active sessions: {len(self.active_connections)}")
            
            # Broadcast that this user is now offline to all other active connections
            await self.broadcast_presence(user_id, "offline", now_iso)

    async def send_personal_message(self, message: dict, user_id: str) -> bool:
        """
        Sends a JSON message directly to a target user's active WebSocket.
        Returns True if successful, False if the user is offline.
        """
        websocket = self.active_connections.get(user_id)
        if websocket:
            try:
                await websocket.send_text(json.dumps(message))
                return True
            except Exception as e:
                logger.error(f"Error sending message to {user_id}: {e}")
                # Use await here since disconnect is now an async method (due to broadcast)
                await self.disconnect(user_id)
                return False
        return False

    async def broadcast_presence(self, user_id: str, status: str, last_active: str = None):
        """
        Broadcasts presence status changes of a user to all other online users.
        """
        packet = {
            "type": "presence-update",
            "sender_id": "system",
            "data": {
                "user_id": user_id,
                "status": status,
                "last_active": last_active
            }
        }
        await self.broadcast(packet, exclude_user_id=user_id)

    async def broadcast(self, message: dict, exclude_user_id: str = None):
        """
        Broadcasts a message to all connected clients, optionally excluding one user.
        """
        import asyncio
        payload = json.dumps(message)
        
        tasks = []
        user_ids = []
        
        # Take a snapshot to avoid RuntimeError: dictionary changed size during iteration
        connections_snapshot = list(self.active_connections.items())
        
        for user_id, websocket in connections_snapshot:
            if exclude_user_id and user_id == exclude_user_id:
                continue
            tasks.append(websocket.send_text(payload))
            user_ids.append(user_id)
            
        if not tasks:
            return
            
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        disconnected = []
        for user_id, result in zip(user_ids, results):
            if isinstance(result, Exception):
                logger.error(f"Failed to broadcast to {user_id}: {result}")
                disconnected.append(user_id)
                
        for user_id in disconnected:
            await self.disconnect(user_id)

# Global singleton instance of the connection manager
manager = ConnectionManager()
