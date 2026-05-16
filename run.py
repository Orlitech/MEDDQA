#!/usr/bin/env python3
"""
MedDQA System - Clinical Data Quality Assurance Platform
Multi-User Real-Time DQA & Care Card Reconciliation System
Auto-creates database tables on startup
Auto-configures Windows Firewall for network access
"""

# ============================================================================
# PATH SETUP FOR PYINSTALLER - MUST BE FIRST
# ============================================================================
import os
import sys
from pathlib import Path

def get_base_path():
    """Get the base path whether running as script or packaged executable"""
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    else:
        return os.path.dirname(os.path.abspath(__file__))

def get_resource_path(relative_path):
    """Get absolute path to resource, works for dev and for PyInstaller"""
    if getattr(sys, 'frozen', False):
        base_path = sys._MEIPASS
    else:
        base_path = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_path, relative_path)

BASE_PATH = Path(get_base_path())
RESOURCE_PATH = Path(get_resource_path(''))

if getattr(sys, 'frozen', False):
    sys.path.insert(0, str(BASE_PATH))
    sys.path.insert(0, str(RESOURCE_PATH))
else:
    sys.path.insert(0, str(Path(__file__).parent))

# ============================================================================
# CREATE REQUIRED DIRECTORIES
# ============================================================================
def ensure_directories():
    """Create all required directories"""
    dirs_to_create = ['logs', 'data', 'app/static', 'app/templates']
    for dir_path in dirs_to_create:
        Path(dir_path).mkdir(parents=True, exist_ok=True)
    
    if getattr(sys, 'frozen', False):
        for dir_path in dirs_to_create:
            p = Path(sys._MEIPASS) / dir_path
            p.mkdir(parents=True, exist_ok=True)

ensure_directories()

# ============================================================================
# SINGLE INSTANCE & PORT CONFLICT PREVENTION
# ============================================================================
import socket
import tempfile
import atexit

def ensure_single_instance():
    """Prevent multiple instances from running simultaneously"""
    lock_file = os.path.join(tempfile.gettempdir(), 'meddqa_system.lock')
    
    if os.path.exists(lock_file):
        try:
            with open(lock_file, 'r') as f:
                pid = f.read().strip()
                if pid and pid.isdigit():
                    if sys.platform == 'win32':
                        import subprocess
                        result = subprocess.run(
                            f'tasklist /FI "PID eq {pid}" /NH',
                            capture_output=True, text=True, shell=True
                        )
                        if str(pid) in result.stdout:
                            print("\n" + "=" * 60)
                            print("❌ MedDQA is already running!")
                            print("=" * 60)
                            print("\nPlease close the existing instance first.")
                            input("\nPress Enter to exit...")
                            return False
                    else:
                        try:
                            os.kill(int(pid), 0)
                            print("\n❌ MedDQA is already running!")
                            return False
                        except OSError:
                            pass
        except:
            pass
        
        try:
            os.remove(lock_file)
        except:
            pass
    
    try:
        with open(lock_file, 'w') as f:
            f.write(str(os.getpid()))
        atexit.register(lambda: cleanup_lock_file(lock_file))
        return True
    except:
        return True

def cleanup_lock_file(lock_file):
    try:
        if os.path.exists(lock_file):
            os.remove(lock_file)
    except:
        pass

def find_available_port(default_port=8000):
    """Find an available port"""
    for port in range(default_port, default_port + 50):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('0.0.0.0', port))
                return port
            except socket.error:
                continue
    return default_port

# Run instance check
if not ensure_single_instance():
    sys.exit(1)

AVAILABLE_PORT = find_available_port()
os.environ['MEDDQA_PORT'] = str(AVAILABLE_PORT)

if AVAILABLE_PORT != 8000:
    print(f"\n⚠️ Port 8000 was in use, using port {AVAILABLE_PORT}\n")

# ============================================================================
# GET LOCAL IP ADDRESS FOR NETWORK ACCESS
# ============================================================================
def get_local_ip():
    """Get the local network IP address"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        try:
            hostname = socket.gethostname()
            return socket.gethostbyname(hostname)
        except:
            return "127.0.0.1"

LOCAL_IP = get_local_ip()

# ============================================================================
# SETUP CHECK - NO AUTOMATIC .env CREATION
# ============================================================================

def is_setup_complete():
    """Check if proper configuration exists - NO DEFAULT CREATION"""
    env_file = BASE_PATH / '.env'
    
    if not env_file.exists():
        return False
    
    try:
        with open(env_file, 'r') as f:
            content = f.read()
        
        if 'EMR_DB_PASSWORD=postgres' in content:
            return False
        if 'DQA_DB_PASSWORD=postgres' in content:
            return False
        
        lines = content.split('\n')
        for line in lines:
            if line.startswith('EMR_DB_PASSWORD='):
                pwd = line.split('=', 1)[1].strip().strip("'").strip('"')
                if not pwd:
                    return False
            if line.startswith('DQA_DB_PASSWORD='):
                pwd = line.split('=', 1)[1].strip().strip("'").strip('"')
                if not pwd:
                    return False
        
        return True
    except:
        return False

# Display setup status
if not is_setup_complete():
    print("\n" + "=" * 60)
    print("🔧 FIRST TIME SETUP REQUIRED")
    print("=" * 60)
    print("\n📋 MedDQA needs PostgreSQL database configuration.")
    print("🌐 The web setup wizard will open automatically.")
    print("\n⚠️  You CANNOT use the application until setup is complete!")
    print("=" * 60 + "\n")
else:
    print("\n✓ Configuration found. Starting application...\n")
    print(f"🌐 Network Access: http://{LOCAL_IP}:{AVAILABLE_PORT}")
    print(f"🏠 Local Access: http://localhost:{AVAILABLE_PORT}\n")

# ============================================================================
# NOW IMPORT THE REST OF THE MODULES
# ============================================================================
import signal
import logging
import webbrowser
import threading
import time

try:
    import uvicorn
except ImportError:
    print("❌ uvicorn not found. Installing...")
    os.system(f"{sys.executable} -m pip install uvicorn")
    import uvicorn

# Load .env if it exists (for settings)
try:
    from dotenv import load_dotenv
    env_file = BASE_PATH / '.env'
    if env_file.exists():
        load_dotenv(str(env_file))
        print("✓ Loaded configuration from .env")
except:
    pass

# Import app modules with error handling
try:
    from app.config import settings
except ImportError:
    class Settings:
        VERSION = "1.0.0"
        DEBUG = False
        PORT = AVAILABLE_PORT
        HOST = "0.0.0.0"
        EMR_DB_HOST = os.getenv('EMR_DB_HOST', 'localhost')
        EMR_DB_PORT = int(os.getenv('EMR_DB_PORT', 5432))
        EMR_DB_NAME = os.getenv('EMR_DB_NAME', 'postgres')
        EMR_DB_USER = os.getenv('EMR_DB_USER', 'postgres')
        EMR_DB_PASSWORD = os.getenv('EMR_DB_PASSWORD', '')
        DQA_DB_HOST = os.getenv('DQA_DB_HOST', 'localhost')
        DQA_DB_PORT = int(os.getenv('DQA_DB_PORT', 5432))
        DQA_DB_NAME = os.getenv('DQA_DB_NAME', 'dqa_database')
        DQA_DB_USER = os.getenv('DQA_DB_USER', 'postgres')
        DQA_DB_PASSWORD = os.getenv('DQA_DB_PASSWORD', '')
    settings = Settings()

try:
    from app.database import init_dqa_database, emr_engine, dqa_engine, Base
except ImportError as e:
    print(f"⚠️ Could not import app.database: {e}")
    from sqlalchemy import create_engine
    emr_engine = create_engine('sqlite:///data/emr.db')
    dqa_engine = create_engine('sqlite:///data/dqa.db')
    Base = None
    def init_dqa_database():
        print("Initializing DQA database...")

try:
    from app.main import app
except ImportError as e:
    print(f"⚠️ Could not import app.main: {e}")
    from fastapi import FastAPI
    app = FastAPI(title="MedDQA Ultimate", version="1.0.0")
    
    @app.get("/")
    async def root():
        return {"message": "MedDQA Ultimate is running!", "status": "ok"}
    
    @app.get("/health")
    async def health():
        return {"status": "healthy", "port": AVAILABLE_PORT, "network_ip": LOCAL_IP}

# ============================================================================
# COLORED LOGGING
# ============================================================================

class Colors:
    """ANSI color codes for terminal output"""
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'
    MAGENTA = '\033[35m'
    WHITE_BOLD = '\033[1;37m'

class ColoredFormatter(logging.Formatter):
    """Custom formatter with colors for different log levels"""
    
    COLORS = {
        'DEBUG': '\033[36m',
        'INFO': '\033[32m',
        'WARNING': '\033[33m',
        'ERROR': '\033[31m',
        'CRITICAL': '\033[35m',
    }
    RESET = '\033[0m'
    
    def format(self, record):
        if record.levelname in self.COLORS:
            record.levelname = f"{self.COLORS[record.levelname]}{record.levelname}{self.RESET}"
        return super().format(record)

# ============================================================================
# LOGGING SETUP
# ============================================================================

def setup_logging():
    """Configure application logging with colors and file output"""
    log_format = '%(asctime)s │ %(levelname)-18s │ %(name)-25s │ %(message)s'
    date_format = '%Y-%m-%d %H:%M:%S'
    
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(ColoredFormatter(log_format, datefmt=date_format))
    console_handler.setLevel(logging.INFO)
    
    log_dir = Path('logs')
    log_dir.mkdir(exist_ok=True)
    
    file_handler = logging.FileHandler(
        log_dir / f'dqa_system.log',
        encoding='utf-8'
    )
    file_handler.setFormatter(logging.Formatter(
        '%(asctime)s | %(levelname)-8s | %(name)-25s | %(message)s',
        datefmt=date_format
    ))
    file_handler.setLevel(logging.DEBUG if settings.DEBUG else logging.INFO)
    
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG if settings.DEBUG else logging.INFO)
    root_logger.handlers.clear()
    root_logger.addHandler(console_handler)
    root_logger.addHandler(file_handler)
    
    logging.getLogger('sqlalchemy.engine').setLevel(logging.WARNING)
    logging.getLogger('sqlalchemy.pool').setLevel(logging.WARNING)
    logging.getLogger('urllib3').setLevel(logging.WARNING)
    logging.getLogger('uvicorn.access').setLevel(logging.WARNING)
    
    return logging.getLogger(__name__)

logger = setup_logging()

# ============================================================================
# BANNER AND UI
# ============================================================================

def print_banner():
    """Display the beautiful startup banner"""
    banner = f"""
{Colors.CYAN}
    ╔═══════════════════════════════════════════════════════════════╗
    ║                                                               ║
    ║     ███╗   ███╗ ███████╗ ██████╗  ██████╗   ██████╗   █████╗  ║
    ║     ████╗ ████║ ██╔════╝ ██╔══██╗ ██╔══██╗ ██╔═══██╗ ██╔══██╗ ║
    ║     ██╔████╔██║ █████╗   ██║  ██║ ██║  ██║ ██║   ██║ ███████║ ║
    ║     ██║╚██╔╝██║ ██╔══╝   ██║  ██║ ██║  ██║ ██║   ██║ ██╔══██║ ║
    ║     ██║ ╚═╝ ██║ ███████╗ ██████╔╝ ██████╔╝ ╚██████╔╝ ██║  ██║ ║
    ║     ╚═╝     ╚═╝ ╚══════╝ ╚═════╝  ╚═════╝   ╚═════╝  ╚═╝  ╚═╝ ║
    ║                                                               ║
    ║         🏥  Clinical Data Quality Assurance Platform  🏥      ║
    ║                     Version {settings.VERSION}                          ║
    ╚═══════════════════════════════════════════════════════════════╝
{Colors.ENDC}
    
{Colors.WHITE_BOLD}    ═══════════════════════════════════════════════════════{Colors.ENDC}
    """
    print(banner)

def print_status(message, status='info', indent=4):
    """Print a formatted status message"""
    prefix = ' ' * indent
    icons = {
        'info': f'{Colors.CYAN}ℹ{Colors.ENDC}',
        'success': f'{Colors.GREEN}✅{Colors.ENDC}',
        'error': f'{Colors.FAIL}❌{Colors.ENDC}',
        'warning': f'{Colors.WARNING}⚠️{Colors.ENDC}',
        'working': f'{Colors.BLUE}🔄{Colors.ENDC}',
    }
    icon = icons.get(status, icons['info'])
    print(f"{prefix}{icon}  {message}")

def print_section(title):
    """Print a section header"""
    print(f"\n{Colors.BOLD}{Colors.CYAN}  ┌─ {title} ─────────────────────────────────────────┐{Colors.ENDC}")

def print_section_end():
    """Print section footer"""
    print(f"{Colors.BOLD}{Colors.CYAN}  └────────────────────────────────────────────────────┘{Colors.ENDC}\n")

# ============================================================================
# GRACEFUL SHUTDOWN
# ============================================================================

def signal_handler(signum, frame):
    """Handle shutdown signals gracefully"""
    print(f"\n\n{Colors.WARNING}  📥 Shutting down MedDQA...{Colors.ENDC}\n")
    print_section("Shutting Down")
    try:
        print_status("Closing database connections...", 'working')
        if emr_engine: emr_engine.dispose()
        if dqa_engine: dqa_engine.dispose()
        print_status("Connections closed", 'success')
    except:
        pass
    print_section_end()
    
    lock_file = os.path.join(tempfile.gettempdir(), 'meddqa_system.lock')
    try:
        if os.path.exists(lock_file):
            os.remove(lock_file)
    except:
        pass
    
    print(f"\n{Colors.GREEN}  👋 MedDQA System stopped successfully{Colors.ENDC}\n")
    sys.exit(0)

# ============================================================================
# BROWSER AUTO-OPEN
# ============================================================================

def open_browser():
    """Open browser after a short delay to let server start"""
    def _open():
        time.sleep(2)
        url = f"http://localhost:{AVAILABLE_PORT}"
        if not is_setup_complete():
            url += "/setup"
        try:
            webbrowser.open(url)
            logger.info(f"Browser opened: {url}")
        except Exception as e:
            logger.info(f"Please open your browser and go to: {url}")
    threading.Thread(target=_open, daemon=True).start()

# ============================================================================
# AUTO-CHECK AND CREATE DATABASE TABLES
# ============================================================================

def check_and_create_tables():
    """
    Check if all required tables exist in the DQA database.
    If any table is missing, create it automatically.
    """
    if not is_setup_complete():
        return
    
    if not dqa_engine:
        print_status("DQA database not configured, skipping table check", 'warning')
        return
    
    try:
        from sqlalchemy import inspect, text
        
        print_section("Database Table Check")
        print_status("Checking DQA database tables...", 'working')
        
        inspector = inspect(dqa_engine)
        existing_tables = inspector.get_table_names()
        
        required_tables = ['care_card_records', 'dqa_audit_logs', 'correction_logs','lab_settings']
        missing_tables = [t for t in required_tables if t not in existing_tables]
        
        if missing_tables:
            print_status(f"Missing tables: {', '.join(missing_tables)}", 'warning')
            print_status("Creating missing tables...", 'working')
            
            try:
                from app.models.dqa_models import CareCardRecord, DQAAuditLog, CorrectionLog
                Base.metadata.create_all(bind=dqa_engine)
                
                inspector = inspect(dqa_engine)
                updated_tables = inspector.get_table_names()
                still_missing = [t for t in required_tables if t not in updated_tables]
                
                if still_missing:
                    print_status("Trying raw SQL creation...", 'working')
                    with dqa_engine.connect() as conn:
                        conn.execute(text("""
                            CREATE TABLE IF NOT EXISTS care_card_records (
                                id SERIAL PRIMARY KEY, uuid UUID DEFAULT gen_random_uuid(),
                                hospital_number VARCHAR(100) NOT NULL, person_uuid VARCHAR(100),
                                drug_pickups JSONB DEFAULT '[]'::jsonb,
                                viral_loads JSONB DEFAULT '[]'::jsonb,
                                enrollment_data JSONB DEFAULT '{}'::jsonb,
                                is_verified BOOLEAN DEFAULT FALSE, verified_by VARCHAR(200),
                                verified_at TIMESTAMP WITH TIME ZONE,
                                created_by VARCHAR(200), updated_by VARCHAR(200),
                                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                            )
                        """))
                        conn.execute(text("""
                            CREATE TABLE IF NOT EXISTS dqa_audit_logs (
                                id SERIAL PRIMARY KEY, uuid UUID DEFAULT gen_random_uuid(),
                                hospital_number VARCHAR(100) NOT NULL, person_uuid VARCHAR(100),
                                first_name VARCHAR(200), surname VARCHAR(200),
                                facility_name VARCHAR(300), state VARCHAR(100),
                                care_card_data JSONB, emr_snapshot JSONB,
                                validation_status VARCHAR(50),
                                discrepancies_found BOOLEAN DEFAULT FALSE,
                                issues_fixed INTEGER DEFAULT 0,
                                total_comparisons INTEGER DEFAULT 0,
                                matched_comparisons INTEGER DEFAULT 0,
                                user_name VARCHAR(200),
                                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                            )
                        """))
                        conn.execute(text("""
                            CREATE TABLE IF NOT EXISTS correction_logs (
                                id SERIAL PRIMARY KEY, uuid UUID DEFAULT gen_random_uuid(),
                                hospital_number VARCHAR(100), person_uuid VARCHAR(100),
                                field_corrected VARCHAR(200), old_value TEXT, new_value TEXT,
                                corrected_by VARCHAR(200), record_type VARCHAR(50),
                                audit_log_id INTEGER,
                                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                            )
                        """))
                        conn.execute(text("""
                            CREATE TABLE IF NOT EXISTS lab_settings (
                                id SERIAL PRIMARY KEY,
                                uuid UUID DEFAULT gen_random_uuid(),
                                pcr_lab_name VARCHAR(200) DEFAULT '',
                                facility_name VARCHAR(200) DEFAULT '',
                                clinician_name VARCHAR(200) DEFAULT '',
                                assayed_by_name VARCHAR(200) DEFAULT '',
                                approved_by_name VARCHAR(200) DEFAULT '',
                                collected_by_name VARCHAR(200) DEFAULT '',
                                created_by VARCHAR(200),
                                updated_by VARCHAR(200),
                                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                            )
                        """))

                        conn.commit()
                        print_status("Tables created via raw SQL", 'success')
            except Exception as create_error:
                print_status(f"Table creation error: {str(create_error)[:100]}", 'error')
            
            inspector = inspect(dqa_engine)
            final_tables = inspector.get_table_names()
            final_missing = [t for t in required_tables if t not in final_tables]
            
            if final_missing:
                print_status(f"CRITICAL: Still missing tables: {', '.join(final_missing)}", 'error')
            else:
                print_status("All required tables exist!", 'success')
        else:
            print_status("All required tables already exist!", 'success')
        
        print_section_end()
        
    except Exception as e:
        print_status(f"Table check error: {str(e)[:100]}", 'error')

# ============================================================================
# DATABASE INITIALIZATION
# ============================================================================

def initialize_databases():
    """Initialize databases if configuration exists"""
    if is_setup_complete():
        try:
            init_dqa_database()
            print_status("DQA database ready", 'success')
            return True
        except Exception as e:
            print_status(f"Database init warning: {str(e)[:100]}", 'warning')
            return False
    return False

# ============================================================================
# ✅ FIREWALL AUTO-CONFIGURATION (Windows) - FIXED WITH TIMEOUT
# ============================================================================

def check_and_create_firewall():
    """Check and automatically create firewall rules for Windows"""
    if sys.platform != 'win32':
        return
    
    try:
        import subprocess
        
        # Check if rule exists (with timeout)
        try:
            result = subprocess.run(
                'netsh advfirewall firewall show rule name="MedDQA"',
                capture_output=True, text=True, shell=True,
                timeout=5  # ✅ 5 second timeout
            )
            rule_exists = result.returncode == 0
        except subprocess.TimeoutExpired:
            print_status("⚠️ Firewall check timed out (may need Admin rights)", 'warning')
            print(f"  {Colors.CYAN}Manually run as Administrator:{Colors.ENDC}")
            print(f"  {Colors.CYAN}netsh advfirewall firewall add rule name=\"MedDQA\" dir=in action=allow protocol=TCP localport={AVAILABLE_PORT}{Colors.ENDC}")
            return
        except Exception:
            rule_exists = False
        
        if rule_exists:
            print_status("✅ Firewall rule already exists", 'success')
            return
        
        # Rule doesn't exist - try to create it
        print_status("Creating Windows Firewall rule...", 'working')
        
        try:
            create_result = subprocess.run(
                f'netsh advfirewall firewall add rule name="MedDQA" dir=in action=allow protocol=TCP localport={AVAILABLE_PORT}',
                capture_output=True, text=True, shell=True,
                timeout=10  # ✅ 10 second timeout
            )
            
            if create_result.returncode == 0:
                print_status(f"✅ Firewall rule created for port {AVAILABLE_PORT}", 'success')
            elif "Access is denied" in create_result.stderr or "administrator" in create_result.stderr.lower():
                print_status("⚠️ Admin rights required for firewall rule", 'warning')
                print(f"  {Colors.CYAN}Run PowerShell as Administrator and execute:{Colors.ENDC}")
                print(f"  {Colors.CYAN}netsh advfirewall firewall add rule name=\"MedDQA\" dir=in action=allow protocol=TCP localport={AVAILABLE_PORT}{Colors.ENDC}")
            else:
                print_status(f"⚠️ Firewall rule may not be needed", 'info')
        except subprocess.TimeoutExpired:
            print_status("⚠️ Firewall creation timed out", 'warning')
            print(f"  {Colors.CYAN}Run manually as Administrator:{Colors.ENDC}")
            print(f"  {Colors.CYAN}netsh advfirewall firewall add rule name=\"MedDQA\" dir=in action=allow protocol=TCP localport={AVAILABLE_PORT}{Colors.ENDC}")
        except Exception as e:
            print_status(f"⚠️ Firewall config skipped: {str(e)[:50]}", 'info')
            
    except Exception as e:
        logger.warning(f"Firewall check failed: {e}")
        # Don't block startup - just show message
        print_status("ℹ️ Firewall check skipped - network access may be limited", 'info')

# ============================================================================
# MAIN ENTRY POINT
# ============================================================================

def main():
    """Main application entry point"""
    
    # Setup signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Display banner
    print_banner()
    
    from datetime import datetime
    print(f"  {Colors.WHITE_BOLD}Started at:{Colors.ENDC} {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    if AVAILABLE_PORT != 8000:
        print(f"  {Colors.WARNING}⚠️ Port 8000 was in use, using port {AVAILABLE_PORT}{Colors.ENDC}")
    
    # Setup status
    if is_setup_complete():
        print(f"  {Colors.GREEN}✓ Database configured{Colors.ENDC}")
        initialize_databases()
        check_and_create_tables()
    else:
        print(f"  {Colors.WARNING}⚠️ Not configured - setup wizard will open{Colors.ENDC}")
    
    # ✅ AUTO-CREATE FIREWALL RULE
    check_and_create_firewall()
    
    # Server configuration
    print_section("Server Configuration")
    
    server_config = {
        "app": app,
        "host": "0.0.0.0",
        "port": AVAILABLE_PORT,
        "reload": False,
        "workers": 1,
        "log_level": "warning",
        "access_log": False,
        "loop": "auto",
        "proxy_headers": True,
        "forwarded_allow_ips": "*",
    }
    
    print_status(f"Environment: {'Development' if settings.DEBUG else 'Production'}", 'info')
    print_status(f"Port: {AVAILABLE_PORT}", 'info')
    print_status(f"Host: 0.0.0.0 (all network interfaces)", 'success')
    
    print_section_end()
    
    # Access URLs
    local_url = f"http://localhost:{AVAILABLE_PORT}"
    network_url = f"http://{LOCAL_IP}:{AVAILABLE_PORT}"
    api_docs = f"{local_url}/docs"
    setup_url = f"{local_url}/setup"
    
    if not is_setup_complete():
        print(f"""
{Colors.BOLD}{Colors.WARNING}  ╔═══════════════════════════════════════════════════════════════╗
  ║     After completing setup, RESTART this application              ║
  ╚═══════════════════════════════════════════════════════════════╝
{Colors.ENDC}
        """)
    
    print(f"""
{Colors.BOLD}{Colors.GREEN}  ╔═══════════════════════════════════════════════════════════════╗
  ║                   🚀  SERVER IS STARTING  🚀                   ║
  ║                                                               ║
  ║     Local:   {local_url:<40} ║
  ║     Network: {network_url:<40} ║
  ║     API:     {api_docs:<40} ║
  ║     Setup:   {setup_url:<40} ║
  ║                                                               ║
  ║     📡 Other PCs: {network_url}                          ║
  ║     Press CTRL+C to stop                                     ║
  ╚═══════════════════════════════════════════════════════════════╝
{Colors.ENDC}
    """)
    
    try:
        open_browser()
    except:
        pass
    
    try:
        uvicorn.run(**server_config)
    except KeyboardInterrupt:
        pass
    except Exception as e:
        logger.error(f"Server error: {str(e)}")
        print(f"\n{Colors.FAIL}Server error: {e}{Colors.ENDC}")
        input("Press Enter to exit...")
        sys.exit(1)

# ============================================================================
# RUN
# ============================================================================

if __name__ == "__main__":
    main()