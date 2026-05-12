#!/usr/bin/env python3
"""
MedDQA System - Clinical Data Quality Assurance Platform
Multi-User Real-Time DQA & Care Card Reconciliation System
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
                            capture_output=True, text=True
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
        # Try to get the actual network IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        try:
            # Fallback: get hostname IP
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
    
    # If no .env file exists, setup is NOT complete
    if not env_file.exists():
        return False
    
    # Check if .env has valid credentials (not defaults)
    try:
        with open(env_file, 'r') as f:
            content = f.read()
        
        # If it has default password 'postgres', setup is NOT complete
        if 'EMR_DB_PASSWORD=postgres' in content:
            return False
        if 'DQA_DB_PASSWORD=postgres' in content:
            return False
        
        # Check if passwords are not empty
        lines = content.split('\n')
        for line in lines:
            if line.startswith('EMR_DB_PASSWORD='):
                pwd = line.split('=', 1)[1].strip()
                if not pwd or pwd == '':
                    return False
            if line.startswith('DQA_DB_PASSWORD='):
                pwd = line.split('=', 1)[1].strip()
                if not pwd or pwd == '':
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
    from app.database import init_dqa_database, emr_engine, dqa_engine
except ImportError as e:
    print(f"⚠️ Could not import app.database: {e}")
    from sqlalchemy import create_engine
    emr_engine = create_engine('sqlite:///data/emr.db')
    dqa_engine = create_engine('sqlite:///data/dqa.db')
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
    
    # Console handler with colors
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(ColoredFormatter(log_format, datefmt=date_format))
    console_handler.setLevel(logging.INFO)
    
    # File handler for persistent logs
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
    
    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG if settings.DEBUG else logging.INFO)
    root_logger.handlers.clear()
    root_logger.addHandler(console_handler)
    root_logger.addHandler(file_handler)
    
    # Suppress verbose loggers
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
        emr_engine.dispose()
        dqa_engine.dispose()
        print_status("Connections closed", 'success')
    except Exception as e:
        pass
    
    print_section_end()
    
    # Clean up lock file
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
        
        # If setup is not complete, go to setup page
        if not is_setup_complete():
            url += "/setup"
        
        try:
            webbrowser.open(url)
            logger.info(f"Browser opened: {url}")
        except Exception as e:
            logger.info(f"Please open your browser and go to: {url}")
    
    threading.Thread(target=_open, daemon=True).start()

# ============================================================================
# DATABASE INITIALIZATION (only if configured)
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
# FIREWALL HELPER (Windows)
# ============================================================================

def check_firewall():
    """Check and suggest firewall rules for Windows"""
    if sys.platform == 'win32':
        try:
            import subprocess
            result = subprocess.run(
                f'netsh advfirewall firewall show rule name="MedDQA"',
                capture_output=True, text=True, shell=True
            )
            if result.returncode != 0:
                print_status(f"Firewall rule not found. Run this command to allow access:", 'warning')
                print(f"  {Colors.CYAN}netsh advfirewall firewall add rule name=\"MedDQA\" dir=in action=allow protocol=TCP localport={AVAILABLE_PORT}{Colors.ENDC}")
        except:
            pass

# ============================================================================
# MAIN ENTRY POINT
# ============================================================================

def main():
    """Main application entry point"""
    
    # Setup signal handlers for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Display banner
    print_banner()
    
    # Show current time
    from datetime import datetime
    print(f"  {Colors.WHITE_BOLD}Started at:{Colors.ENDC} {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    if AVAILABLE_PORT != 8000:
        print(f"  {Colors.WARNING}⚠️ Port 8000 was in use, using port {AVAILABLE_PORT}{Colors.ENDC}")
    
    # Show setup status
    if is_setup_complete():
        print(f"  {Colors.GREEN}✓ Database configured{Colors.ENDC}")
        initialize_databases()
    else:
        print(f"  {Colors.WARNING}⚠️ Not configured - setup wizard will open{Colors.ENDC}")
    
    # Server configuration - USE 0.0.0.0 FOR NETWORK ACCESS
    print_section("Server Configuration")
    
    server_config = {
        "app": app,
        "host": "0.0.0.0",  # ← Allows network access from other computers
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
    print_status(f"Workers: {server_config['workers']}", 'info')
    print_status(f"Debug Mode: {'ON' if settings.DEBUG else 'OFF'}", 'info')
    print_status(f"Port: {AVAILABLE_PORT}", 'info')
    print_status(f"Host: 0.0.0.0 (all network interfaces)", 'success')
    
    print_section_end()
    
    # Display access URLs
    local_url = f"http://localhost:{AVAILABLE_PORT}"
    network_url = f"http://{LOCAL_IP}:{AVAILABLE_PORT}"
    api_docs = f"{local_url}/docs"
    setup_url = f"{local_url}/setup"
    
    # Show restart notice if setup is not complete
    if not is_setup_complete():
        print(f"""
{Colors.BOLD}{Colors.WARNING}  ╔═══════════════════════════════════════════════════════════════╗
  ║                   ⚡ IMPORTANT NOTICE ⚡                       ║
  ║                                                               ║
  ║     After completing setup in the browser:                    ║
  ║     • Click 'Save Configuration'                              ║
  ║     • Then RESTART this application                           ║
  ║     • The new database credentials will take effect           ║
  ║                                                               ║
  ║     Press CTRL+C to stop, then run again                      ║
  ║                                                               ║
  ╚═══════════════════════════════════════════════════════════════╝
{Colors.ENDC}
        """)
    
    print(f"""
{Colors.BOLD}{Colors.GREEN}  ╔═══════════════════════════════════════════════════════════════╗
  ║                   🚀  SERVER IS STARTING  🚀                   ║
  ║                                                               ║
  ║     Local Access: {local_url:<39} ║
  ║     Network Access: {network_url:<38} ║
  ║                                                               ║
  ║     API Docs:     {api_docs:<39} ║
  ║     Setup:        {setup_url:<39} ║
  ║                                                               ║
  ║     📡 Share this URL with other computers on your network:   ║
  ║     {Colors.BOLD}{network_url}{Colors.ENDC}
  ║                                                               ║
  ║     Press CTRL+C to stop the server                          ║
  ║                                                               ║
  ╚═══════════════════════════════════════════════════════════════╝
{Colors.ENDC}
    """)
    
    # Check firewall (Windows)
    if sys.platform == 'win32':
        check_firewall()
    
    # Open browser automatically
    try:
        open_browser()
    except Exception as e:
        logger.info(f"Browser auto-open not available: {e}")
    
    # Start the server
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