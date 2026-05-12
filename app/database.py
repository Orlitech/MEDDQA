"""
MedDQA Database Configuration
Handles connections to both EMR and DQA databases
"""

from sqlalchemy import create_engine, text, inspect
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator, Dict, Any, Optional
from urllib.parse import quote_plus  # ✅ ADD THIS IMPORT
from app.config import settings
import logging

logger = logging.getLogger(__name__)

# ============================================================================
# DATABASE CONNECTION STRINGS
# ============================================================================

# ✅ URL-encode passwords to handle special characters (@, #, %, etc.)
emr_password_encoded = quote_plus(settings.EMR_DB_PASSWORD)
dqa_password_encoded = quote_plus(settings.DQA_DB_PASSWORD)

# EMR Database connection (Existing patient data)
EMR_DATABASE_URL = (
    f"postgresql://{settings.EMR_DB_USER}:{emr_password_encoded}"
    f"@{settings.EMR_DB_HOST}:{settings.EMR_DB_PORT}/{settings.EMR_DB_NAME}"
)

# DQA Database connection (New - for audit logs and reports)
DQA_DATABASE_URL = (
    f"postgresql://{settings.DQA_DB_USER}:{dqa_password_encoded}"
    f"@{settings.DQA_DB_HOST}:{settings.DQA_DB_PORT}/{settings.DQA_DB_NAME}"
)

# ============================================================================
# DATABASE ENGINES
# ============================================================================

# EMR Engine - Read/Write to existing EMR database
try:
    emr_engine = create_engine(
        EMR_DATABASE_URL,
        pool_size=20,
        max_overflow=40,
        pool_pre_ping=True,
        pool_recycle=3600,
        echo=False
    )
    logger.info("✅ EMR database engine created successfully")
except Exception as e:
    logger.error(f"❌ Failed to create EMR database engine: {e}")
    emr_engine = None

# DQA Engine - For DQA application data
try:
    dqa_engine = create_engine(
        DQA_DATABASE_URL,
        pool_size=20,
        max_overflow=40,
        pool_pre_ping=True,
        pool_recycle=3600,
        echo=False
    )
    logger.info("✅ DQA database engine created successfully")
except Exception as e:
    logger.warning(f"⚠️ DQA database engine not created yet: {e}")
    dqa_engine = None

# ============================================================================
# SESSION FACTORIES
# ============================================================================

EMRSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=emr_engine
) if emr_engine else None

DQASessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=dqa_engine
) if dqa_engine else None

# ============================================================================
# SQLALCHEMY BASE
# ============================================================================

Base = declarative_base()

# ============================================================================
# DEPENDENCY INJECTION FUNCTIONS
# ============================================================================

def get_emr_db() -> Generator[Session, None, None]:
    """
    Dependency to get EMR database session.
    Use this in FastAPI route dependencies.
    
    Yields:
        Session: SQLAlchemy database session
    """
    if not EMRSessionLocal:
        raise Exception("EMR database is not configured")
    
    db = EMRSessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_dqa_db() -> Generator[Session, None, None]:
    """
    Dependency to get DQA database session.
    Use this in FastAPI route dependencies.
    
    Yields:
        Session: SQLAlchemy database session
    """
    if not DQASessionLocal:
        raise Exception("DQA database is not initialized")
    
    db = DQASessionLocal()
    try:
        yield db
    finally:
        db.close()

# ============================================================================
# DATABASE INITIALIZATION
# ============================================================================

def init_dqa_database() -> bool:
    """
    Initialize the DQA database.
    Creates the database if it doesn't exist and creates all required tables.
    
    Returns:
        bool: True if successful, False otherwise
    
    Raises:
        Exception: If database creation fails due to permissions
    """
    try:
        # First, try to create the database if it doesn't exist
        _create_database_if_not_exists()
        
        # Now create all tables
        Base.metadata.create_all(bind=dqa_engine)
        
        logger.info("DQA database tables created successfully")
        return True
        
    except Exception as e:
        error_msg = str(e).lower()
        
        if "permission denied" in error_msg:
            raise Exception(
                f"Database permission denied. User '{settings.DQA_DB_USER}' "
                f"needs CREATE DATABASE permission on {settings.DQA_DB_HOST}."
            )
        elif "already exists" in error_msg:
            # Database exists, try to create tables
            try:
                Base.metadata.create_all(bind=dqa_engine)
                logger.info("DQA database already exists, tables created")
                return True
            except Exception as table_error:
                logger.error(f"Error creating tables: {table_error}")
                raise
        else:
            logger.error(f"Database initialization error: {e}")
            raise

def _create_database_if_not_exists():
    """
    Create the DQA database if it doesn't exist.
    Connects to 'postgres' database to check and create.
    """
    try:
        # ✅ URL-encode password for the default connection too
        dqa_password_encoded = quote_plus(settings.DQA_DB_PASSWORD)
        
        # Connect to default 'postgres' database to check/create DQA database
        default_url = (
            f"postgresql://{settings.DQA_DB_USER}:{dqa_password_encoded}"
            f"@{settings.DQA_DB_HOST}:{settings.DQA_DB_PORT}/postgres"
        )
        
        default_engine = create_engine(default_url, isolation_level="AUTOCOMMIT")
        
        with default_engine.connect() as conn:
            # Check if database exists
            result = conn.execute(
                text(f"SELECT 1 FROM pg_database WHERE datname = '{settings.DQA_DB_NAME}'")
            )
            
            if not result.fetchone():
                # Create the database
                conn.execute(text(f"CREATE DATABASE {settings.DQA_DB_NAME}"))
                logger.info(f"Created database: {settings.DQA_DB_NAME}")
            else:
                logger.info(f"Database already exists: {settings.DQA_DB_NAME}")
        
        default_engine.dispose()
        
    except Exception as e:
        logger.error(f"Error creating database: {e}")
        raise

# ============================================================================
# CONNECTION TESTING
# ============================================================================

def test_emr_connection(host: str, port: int, dbname: str, 
                        user: str, password: str) -> Dict[str, Any]:
    """
    Test EMR database connection and return detailed results.
    Used by the setup wizard to validate credentials.
    
    Args:
        host: Database host
        port: Database port
        dbname: Database name
        user: Database username
        password: Database password
    
    Returns:
        dict: Connection test results with success status and details
    """
    try:
        # ✅ URL-encode password for test connection
        encoded_password = quote_plus(password)
        
        connection_string = (
            f"postgresql://{user}:{encoded_password}@{host}:{port}/{dbname}"
        )
        test_engine = create_engine(
            connection_string,
            connect_args={'connect_timeout': 5}
        )
        
        with test_engine.connect() as conn:
            # Test basic connectivity
            result = conn.execute(text("SELECT 1 AS test"))
            result.fetchone()
            
            # Try to detect if it's an EMR database by checking for known tables
            emr_tables = []
            try:
                tables_result = conn.execute(text("""
                    SELECT table_name 
                    FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name IN (
                        'patient_person', 
                        'hiv_enrollment', 
                        'hiv_art_pharmacy',
                        'hiv_art_clinical',
                        'laboratory_result',
                        'laboratory_sample'
                    )
                    ORDER BY table_name
                """))
                emr_tables = [row[0] for row in tables_result]
            except Exception:
                pass
            
            # Get database size info
            db_info = {}
            try:
                size_result = conn.execute(text("""
                    SELECT 
                        pg_database_size(:dbname) AS size_bytes,
                        pg_size_pretty(pg_database_size(:dbname)) AS size_pretty
                """), {"dbname": dbname})
                row = size_result.fetchone()
                if row:
                    db_info = {
                        "size_bytes": row[0],
                        "size_pretty": row[1]
                    }
            except Exception:
                pass
        
        test_engine.dispose()
        
        return {
            "success": True,
            "message": "Connection successful! EMR tables detected." if emr_tables else "Connected, but no EMR tables found. Check database name.",
            "details": {
                "host": host,
                "port": port,
                "database": dbname,
                "emr_tables_found": emr_tables,
                "is_emr_database": len(emr_tables) > 0,
                "database_info": db_info
            }
        }
        
    except Exception as e:
        error_message = str(e)
        
        # Provide user-friendly error messages
        if "could not connect to server" in error_message.lower():
            friendly_message = (
                "Cannot reach the database server. "
                "Please check if PostgreSQL is running and the host/port are correct."
            )
        elif "password authentication failed" in error_message.lower():
            friendly_message = "Invalid username or password. Please check your credentials."
        elif "database" in error_message.lower() and "does not exist" in error_message.lower():
            friendly_message = f"Database '{dbname}' does not exist. Please check the database name."
        elif "timeout" in error_message.lower():
            friendly_message = "Connection timed out. Please check if the server is accessible."
        elif "connection refused" in error_message.lower():
            friendly_message = "Connection refused. Is PostgreSQL running on this host/port?"
        else:
            friendly_message = error_message
        
        return {
            "success": False,
            "message": friendly_message,
            "details": {
                "error": error_message,
                "host": host,
                "port": port
            }
        }

def check_setup_status() -> Dict[str, Any]:
    """
    Check the overall setup status of the application.
    
    Returns:
        dict: Setup status information
    """
    from pathlib import Path
    
    env_file = Path('.env')
    
    if not env_file.exists():
        return {
            "status": "not_configured",
            "message": "Configuration file not found. Please run the setup wizard.",
            "setup_required": True
        }
    
    # Try to connect to EMR
    try:
        result = test_emr_connection(
            settings.EMR_DB_HOST,
            settings.EMR_DB_PORT,
            settings.EMR_DB_NAME,
            settings.EMR_DB_USER,
            settings.EMR_DB_PASSWORD
        )
        
        if result['success']:
            # Check DQA database
            dqa_ok = False
            try:
                if dqa_engine:
                    with dqa_engine.connect() as conn:
                        conn.execute(text("SELECT 1"))
                    dqa_ok = True
            except Exception:
                pass
            
            return {
                "status": "ready" if dqa_ok else "dqa_pending",
                "message": "System is configured and ready" if dqa_ok else "DQA database needs initialization",
                "setup_required": False,
                "details": result.get('details', {})
            }
        else:
            return {
                "status": "connection_error",
                "message": result['message'],
                "setup_required": False
            }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
            "setup_required": False
        }

# ============================================================================
# HEALTH CHECK
# ============================================================================

def get_database_health() -> Dict[str, Any]:
    """
    Get health status of all database connections.
    
    Returns:
        dict: Health status for each database
    """
    health = {
        "emr_database": {"status": "unknown", "message": ""},
        "dqa_database": {"status": "unknown", "message": ""}
    }
    
    # Check EMR
    if emr_engine:
        try:
            with emr_engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            health["emr_database"] = {
                "status": "healthy",
                "message": f"Connected to {settings.EMR_DB_NAME}"
            }
        except Exception as e:
            health["emr_database"] = {
                "status": "unhealthy",
                "message": str(e)
            }
    else:
        health["emr_database"] = {
            "status": "not_configured",
            "message": "EMR engine not initialized"
        }
    
    # Check DQA
    if dqa_engine:
        try:
            with dqa_engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            health["dqa_database"] = {
                "status": "healthy",
                "message": f"Connected to {settings.DQA_DB_NAME}"
            }
        except Exception as e:
            health["dqa_database"] = {
                "status": "unhealthy",
                "message": str(e)
            }
    else:
        health["dqa_database"] = {
            "status": "not_configured",
            "message": "DQA engine not initialized"
        }
    
    return health


def create_dqa_tables():
    """Create all DQA tables if they don't exist"""
    try:
        # Import models to register them with Base
        from app.models.dqa_models import DQAAuditLog, CorrectionLog, CareCardRecord
        
        # Create all tables
        Base.metadata.create_all(bind=dqa_engine)
        
        # Verify tables were created
        inspector = inspect(dqa_engine)
        tables = inspector.get_table_names()
        
        logger.info(f"DQA tables created/verified: {tables}")
        return True
    except Exception as e:
        logger.error(f"Error creating DQA tables: {e}")
        return False