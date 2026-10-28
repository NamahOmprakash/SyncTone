"""Database engine and session management for SyncTone."""

import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

# Load environment variables from project root .env if present
env_loaded = False
for parent in Path(__file__).resolve().parents:
    candidate = parent / ".env"
    if candidate.exists():
        load_dotenv(dotenv_path=candidate)
        env_loaded = True
        break
if not env_loaded:
    load_dotenv()

DEFAULT_DB_URL = "postgresql://synctone_user:synctone_pass@localhost:5432/synctone"
raw_db_url = os.getenv("DATABASE_URL", DEFAULT_DB_URL)

# Normalize URLs for sync and async drivers
if raw_db_url.startswith("postgresql://"):
    sync_db_url = raw_db_url
    async_db_url = raw_db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
elif raw_db_url.startswith("postgresql+asyncpg://"):
    async_db_url = raw_db_url
    sync_db_url = raw_db_url.replace("postgresql+asyncpg://", "postgresql://", 1)
else:
    sync_db_url = raw_db_url
    async_db_url = raw_db_url

# Synchronous Engine & Session (used by Alembic and worker synchronous tasks)
engine = create_engine(
    sync_db_url,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Asynchronous Engine & Session (used by async endpoints and LISTEN/NOTIFY)
async_engine = create_async_engine(
    async_db_url,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)
AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)


def get_db():
    """Dependency helper providing a synchronous database session."""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


async def get_async_db():
    """Dependency helper providing an asynchronous database session."""
    async with AsyncSessionLocal() as session:
        yield session
