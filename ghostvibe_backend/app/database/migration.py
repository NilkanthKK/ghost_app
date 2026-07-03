import asyncio
import sys
import logging
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

# Setup path and imports
sys.path.append("c:\\Users\\nilka\\Desktop\\ghost_app\\ghostvibe_backend")
from app.core.security import get_sha256_hash
from app.core.validators import validate_phone_number
from app.models.user import User
from app.models.crypto_key import CryptoKey
from app.models.offline import OfflineMessage, OfflineCall
# If groups or preferences tables exist, import them
try:
    from app.models.group import GroupMember
except ImportError:
    GroupMember = None
try:
    from app.models.preferences import Preferences
except ImportError:
    Preferences = None
try:
    from app.models.device import Device
except ImportError:
    Device = None

from app.database.session import async_session

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("migration")

# A comprehensive list of test/sandbox numbers to check for normalization duplicates
TEST_PHONES = [
    "9876543210",
    "9111111111",
    "9222222222",
    "9333333333",
    "9444444444",
    "12025550143"
]

async def run_migration():
    logger.info("Starting Zero-Knowledge Database Migration & Deduplication...")
    report = []
    
    async with async_session() as db:
        for raw_phone in TEST_PHONES:
            # Generate all possible formats
            formats = [
                raw_phone,
                f"+91{raw_phone}" if len(raw_phone) == 10 else raw_phone,
                f"91{raw_phone}" if len(raw_phone) == 10 else raw_phone,
                f"0{raw_phone}" if len(raw_phone) == 10 else raw_phone,
                f"+1{raw_phone}" if raw_phone.startswith("1") else raw_phone,
                f"+{raw_phone}" if not raw_phone.startswith("+") else raw_phone
            ]
            # De-duplicate list of formats
            formats = list(set(formats))
            
            # Canonical format
            canonical_phone = validate_phone_number(raw_phone)
            canonical_hash = get_sha256_hash(canonical_phone)
            
            # Map of hash to user records
            user_records = {}
            
            for fmt in formats:
                h = get_sha256_hash(fmt)
                stmt = select(User).where(User.username_hash == h)
                res = await db.execute(stmt)
                usr = res.scalars().first()
                if usr:
                    user_records[h] = usr
            
            if len(user_records) <= 1:
                # No duplicates found for this number
                continue
                
            logger.info(f"Duplicate records found for phone: {canonical_phone}")
            
            # Identify the primary user record
            # We preserve the canonical hash user if it exists, otherwise the first record found
            primary_hash = canonical_hash if canonical_hash in user_records else list(user_records.keys())[0]
            primary_user = user_records[primary_hash]
            
            report.append(f"Merging duplicates for phone: {canonical_phone}")
            report.append(f"  Primary User ID: {primary_user.user_id} (Hash: {primary_hash[:12]}...)")
            
            # Merge duplicate records into the primary user
            for h, duplicate_user in user_records.items():
                if h == primary_hash:
                    continue
                    
                report.append(f"  Duplicate User ID: {duplicate_user.user_id} (Hash: {h[:12]}...) - Merging related data...")
                
                # Update CryptoKey
                await db.execute(
                    update(CryptoKey).where(CryptoKey.user_id == duplicate_user.user_id).values(user_id=primary_user.user_id)
                )
                # Update OfflineMessage sender & recipient
                await db.execute(
                    update(OfflineMessage).where(OfflineMessage.sender_id == duplicate_user.user_id).values(sender_id=primary_user.user_id)
                )
                await db.execute(
                    update(OfflineMessage).where(OfflineMessage.recipient_id == duplicate_user.user_id).values(recipient_id=primary_user.user_id)
                )
                # Update OfflineCall
                await db.execute(
                    update(OfflineCall).where(OfflineCall.caller_id == duplicate_user.user_id).values(caller_id=primary_user.user_id)
                )
                await db.execute(
                    update(OfflineCall).where(OfflineCall.recipient_id == duplicate_user.user_id).values(recipient_id=primary_user.user_id)
                )
                
                # Update GroupMember if table exists
                if GroupMember:
                    try:
                        await db.execute(
                            update(GroupMember).where(GroupMember.user_id == duplicate_user.user_id).values(user_id=primary_user.user_id)
                        )
                    except Exception as e:
                        logger.warning(f"Failed to update GroupMember: {e}")
                        
                # Update Preferences if table exists
                if Preferences:
                    try:
                        await db.execute(
                            update(Preferences).where(Preferences.user_id == duplicate_user.user_id).values(user_id=primary_user.user_id)
                        )
                    except Exception as e:
                        logger.warning(f"Failed to update Preferences: {e}")
                        
                # Update Device if table exists
                if Device:
                    try:
                        await db.execute(
                            update(Device).where(Device.user_id == duplicate_user.user_id).values(user_id=primary_user.user_id)
                        )
                    except Exception as e:
                        logger.warning(f"Failed to update Device: {e}")
                
                # Delete duplicate User record
                await db.execute(delete(User).where(User.user_id == duplicate_user.user_id))
            
            # Ensure the primary user record uses the canonical hash
            if primary_user.username_hash != canonical_hash:
                primary_user.username_hash = canonical_hash
                db.add(primary_user)
                report.append(f"  Primary User hash updated to canonical E.164 hash.")
                
        await db.commit()
        logger.info("Migration transaction committed successfully.")
        
    print("\n" + "="*50)
    print("           DATABASE MIGRATION REPORT")
    print("="*50)
    if not report:
        print("No duplicate user registration records found in database.")
    else:
        for line in report:
            print(line)
    print("="*50 + "\n")

if __name__ == "__main__":
    asyncio.run(run_migration())
