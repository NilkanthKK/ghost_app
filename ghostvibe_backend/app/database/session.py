from collections.abc import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import text
from app.core.config import settings
from app.database.base_class import Base
import asyncpg
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create the primary async engine for the ghostvibe database
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
)

# Async session maker
async_session = async_sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)

async def init_db() -> None:
    """
    Checks if the database 'ghostvibe' exists on PostgreSQL.
    If not, creates it automatically. Then, creates all tables.
    """
    db_name = settings.DB_NAME
    # Connect to the system database 'postgres' to run the check/create
    system_url = settings.DATABASE_URL_SYSTEM
    
    # We create a temporary engine with AUTOCOMMIT to run CREATE DATABASE
    sys_engine = create_async_engine(system_url, isolation_level="AUTOCOMMIT")
    
    async with sys_engine.connect() as conn:
        # Check if the database exists
        result = await conn.execute(
            text(f"SELECT 1 FROM pg_database WHERE datname='{db_name}'")
        )
        exists = result.scalar()
        
        if not exists:
            logger.info(f"Database '{db_name}' not found. Creating it dynamically...")
            await conn.execute(text(f"CREATE DATABASE {db_name}"))
            logger.info(f"Database '{db_name}' created successfully.")
        else:
            logger.info(f"Database '{db_name}' already exists.")
            
    await sys_engine.dispose()

    # Now import models dynamically to register them with Base metadata
    from app.models.user import User
    from app.models.crypto_key import CryptoKey
    from app.models.offline import OfflineMessage, OfflineCall
    from app.models.preferences import UserPreference
    from app.models.signal_identity import SignalIdentity, OneTimePreKey
    from app.models.signal_session import SignalSession
    from app.models.linked_device import LinkedDevice, DeviceSession, DeviceKey, DeviceSyncPacket
    from app.models.group_chat import Group, GroupMember, GroupInvite, GroupKey
    from app.models.admin import AdminUser, AuditLog
    
    # Create all tables in the ghostvibe database
    logger.info("Initializing database schemas...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
        # Execute database migrations dynamically to add user tracking columns if missing
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP WITH TIME ZONE;"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE;"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT FALSE;"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user';"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_status BOOLEAN DEFAULT FALSE;"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_status VARCHAR(50) DEFAULT 'verified';"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(100);"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100);"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(100);"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);"))
        
        # Create database indexes
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users (last_seen);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_users_is_blocked ON users (is_blocked);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_users_is_suspended ON users (is_suspended);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_users_is_deleted ON users (is_deleted);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_users_phone_number ON users (phone_number);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_users_full_name ON users (full_name);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);"))
        
    logger.info("Database schemas synchronized successfully.")

    # Seed Admin User
    async with async_session() as session:
        from sqlalchemy import select
        from app.core.security import get_password_hash
        stmt = select(AdminUser).where(AdminUser.email == "nilkanth.jethava846@gmail.com")
        res = await session.execute(stmt)
        admin = res.scalars().first()
        if not admin:
            logger.info("Seeding initial admin account...")
            hashed_pw = get_password_hash(settings.ADMIN_PASSWORD)
            new_admin = AdminUser(
                email="nilkanth.jethava846@gmail.com",
                password_hash=hashed_pw,
                role="admin"
            )
            session.add(new_admin)
            await session.commit()
            logger.info("Admin account seeded successfully.")

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency helper to retrieve a database session for FastAPI endpoints.
    """
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
