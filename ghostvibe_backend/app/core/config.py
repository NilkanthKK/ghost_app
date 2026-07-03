import os
from pathlib import Path
from dotenv import load_dotenv

# Resolve absolute path to .env file at the backend root directory
env_path = Path(__file__).resolve().parent.parent.parent / '.env'
load_dotenv(dotenv_path=env_path, override=True)

class Settings:
    PROJECT_NAME: str = "GhostVibe Protocol"
    API_V1_STR: str = "/api"
    
    # PostgreSQL Configuration (uses asyncpg for async SQL Alchemy)
    DB_USER: str = os.getenv("DB_USER", "postgres")
    DB_PASSWORD: str = os.getenv("DB_PASSWORD", "postgres")
    DB_HOST: str = os.getenv("DB_HOST", "localhost")
    DB_PORT: str = os.getenv("DB_PORT", "5432")
    DB_NAME: str = os.getenv("DB_NAME", "ghostvibe")
    
    @property
    def DATABASE_URL(self) -> str:
        return f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    @property
    def DATABASE_URL_SYSTEM(self) -> str:
        # Used to connect to system db (postgres) to create the target db if it doesn't exist
        return f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/postgres"

    # Redis Configuration
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    USE_REDIS: bool = os.getenv("USE_REDIS", "false").lower() == "true"

    # Cryptography and Token Settings
    SECRET_KEY: str = os.getenv("SECRET_KEY", "ghostvibe_super_secret_key_change_me_in_production_1234567890")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24 * 7)))
    ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "GhostVibeAdminSecure2026!")

    # CORS Allowed Origins
    @property
    def CORS_ORIGINS(self) -> list[str]:
        origins_str = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
        return [o.strip() for o in origins_str.split(",") if o.strip()]

settings = Settings()
