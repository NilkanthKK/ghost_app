from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import auth, ai_features, preferences, signal, ai_security, linked_device, group_chat, admin
from app.websockets import chat
from app.database.session import init_db
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
)

# Set up CORS middleware to allow connection from our React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Startup hook to initialize PostgreSQL database and tables
@app.on_event("startup")
async def startup_event():
    # Print exactly what settings are loaded in memory
    logger.info("========================================")
    logger.info(f"PROJECT_NAME: {settings.PROJECT_NAME}")
    logger.info(f"DB_USER: {settings.DB_USER}")
    logger.info(f"DB_PASSWORD: {settings.DB_PASSWORD}")
    logger.info(f"DB_HOST: {settings.DB_HOST}")
    logger.info(f"DB_PORT: {settings.DB_PORT}")
    logger.info(f"DB_NAME: {settings.DB_NAME}")
    logger.info(f"DATABASE_URL: {settings.DATABASE_URL}")
    logger.info("========================================")
    try:
        await init_db()
        logger.info("Application initialized database components successfully.")
    except Exception as e:
        logger.error(f"Database initialization failed on startup: {e}")
        logger.warning("Verify that your PostgreSQL service is running on port 5432 and default credentials are correct.")

# Register REST and WebSocket routers
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(ai_features.router, prefix=settings.API_V1_STR)
app.include_router(preferences.router, prefix=settings.API_V1_STR)
app.include_router(signal.router, prefix=settings.API_V1_STR)
app.include_router(ai_security.router, prefix=settings.API_V1_STR)
app.include_router(linked_device.router, prefix=settings.API_V1_STR)
app.include_router(group_chat.router, prefix=settings.API_V1_STR)
app.include_router(admin.router, prefix=settings.API_V1_STR)
app.include_router(chat.router)  # Includes /ws/{user_id} websocket

@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "features": {
            "ZeroKnowledgeAuth": "Active",
            "CallTranslation": "Active",
            "DeepfakeTamperShield": "Active"
        }
    }
