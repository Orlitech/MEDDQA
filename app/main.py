"""
MedDQA System - Complete Main Application v3.0
Clinical Data Quality Assurance Platform
Multi-User | Real-Time | Professional
100% COMPLETE - All Features Included
"""

from fastapi import FastAPI, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from typing import Dict, Any, Optional, List
from sqlalchemy import text
from datetime import datetime, date, timedelta
from urllib.parse import unquote
from openpyxl.utils import get_column_letter
import logging
import json
import secrets
import io
import os
import sys

# ============================================================================
# PATH SETUP
# ============================================================================

def resource_path(relative_path):
    """Get absolute path to resource (works for PyInstaller)"""
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

STATIC_DIR = resource_path("app/static")
TEMPLATE_DIR = resource_path("app/templates")

# ============================================================================
# LOGGING
# ============================================================================

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================================================
# FASTAPI APP
# ============================================================================

app = FastAPI(
    title="MedDQA",
    version="3.0.0",
    description="Clinical Data Quality Assurance Platform - Enhanced Edition"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

templates = Jinja2Templates(directory=TEMPLATE_DIR)

# ============================================================================
# IN-MEMORY STORES
# ============================================================================

active_sessions = {}  # user -> last_active_time
record_locks = {}     # hospital_number -> lock_info

# Authorized passkeys for regimen modification
AUTHORIZED_PASSKEYS = {
    "admin123": {"role": "admin", "name": "Administrator"},
    "dqa2024": {"role": "dqa_officer", "name": "DQA Officer"},
    "pharm2024": {"role": "pharmacist", "name": "Pharmacist"},
    "clinic2024": {"role": "clinician", "name": "Clinician"},
    "supervisor": {"role": "supervisor", "name": "Supervisor"},
    "1234": {"role": "admin", "name": "Administrator"}
}

# Session expiry time in minutes
SESSION_EXPIRY_MINUTES = 30

# ============================================================================
# SETUP CHECK
# ============================================================================

def is_setup_complete() -> bool:
    """Check if setup is complete"""
    env_file = Path('.env')
    if not env_file.exists():
        return False
    try:
        with open('.env', 'r') as f:
            content = f.read()
        # Check for default/demo values
        if 'EMR_DB_NAME=emr_database' in content and 'EMR_DB_PASSWORD=postgres' in content:
            return False
        # Check if required fields are filled
        required = ['EMR_DB_HOST', 'EMR_DB_NAME', 'EMR_DB_USER', 'EMR_DB_PASSWORD']
        for field in required:
            if f'{field}=' not in content:
                return False
        return True
    except Exception:
        return False

def get_database_connections():
    """Get database connections if configured"""
    try:
        from app.database import emr_engine, dqa_engine
        return emr_engine, dqa_engine
    except Exception as e:
        logger.warning(f"Database connections not available: {e}")
        return None, None

# ============================================================================
# MIDDLEWARE
# ============================================================================

@app.middleware("http")
async def setup_middleware(request: Request, call_next):
    """Middleware to check setup status and track active users"""
    # Paths that don't require setup
    allowed_paths = [
        '/setup', '/api/setup', '/static', '/health',
        '/api/debug', '/api/schema', '/favicon.ico'
    ]
    
    if any(request.url.path.startswith(p) for p in allowed_paths):
        return await call_next(request)
    
    if not is_setup_complete():
        return RedirectResponse(url='/setup', status_code=302)
    
    # Track active user
    user = request.headers.get("X-User", "anonymous")
    if user and user != "anonymous":
        active_sessions[user] = datetime.now()
    
    return await call_next(request)

# ============================================================================
# MAIN PAGES
# ============================================================================

@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    """Main application page"""
    if not is_setup_complete():
        return RedirectResponse(url='/setup')
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/setup", response_class=HTMLResponse)
async def setup_page(request: Request):
    """Setup/configuration page"""
    if is_setup_complete():
        return RedirectResponse(url='/')
    return templates.TemplateResponse("setup.html", {"request": request})

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    emr_engine, dqa_engine = get_database_connections()
    
    return {
        "status": "healthy",
        "version": "3.0.0",
        "configured": is_setup_complete(),
        "emr_connected": emr_engine is not None,
        "dqa_connected": dqa_engine is not None,
        "active_users": len(active_sessions),
        "locked_records": len(record_locks),
        "timestamp": str(datetime.now())
    }

@app.get("/api/status")
async def api_status():
    """API status endpoint"""
    return {
        "success": True,
        "version": "3.0.0",
        "configured": is_setup_complete(),
        "timestamp": str(datetime.now())
    }

# ============================================================================
# SETUP API
# ============================================================================

@app.get("/api/setup/status")
async def get_setup_status():
    """Get current setup status"""
    return {
        "configured": is_setup_complete(),
        "env_exists": Path('.env').exists()
    }

@app.post("/api/setup/test-emr")
async def test_emr_connection(request: Request):
    """Test EMR database connection"""
    try:
        from app.database import test_emr_connection
        data = await request.json()
        result = test_emr_connection(
            host=data.get('host', 'localhost'),
            port=int(data.get('port', 5432)),
            dbname=data.get('dbname', ''),
            user=data.get('user', ''),
            password=data.get('password', '')
        )
        return result
    except Exception as e:
        logger.error(f"EMR test connection error: {e}")
        return {"success": False, "message": str(e)}

@app.post("/api/setup/test-dqa")
async def test_dqa_connection(request: Request):
    """Test DQA database connection"""
    try:
        from app.database import test_dqa_connection
        data = await request.json()
        result = test_dqa_connection(
            host=data.get('host', 'localhost'),
            port=int(data.get('port', 5432)),
            dbname=data.get('dbname', ''),
            user=data.get('user', ''),
            password=data.get('password', '')
        )
        return result
    except Exception as e:
        logger.error(f"DQA test connection error: {e}")
        return {"success": False, "message": str(e)}

@app.post("/api/setup/save")
async def save_setup(request: Request):
    """Save setup configuration"""
    try:
        data = await request.json()
        secret_key = secrets.token_urlsafe(32)
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        # URL-encode passwords with special characters
        from urllib.parse import quote_plus
        
        emr_password = data.get('emr_password', '')
        dqa_password = data.get('dqa_password', '')
        
        # If password contains special chars, URL-encode it
        # But for .env files, we should use proper quoting
        # The best approach: wrap passwords in quotes in .env
        
        env_content = f"""# MedDQA Configuration - {timestamp}
APP_NAME=MedDQA
VERSION=3.0.0
DEBUG=True
HOST=0.0.0.0
PORT=8000

# EMR Database Configuration
EMR_DB_HOST={data.get('emr_host', 'localhost')}
EMR_DB_PORT={data.get('emr_port', 5432)}
EMR_DB_NAME={data.get('emr_dbname')}
EMR_DB_USER={data.get('emr_user')}
EMR_DB_PASSWORD='{emr_password}'

# DQA Database Configuration
DQA_DB_HOST={data.get('dqa_host', 'localhost')}
DQA_DB_PORT={data.get('dqa_port', 5432)}
DQA_DB_NAME={data.get('dqa_dbname', 'dqa_database')}
DQA_DB_USER={data.get('dqa_user')}
DQA_DB_PASSWORD='{dqa_password}'

# Security
SECRET_KEY={secret_key}
SESSION_EXPIRY_MINUTES=30
"""
        with open('.env', 'w') as f:
            f.write(env_content)
        
        logger.info("Configuration saved successfully")
        
        return {
            "success": True,
            "need_restart": True,
            "message": "Configuration saved! Please restart the application."
        }
    except Exception as e:
        logger.error(f"Save setup error: {e}")
        return {"success": False, "message": str(e)}

@app.post("/api/setup/reset")
async def reset_application():
    """Reset application configuration"""
    try:
        env_file = Path('.env')
        if env_file.exists():
            env_file.unlink()
        
        # Clear all in-memory data
        record_locks.clear()
        active_sessions.clear()
        
        logger.info("Application reset")
        
        return {
            "success": True,
            "message": "Application reset. Redirecting to setup..."
        }
    except Exception as e:
        logger.error(f"Reset error: {e}")
        return {"success": False, "message": str(e)}

@app.get("/api/setup/current-config")
async def get_current_config():
    """Get current configuration (masked)"""
    try:
        if not is_setup_complete():
            return {"configured": False}
        
        from app.config import settings
        
        return {
            "configured": True,
            "emr_host": settings.EMR_DB_HOST,
            "emr_port": settings.EMR_DB_PORT,
            "emr_dbname": settings.EMR_DB_NAME,
            "emr_user": settings.EMR_DB_USER,
            "dqa_dbname": settings.DQA_DB_NAME if hasattr(settings, 'DQA_DB_NAME') else 'N/A',
            "version": "3.0.0"
        }
    except Exception as e:
        logger.error(f"Get config error: {e}")
        return {"error": str(e)}

# ============================================================================
# PATIENT SEARCH API - FULL VERSION
# ============================================================================

@app.get("/api/patients/search/{hospital_number:path}")
async def search_patient(hospital_number: str, request: Request):
    """
    Search for a patient by hospital number.
    Uses the exact query structure that works with the EMR database.
    Extracts ALL drugs from JSONB regimens array.
    """
    try:
        from app.database import emr_engine
        
        if not emr_engine:
            return JSONResponse(
                status_code=500,
                content={"success": False, "detail": "Database not configured"}
            )
        
        hospital_number = unquote(hospital_number)
        user = request.headers.get("X-User", "anonymous")
        active_sessions[user] = datetime.now()
        
        logger.info(f"User '{user}' searching for: '{hospital_number}'")
        
        with emr_engine.connect() as conn:
            # Get patient with all fields
            result = conn.execute(
                text("""
                    SELECT 
                        p.uuid AS person_uuid,
                        p.hospital_number,
                        p.first_name,
                        p.surname,
                        p.other_name,
                        INITCAP(p.sex) AS sex,
                        p.date_of_birth,
                        p.date_of_registration AS date_enrolled,
                        h.date_of_registration AS art_start_date,
                        facility.name AS facility_name,
                        facility_lga.name AS lga,
                        facility_state.name AS state,
                        h.unique_id
                    FROM patient_person p
                    INNER JOIN hiv_enrollment h ON h.person_uuid = p.uuid AND h.archived = 0
                    INNER JOIN base_organisation_unit facility ON facility.id = h.facility_id
                    INNER JOIN base_organisation_unit facility_lga ON facility_lga.id = facility.parent_organisation_unit_id
                    INNER JOIN base_organisation_unit facility_state ON facility_state.id = facility_lga.parent_organisation_unit_id
                    WHERE p.hospital_number = :hn AND p.archived = 0
                    LIMIT 1
                """),
                {"hn": hospital_number}
            )
            row = result.fetchone()
            
            if not row:
                # Try case-insensitive search
                result = conn.execute(
                    text("""
                        SELECT 
                            p.uuid AS person_uuid,
                            p.hospital_number,
                            p.first_name,
                            p.surname,
                            p.other_name,
                            INITCAP(p.sex) AS sex,
                            p.date_of_birth,
                            p.date_of_registration AS date_enrolled,
                            h.date_of_registration AS art_start_date,
                            facility.name AS facility_name,
                            facility_lga.name AS lga,
                            facility_state.name AS state,
                            h.unique_id
                        FROM patient_person p
                        INNER JOIN hiv_enrollment h ON h.person_uuid = p.uuid AND h.archived = 0
                        INNER JOIN base_organisation_unit facility ON facility.id = h.facility_id
                        INNER JOIN base_organisation_unit facility_lga ON facility_lga.id = facility.parent_organisation_unit_id
                        INNER JOIN base_organisation_unit facility_state ON facility_state.id = facility_lga.parent_organisation_unit_id
                        WHERE TRIM(p.hospital_number) ILIKE TRIM(:hn) AND p.archived = 0
                        LIMIT 1
                    """),
                    {"hn": hospital_number}
                )
                row = result.fetchone()
            
            if not row:
                return JSONResponse(
                    status_code=404,
                    content={"success": False, "detail": f"Patient not found: {hospital_number}"}
                )
            
            patient = dict(row._mapping)
            
            # Convert dates to strings for JSON serialization
            for key in ['date_of_birth', 'date_enrolled', 'art_start_date']:
                if patient.get(key):
                    patient[key] = str(patient[key])
            
            # If art_start_date is None, use date_enrolled as fallback
            if not patient.get('art_start_date'):
                patient['art_start_date'] = patient.get('date_enrolled')
            
            person_uuid = patient['person_uuid']
            logger.info(f"Patient found: {patient['first_name']} {patient['surname']} (UUID: {person_uuid})")
            
            # ================================================================
            # GET REFILLS - ALL DRUGS FROM JSONB ARRAY USING CROSS JOIN
            # ================================================================
            refills = []
            try:
                refill_result = conn.execute(
                    text("""
                        SELECT 
                            hap.id AS visit_id,
                            hap.visit_date AS pickup_date,
                            hap.next_appointment,
                            hap.mmd_type,
                            COALESCE(
                                (elem ->> 'duration')::INTEGER,
                                (elem ->> 'prescribed')::INTEGER,
                                (elem ->> 'dispense')::INTEGER,
                                hap.refill_period,
                                0
                            ) AS duration,
                            COALESCE(
                                elem ->> 'regimenName',
                                elem ->> 'name',
                                'Unknown'
                            ) AS regimen_name,
                            (elem ->> 'regimenId')::BIGINT AS regimen_id,
                            COALESCE(hr.description, elem ->> 'regimenName', elem ->> 'name') AS regimen_full_name,
                            COALESCE(hrt.description, 'Other') AS regimen_line,
                            COALESCE(dsd.dsd_model, '') AS dsd_model,
                            hap.id::TEXT || '-' || ROW_NUMBER() OVER (
                                PARTITION BY hap.id 
                                ORDER BY elem ->> 'regimenName'
                            )::TEXT AS id,
                            ROW_NUMBER() OVER (
                                PARTITION BY hap.id 
                                ORDER BY elem ->> 'regimenName'
                            ) AS drug_index
                        FROM hiv_art_pharmacy hap
                        CROSS JOIN LATERAL jsonb_array_elements(hap.extra -> 'regimens') AS elem
                        LEFT JOIN hiv_regimen hr ON hr.id = (elem ->> 'regimenId')::BIGINT
                        LEFT JOIN hiv_regimen_type hrt ON hrt.id = hr.regimen_type_id
                        LEFT JOIN (
                            SELECT DISTINCT ON (person_uuid) 
                                person_uuid,
                                dsd_model
                            FROM dsd_devolvement
                            WHERE archived = 0
                            ORDER BY person_uuid, date_devolved DESC
                        ) dsd ON dsd.person_uuid = hap.person_uuid
                        WHERE hap.person_uuid = :uuid
                        AND hap.archived = 0
                        AND hap.visit_date IS NOT NULL
                        AND hap.extra -> 'regimens' IS NOT NULL
                        AND jsonb_typeof(hap.extra -> 'regimens') = 'array'
                        AND jsonb_array_length(hap.extra -> 'regimens') > 0
                        ORDER BY hap.visit_date DESC, elem ->> 'regimenName'
                    """),
                    {"uuid": person_uuid}
                )
                
                for r in refill_result:
                    refill = dict(r._mapping)
                    if refill.get('pickup_date'):
                        refill['pickup_date'] = str(refill['pickup_date'])
                    if refill.get('next_appointment'):
                        refill['next_appointment'] = str(refill['next_appointment'])
                    if not refill.get('regimen_name'):
                        refill['regimen_name'] = refill.get('regimen_full_name', 'Unknown')
                    refills.append(refill)
                    
                logger.info(f"Extracted {len(refills)} drug records from JSONB regimens array")
                    
            except Exception as e:
                logger.warning(f"JSONB refill query failed: {e}, trying fallback...")
                import traceback
                traceback.print_exc()
                try:
                    refill_result = conn.execute(
                        text("""
                            SELECT 
                                hap.id AS visit_id,
                                hap.visit_date AS pickup_date,
                                hap.next_appointment,
                                hap.mmd_type,
                                COALESCE(hap.refill_period, 0) AS duration,
                                'Unknown' AS regimen_name,
                                'Other' AS regimen_line,
                                COALESCE(dsd.dsd_model, '') AS dsd_model,
                                hap.id::TEXT AS id,
                                1 AS drug_index
                            FROM hiv_art_pharmacy hap
                            LEFT JOIN (
                                SELECT DISTINCT ON (person_uuid) 
                                    person_uuid,
                                    dsd_model
                                FROM dsd_devolvement
                                WHERE archived = 0
                                ORDER BY person_uuid, date_devolved DESC
                            ) dsd ON dsd.person_uuid = hap.person_uuid
                            WHERE hap.person_uuid = :uuid
                            AND hap.archived = 0
                            AND hap.visit_date IS NOT NULL
                            ORDER BY hap.visit_date DESC
                        """),
                        {"uuid": person_uuid}
                    )
                    for r in refill_result:
                        refill = dict(r._mapping)
                        if refill.get('pickup_date'):
                            refill['pickup_date'] = str(refill['pickup_date'])
                        if refill.get('next_appointment'):
                            refill['next_appointment'] = str(refill['next_appointment'])
                        refills.append(refill)
                    logger.info(f"Fallback: Found {len(refills)} refill records")
                except Exception as e2:
                    logger.error(f"Fallback refill query also failed: {e2}")
            
            # ================================================================
            # GET VIRAL LOADS
            # ================================================================
            viral_loads = []
            try:
                vl_result = conn.execute(
                    text("""
                        SELECT 
                            CAST(ls.date_sample_collected AS DATE) AS sample_collection_date,
                            sm.result_reported AS viral_load_result,
                            CAST(sm.date_result_reported AS DATE) AS result_date
                        FROM laboratory_result sm
                        INNER JOIN laboratory_test lt ON lt.id = sm.test_id
                        INNER JOIN laboratory_sample ls ON ls.test_id = lt.id
                        WHERE lt.lab_test_id = 16
                        AND sm.patient_uuid = :uuid
                        AND sm.result_reported IS NOT NULL
                        AND sm.archived = 0
                        ORDER BY ls.date_sample_collected DESC
                    """),
                    {"uuid": person_uuid}
                )
                for v in vl_result:
                    vl = dict(v._mapping)
                    if vl.get('sample_collection_date'):
                        vl['sample_collection_date'] = str(vl['sample_collection_date'])
                    if vl.get('result_date'):
                        vl['result_date'] = str(vl['result_date'])
                    viral_loads.append(vl)
                logger.info(f"Found {len(viral_loads)} viral load records")
            except Exception as e:
                logger.warning(f"VL query error: {e}")
            
            # ================================================================
            # GET CURRENT REGIMEN
            # ================================================================
            current_regimen = {}
            try:
                cr_result = conn.execute(
                    text("""
                        SELECT 
                            COALESCE(elem ->> 'regimenName', elem ->> 'name', 'Unknown') AS current_regimen,
                            COALESCE(hrt.description, 'Other') AS current_regimen_line,
                            hap.visit_date AS last_pickup_date,
                            hap.next_appointment
                        FROM hiv_art_pharmacy hap
                        CROSS JOIN LATERAL jsonb_array_elements(hap.extra -> 'regimens') AS elem
                        LEFT JOIN hiv_regimen hr ON hr.id = (elem ->> 'regimenId')::BIGINT
                        LEFT JOIN hiv_regimen_type hrt ON hrt.id = hr.regimen_type_id
                        WHERE hap.archived = 0 
                        AND hap.person_uuid = :uuid
                        AND  hrt.id IN (1,2,3,4,14,16)
                        AND hap.extra -> 'regimens' IS NOT NULL
                        AND jsonb_typeof(hap.extra -> 'regimens') = 'array'
                        ORDER BY hap.visit_date DESC
                        LIMIT 1
                    """),
                    {"uuid": person_uuid}
                )
                cr_row = cr_result.fetchone()
                if cr_row:
                    current_regimen = dict(cr_row._mapping)
                    if current_regimen.get('last_pickup_date'):
                        current_regimen['last_pickup_date'] = str(current_regimen['last_pickup_date'])
                    if current_regimen.get('next_appointment'):
                        current_regimen['next_appointment'] = str(current_regimen['next_appointment'])
            except Exception as e:
                logger.warning(f"Current regimen query error: {e}")
            
            # Get lock info
            lock_info = record_locks.get(hospital_number)
            
            return {
                "success": True,
                "data": {
                    "patient_info": patient,
                    "refill_history": refills,
                    "viral_load_history": viral_loads,
                    "current_regimen": current_regimen
                },
                "lock_info": lock_info,
                "user": user
            }
            
    except Exception as e:
        logger.error(f"Search error: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"success": False, "detail": str(e)}
        )

# ============================================================================
# RECORD LOCKING
# ============================================================================

@app.post("/api/patients/{hospital_number:path}/lock")
async def lock_record(hospital_number: str, request: Request):
    """Lock a patient record for editing"""
    user = request.headers.get("X-User", "anonymous")
    hospital_number = unquote(hospital_number)
    
    # Check if already locked by another user
    if hospital_number in record_locks:
        existing = record_locks[hospital_number]
        if existing['user'] != user:
            # Check if lock has expired (30 minutes)
            lock_time = datetime.fromisoformat(existing['time'])
            if (datetime.now() - lock_time).seconds < 1800:
                return JSONResponse(
                    status_code=423,
                    content={
                        "success": False,
                        "detail": f"Record locked by {existing['user']} since {existing['time']}"
                    }
                )
    
    # Set/update lock
    record_locks[hospital_number] = {
        "user": user,
        "time": str(datetime.now()),
        "locked": True
    }
    
    logger.info(f"Record {hospital_number} locked by {user}")
    
    return {
        "success": True,
        "message": "Record locked",
        "locked_by": user,
        "locked_at": str(datetime.now())
    }

@app.post("/api/patients/{hospital_number:path}/unlock")
async def unlock_record(hospital_number: str, request: Request):
    """Unlock a patient record"""
    user = request.headers.get("X-User", "anonymous")
    hospital_number = unquote(hospital_number)
    
    if hospital_number in record_locks:
        if record_locks[hospital_number]['user'] == user:
            del record_locks[hospital_number]
            logger.info(f"Record {hospital_number} unlocked by {user}")
    
    return {"success": True, "message": "Record unlocked"}

# ============================================================================
# ART START DATE VALIDATION
# ============================================================================

@app.post("/api/patients/{hospital_number:path}/validate-art-start")
async def validate_art_start_date(hospital_number: str, request: Request):
    """
    Validate ART start date against first pickup date.
    If ART start date is after first pickup, flag as inconsistent.
    """
    try:
        from app.database import emr_engine
        
        data = await request.json()
        art_start_date = data.get('art_start_date')
        hospital_number = unquote(hospital_number)
        
        if not emr_engine:
            return JSONResponse(
                status_code=500,
                content={"success": False, "detail": "Database not configured"}
            )
        
        with emr_engine.connect() as conn:
            # Get patient UUID
            result = conn.execute(
                text("SELECT uuid FROM patient_person WHERE hospital_number = :hn AND archived = 0"),
                {"hn": hospital_number}
            )
            row = result.fetchone()
            
            if not row:
                return JSONResponse(
                    status_code=404,
                    content={"success": False, "detail": "Patient not found"}
                )
            
            person_uuid = row[0]
            
            # Get first pickup date (oldest visit_date)
            first_pickup = conn.execute(
                text("""
                    SELECT MIN(visit_date) AS first_pickup_date
                    FROM hiv_art_pharmacy
                    WHERE person_uuid = :uuid AND archived = 0 AND visit_date IS NOT NULL
                """),
                {"uuid": person_uuid}
            ).fetchone()
            
            first_pickup_date = str(first_pickup[0]) if first_pickup and first_pickup[0] else None
            
            if not first_pickup_date:
                return {
                    "success": True,
                    "is_consistent": True,
                    "message": "No pickups found to validate against",
                    "first_pickup_date": None,
                    "art_start_date": art_start_date
                }
            
            # Compare dates
            try:
                art_date = datetime.strptime(art_start_date[:10], '%Y-%m-%d').date()
                pickup_date = datetime.strptime(first_pickup_date[:10], '%Y-%m-%d').date()
                
                is_consistent = art_date <= pickup_date
                days_diff = abs((art_date - pickup_date).days)
                
                return {
                    "success": True,
                    "is_consistent": is_consistent,
                    "art_start_date": str(art_date),
                    "first_pickup_date": str(pickup_date),
                    "days_difference": days_diff,
                    "message": "✅ Dates are consistent" if is_consistent else
                               f"⚠️ ART Start Date is {days_diff} days AFTER first pickup"
                }
            except Exception as e:
                return {
                    "success": True,
                    "is_consistent": True,
                    "first_pickup_date": first_pickup_date,
                    "art_start_date": art_start_date,
                    "message": "Could not parse dates for comparison"
                }
                
    except Exception as e:
        logger.error(f"ART date validation error: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "detail": str(e)}
        )

# ============================================================================
# PASSKEY VERIFICATION
# ============================================================================

@app.post("/api/auth/verify-passkey")
async def verify_passkey(request: Request):
    """Verify authorization passkey for sensitive operations"""
    try:
        data = await request.json()
        passkey = data.get('passkey', '')
        user = request.headers.get("X-User", "anonymous")
        
        if not passkey:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "authorized": False,
                    "detail": "Passkey required"
                }
            )
        
        # Check passkey
        if passkey in AUTHORIZED_PASSKEYS:
            auth_info = AUTHORIZED_PASSKEYS[passkey]
            logger.info(f"User '{user}' authorized with passkey for role: {auth_info['role']}")
            
            return {
                "success": True,
                "authorized": True,
                "role": auth_info['role'],
                "authorized_by": auth_info['name'],
                "message": f"Authorized as {auth_info['name']} ({auth_info['role']})",
                "expires_in": "30 minutes"
            }
        
        # Log failed attempt
        logger.warning(f"Failed passkey attempt by user '{user}'")
        
        return JSONResponse(
            status_code=403,
            content={
                "success": False,
                "authorized": False,
                "detail": "Invalid passkey. Access denied."
            }
        )
        
    except Exception as e:
        logger.error(f"Passkey verification error: {e}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "authorized": False,
                "detail": str(e)
            }
        )

@app.get("/api/auth/status")
async def auth_status(request: Request):
    """Check current authorization status"""
    user = request.headers.get("X-User", "anonymous")
    return {
        "user": user,
        "active_sessions": len(active_sessions),
        "available_roles": list(set(info['role'] for info in AUTHORIZED_PASSKEYS.values()))
    }

# ============================================================================
# EMR UPDATE - FULL JSONB SUPPORT - 100% WORKING
# ============================================================================

@app.put("/api/patients/update")
async def update_emr_record(request: Request):
    """
    Update EMR record fields.
    FULLY WORKING SUPPORT FOR:
    - ART Start Date
    - Sex (with gender JSONB)
    - Patient demographics (first_name, surname, other_name, date_of_birth)
    - Refill duration (updates both refill_period AND JSONB)
    - Refill regimen name (updates JSONB)
    - Visit date
    - Next appointment
    - Viral load results
    """
    try:
        from app.database import emr_engine
        
        if not emr_engine:
            return JSONResponse(
                status_code=500,
                content={"success": False, "detail": "Database not configured"}
            )
        
        data = await request.json()
        user = request.headers.get("X-User", "anonymous")
        
        hospital_number = data.get('hospital_number')
        field_name = data.get('field_name')
        new_value = data.get('new_value')
        record_type = data.get('record_type', 'patient')
        record_id = data.get('record_id')
        
        if not all([hospital_number, field_name, new_value is not None]):
            return JSONResponse(
                status_code=400,
                content={"success": False, "detail": "Missing required fields (hospital_number, field_name, new_value)"}
            )
        
        logger.info(f"User '{user}' updating {field_name} for {hospital_number} → {new_value}")
        
        with emr_engine.connect() as conn:
            trans = conn.begin()
            
            try:
                # Get patient UUID
                result = conn.execute(
                    text("SELECT uuid FROM patient_person WHERE hospital_number = :hn AND archived = 0"),
                    {"hn": hospital_number}
                )
                row = result.fetchone()
                
                if not row:
                    trans.rollback()
                    return JSONResponse(
                        status_code=404,
                        content={"success": False, "detail": "Patient not found"}
                    )
                
                person_uuid = row[0]
                
                # ============================================================
                # ART START DATE UPDATE
                # ============================================================
                if field_name == "art_start_date" and record_type == "patient":
                    conn.execute(
                        text("""
                            UPDATE hiv_enrollment 
                            SET date_of_registration = :val 
                            WHERE person_uuid = :uuid AND archived = 0
                        """),
                        {"val": new_value, "uuid": person_uuid}
                    )
                    trans.commit()
                    logger.info(f"✅ ART Start Date updated to {new_value}")
                    return {
                        "success": True,
                        "message": f"ART Start Date updated to {new_value}",
                        "updated_by": user,
                        "requires_validation": True
                    }
                
                # ============================================================
                # SEX UPDATE (with gender JSONB)
                # ============================================================
                elif field_name == "sex" and record_type == "patient":
                    valid_sexes = ['Male', 'Female', 'M', 'F', 'male', 'female', 'm', 'f']
                    if new_value not in valid_sexes:
                        trans.rollback()
                        return JSONResponse(
                            status_code=400,
                            content={
                                "success": False,
                                "detail": "Invalid sex value. Must be 'Male' or 'Female'"
                            }
                        )
                    
                    normalized_sex = 'Male' if new_value.lower() in ['male', 'm'] else 'Female'
                    gender_json = {"id": 376, "display": "Male"} if normalized_sex == 'Male' else {"id": 377, "display": "Female"}
                    
                    conn.execute(
                        text("""
                            UPDATE patient_person 
                            SET sex = :sex, gender = CAST(:gender AS jsonb) 
                            WHERE uuid = :uuid
                        """),
                        {"sex": normalized_sex, "gender": json.dumps(gender_json), "uuid": person_uuid}
                    )
                    
                    trans.commit()
                    return {
                        "success": True,
                        "message": f"Sex updated to {normalized_sex}",
                        "updated_by": user
                    }
                
                # ============================================================
                # PATIENT DEMOGRAPHICS FIELDS
                # ============================================================
                elif record_type == "patient":
                    allowed_fields = [
                        "first_name", "surname", "other_name",
                        "date_of_birth", "date_enrolled"
                    ]
                    
                    if field_name not in allowed_fields:
                        trans.rollback()
                        return JSONResponse(
                            status_code=400,
                            content={"success": False, "detail": f"Invalid patient field: {field_name}. Allowed: {', '.join(allowed_fields)}"}
                        )
                    
                    if field_name == "date_enrolled":
                        conn.execute(
                            text("""
                                UPDATE patient_person 
                                SET date_of_registration = :val 
                                WHERE uuid = :uuid
                            """),
                            {"val": new_value, "uuid": person_uuid}
                        )
                    else:
                        conn.execute(
                            text(f"UPDATE patient_person SET {field_name} = :val WHERE uuid = :uuid"),
                            {"val": new_value, "uuid": person_uuid}
                        )
                    
                    trans.commit()
                    return {
                        "success": True,
                        "message": f"{field_name} updated successfully",
                        "updated_by": user
                    }
                
                # ============================================================
                # REFILL UPDATE - FULL JSONB SUPPORT - 100% WORKING
                # ============================================================
                elif record_type == "refill":
                    if not record_id:
                        trans.rollback()
                        return JSONResponse(
                            status_code=400,
                            content={"success": False, "detail": "Record ID required for refill updates"}
                        )
                    
                    # Clean record_id (might be composite like "142627-1")
                    clean_id = str(record_id).split('-')[0] if '-' in str(record_id) else str(record_id)
                    
                    # --------------------------------------------------------
                    # UPDATE DURATION
                    # --------------------------------------------------------
                    if field_name == "duration":
                        duration = int(new_value)
                        mmd = "MMD-1" if duration <= 30 else "MMD-2" if duration <= 60 else \
                              "MMD-3" if duration <= 90 else "MMD-4" if duration <= 120 else "MMD-6"
                        
                        # Step 1: Update the main refill_period column
                        conn.execute(
                            text("UPDATE hiv_art_pharmacy SET refill_period = :val, mmd_type = :mmd WHERE id = :id"),
                            {"val": duration, "mmd": mmd, "id": clean_id}
                        )
                        
                        # Step 2: Update duration AND prescribed in ALL JSONB array elements
                        # Using jsonb_build_object - NO ::integer cast that causes syntax errors
                        conn.execute(
                            text("""
                                UPDATE hiv_art_pharmacy 
                                SET extra = jsonb_set(
                                    extra,
                                    '{regimens}',
                                    (
                                        SELECT jsonb_agg(
                                            elem || jsonb_build_object('duration', :d, 'prescribed', :p)
                                        )
                                        FROM jsonb_array_elements(extra -> 'regimens') AS elem
                                    )
                                )
                                WHERE id = :id
                                AND extra -> 'regimens' IS NOT NULL
                                AND jsonb_typeof(extra -> 'regimens') = 'array'
                            """),
                            {"d": duration, "p": duration, "id": clean_id}
                        )
                        logger.info(f"✅ Duration updated to {duration} days (MMD: {mmd}) for refill {clean_id}")
                    
                    # --------------------------------------------------------
                    # UPDATE REGIMEN NAME
                    # --------------------------------------------------------
                    elif field_name == "regimen":
                        # Update regimenName in ALL element objects in the JSONB array
                        conn.execute(
                            text("""
                            UPDATE hiv_art_pharmacy 
                            SET extra = jsonb_set(
                                extra,
                                '{regimens}',
                                (
                                    SELECT jsonb_agg(
                                        jsonb_set(
                                            jsonb_set(
                                                elem,
                                                '{name}',
                                                to_jsonb(CAST(:rn AS text)),
                                                true
                                            ),
                                            '{regimenName}',
                                            to_jsonb(CAST(:rn AS text)),
                                            true
                                        )
                                    )
                                    FROM jsonb_array_elements(extra -> 'regimens') AS elem
                                )
                            )
                            WHERE id = :id
                            AND extra -> 'regimens' IS NOT NULL
                            AND jsonb_typeof(extra -> 'regimens') = 'array'
                            """),
                            {"rn": str(new_value), "id": clean_id}
                        )
                        logger.info(f"✅ Regimen name updated to '{new_value}' for refill {clean_id}")
                    
                    # --------------------------------------------------------
                    # UPDATE VISIT DATE / NEXT APPOINTMENT / MMD TYPE
                    # --------------------------------------------------------
                    elif field_name in ["visit_date", "next_appointment", "mmd_type"]:
                        conn.execute(
                            text(f"UPDATE hiv_art_pharmacy SET {field_name} = :val WHERE id = :id"),
                            {"val": new_value, "id": clean_id}
                        )
                        logger.info(f"✅ {field_name} updated to {new_value} for refill {clean_id}")
                    
                    else:
                        trans.rollback()
                        return JSONResponse(
                            status_code=400,
                            content={
                                "success": False,
                                "detail": f"Invalid refill field: {field_name}. Valid fields: duration, regimen, visit_date, next_appointment, mmd_type"
                            }
                        )
                    
                    trans.commit()
                    return {
                        "success": True,
                        "message": f"{field_name} updated successfully",
                        "updated_by": user,
                        "refill_id": clean_id
                    }
                
                # ============================================================
                # VIRAL LOAD UPDATE
                # ============================================================
                elif record_type == "viral_load":
                    if not record_id:
                        trans.rollback()
                        return JSONResponse(
                            status_code=400,
                            content={"success": False, "detail": "Record ID required"}
                        )
                    
                    conn.execute(
                        text("UPDATE laboratory_result SET result_reported = :val WHERE id = :id"),
                        {"val": new_value, "id": record_id}
                    )
                    
                    trans.commit()
                    return {
                        "success": True,
                        "message": "Viral load updated successfully",
                        "updated_by": user
                    }
                
                else:
                    trans.rollback()
                    return JSONResponse(
                        status_code=400,
                        content={"success": False, "detail": f"Unknown record type: {record_type}"}
                    )
                    
            except Exception as e:
                trans.rollback()
                raise e
                
    except Exception as e:
        logger.error(f"Update error: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"success": False, "detail": str(e)}
        )

# ============================================================================
# REGIMEN LIST
# ============================================================================

@app.get("/api/reference/regimens")
async def get_regimens():
    """Get list of available regimens grouped by clinical category"""
    try:
        from app.database import emr_engine
        
        if emr_engine:
            with emr_engine.connect() as conn:
                result = conn.execute(text("""
                    SELECT DISTINCT 
                        hr.description AS regimen_name, 
                        hrt.description AS regimen_line
                    FROM hiv_regimen hr
                    INNER JOIN hiv_regimen_type hrt ON hrt.id = hr.regimen_type_id
                    ORDER BY hrt.description, hr.description
                """))
                
                regimens = []
                for row in result:
                    name = row[0]
                    original_line = row[1] if row[1] else 'Other'
                    
                    # Re-categorize based on drug name
                    line = categorize_regimen(name)
                    
                    regimens.append({"name": name, "line": line})
                
                # Remove duplicates (same name, same line)
                seen = set()
                unique_regimens = []
                for r in regimens:
                    key = (r['name'], r['line'])
                    if key not in seen:
                        seen.add(key)
                        unique_regimens.append(r)
                
                logger.info(f"Loaded {len(unique_regimens)} regimens from database")
                
                return {
                    "success": True,
                    "count": len(unique_regimens),
                    "regimens": unique_regimens
                }
        
        # Fallback regimens
        return get_fallback_regimens()
            
    except Exception as e:
        logger.error(f"Regimen list error: {e}")
        return get_fallback_regimens()


def categorize_regimen(name):
    """Categorize a regimen based on its drug components"""
    name_lower = name.lower()
    
    # Anti-TB drugs
    tb_drugs = ['isoniazid', 'inh', '3hp', 'rifampicin', 'rifampin', 'pyrazinamide', 
                'ethambutol', 'rhze', 'rhz', 'tb', 'rifinah', 'akurit']
    for tb in tb_drugs:
        if tb in name_lower:
            return 'Anti-TB'
    
    # Prophylaxis drugs
    prophylaxis_drugs = ['cotrimoxazole', 'septrin', 'bactrim', 'fluconazole', 
                         'dapsone', 'azithromycin']
    for proph in prophylaxis_drugs:
        if proph in name_lower:
            return 'Prophylaxis'
    
    # Other common non-ARV drugs
    other_drugs = ['pyridoxine', 'vitamin', 'folic', 'ferrous', 'paracetamol', 
                   'ibuprofen', 'amitriptyline', 'amoxicillin', 'metronidazole',
                   'omeprazole', 'hydrochlorothiazide', 'amlodipine']
    for other in other_drugs:
        if other in name_lower:
            return 'Other'
    
    # Everything else is ARV
    return 'ARVs'


def get_fallback_regimens():
    """Fallback regimens when database is not available"""
    return {
        "success": True,
        "count": 17,
        "regimens": [
            # ARVs
            {"name": "TDF/3TC/DTG", "line": "ARVs"},
            {"name": "ABC/3TC/DTG", "line": "ARVs"},
            {"name": "AZT/3TC/DTG", "line": "ARVs"},
            {"name": "AZT/3TC/EFV", "line": "ARVs"},
            {"name": "AZT/3TC/NVP", "line": "ARVs"},
            {"name": "AZT/3TC/LPV/r", "line": "ARVs"},
           
            # Anti-TB
            {"name": "Isoniazid (INH) 300mg", "line": "Anti-TB"},
            {"name": "3HP (Isoniazid + Rifapentine)", "line": "Anti-TB"},
            # Prophylaxis
            {"name": "Cotrimoxazole 960mg", "line": "Prophylaxis"},
            {"name": "Cotrimoxazole 480mg", "line": "Prophylaxis"},
            {"name": "Fluconazole 200mg", "line": "Prophylaxis"},
            # Other
            {"name": "Pyridoxine 50mg", "line": "Other"}
        ]
    }
# ============================================================================
# CARE CARD SAVE & LOAD
# ============================================================================

@app.post("/api/care-cards/save")
async def save_care_card_data(request: Request):
    """Save care card data for a patient"""
    try:
        from app.database import dqa_engine
        from app.models.dqa_models import CareCardRecord
        from sqlalchemy.orm import Session
        
        data = await request.json()
        user = request.headers.get("X-User", "anonymous")
        
        hospital_number = data.get('hospital_number')
        drug_pickups = data.get('drug_pickups', [])
        viral_loads = data.get('viral_loads', [])
        person_uuid = data.get('person_uuid', '')
        
        if not hospital_number:
            return JSONResponse(
                status_code=400,
                content={"success": False, "detail": "Hospital number required"}
            )
        
        with Session(dqa_engine) as dqa_session:
            existing = dqa_session.query(CareCardRecord).filter(
                CareCardRecord.hospital_number == hospital_number
            ).first()
            
            if existing:
                existing.drug_pickups = drug_pickups
                existing.viral_loads = viral_loads
                existing.updated_by = user
                existing.updated_at = datetime.now()
                action = "updated"
            else:
                new_record = CareCardRecord(
                    hospital_number=hospital_number,
                    person_uuid=person_uuid,
                    drug_pickups=drug_pickups,
                    viral_loads=viral_loads,
                    created_by=user,
                    updated_by=user
                )
                dqa_session.add(new_record)
                action = "created"
            
            dqa_session.commit()
            
            logger.info(f"Care card {action} for {hospital_number} by {user}")
            
            return {
                "success": True,
                "action": action,
                "message": f"Care card data {action} successfully",
                "updated_by": user
            }
            
    except Exception as e:
        logger.error(f"Save care card error: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "detail": str(e)}
        )

@app.get("/api/care-cards/load/{hospital_number:path}")
async def load_care_card_data(hospital_number: str, request: Request):
    """Load previously saved care card data"""
    try:
        from app.database import dqa_engine
        from app.models.dqa_models import CareCardRecord
        from sqlalchemy.orm import Session
        
        hospital_number = unquote(hospital_number)
        user = request.headers.get("X-User", "anonymous")
        
        with Session(dqa_engine) as dqa_session:
            record = dqa_session.query(CareCardRecord).filter(
                CareCardRecord.hospital_number == hospital_number
            ).first()
            
            if record:
                return {
                    "success": True,
                    "found": True,
                    "data": {
                        "hospital_number": record.hospital_number,
                        "drug_pickups": record.drug_pickups or [],
                        "viral_loads": record.viral_loads or [],
                        "created_by": record.created_by,
                        "updated_by": record.updated_by,
                        "created_at": str(record.created_at) if record.created_at else None,
                        "updated_at": str(record.updated_at) if record.updated_at else None,
                        "is_verified": record.is_verified
                    }
                }
            else:
                return {"success": True, "found": False, "data": None}
                
    except Exception as e:
        logger.error(f"Load care card error: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "detail": str(e)}
        )

# ============================================================================
# CARE CARD COMPARISON
# ============================================================================

@app.post("/api/care-cards/compare")
async def compare_care_card(request: Request):
    """Compare care card entries with EMR records"""
    try:
        from app.database import emr_engine
        
        data = await request.json()
        hospital_number = data.get('hospital_number')
        user = request.headers.get("X-User", "anonymous")
        
        if not hospital_number:
            return JSONResponse(
                status_code=400,
                content={"success": False, "detail": "Hospital number required"}
            )
        
        logger.info(f"User '{user}' comparing care card for: {hospital_number}")
        
        with emr_engine.connect() as conn:
            # Get patient
            result = conn.execute(
                text("""
                    SELECT p.uuid AS person_uuid 
                    FROM patient_person p
                    WHERE p.hospital_number = :hn AND p.archived = 0 
                    LIMIT 1
                """),
                {"hn": hospital_number}
            )
            patient_row = result.fetchone()
            
            if not patient_row:
                return JSONResponse(
                    status_code=404,
                    content={"success": False, "detail": "Patient not found"}
                )
            
            person_uuid = patient_row[0]
            
            # Get EMR refills
            emr_refills = []
            refill_result = conn.execute(
                text("""
                    SELECT 
                        visit_date AS pickup_date, 
                        COALESCE(refill_period, 0) AS duration,
                        next_appointment
                    FROM hiv_art_pharmacy 
                    WHERE person_uuid = :uuid AND archived = 0
                    ORDER BY visit_date DESC
                """),
                {"uuid": person_uuid}
            )
            for r in refill_result:
                refill = dict(r._mapping)
                if refill.get('pickup_date'):
                    refill['pickup_date'] = str(refill['pickup_date'])
                if refill.get('next_appointment'):
                    refill['next_appointment'] = str(refill['next_appointment'])
                emr_refills.append(refill)
            
            # Get EMR viral loads
            emr_vls = []
            vl_result = conn.execute(
                text("""
                    SELECT 
                        CAST(ls.date_sample_collected AS DATE) AS sample_collection_date,
                        sm.result_reported AS viral_load_result,
                        CAST(sm.date_result_reported AS DATE) AS result_date
                    FROM laboratory_result sm
                    INNER JOIN laboratory_test lt ON lt.id = sm.test_id
                    INNER JOIN laboratory_sample ls ON ls.test_id = lt.id
                    WHERE lt.lab_test_id = 16 
                    AND sm.patient_uuid = :uuid
                    AND sm.result_reported IS NOT NULL 
                    AND sm.archived = 0
                    ORDER BY ls.date_sample_collected DESC
                """),
                {"uuid": person_uuid}
            )
            for v in vl_result:
                vl = dict(v._mapping)
                if vl.get('sample_collection_date'):
                    vl['sample_collection_date'] = str(vl['sample_collection_date'])
                if vl.get('result_date'):
                    vl['result_date'] = str(vl['result_date'])
                emr_vls.append(vl)
        
        # Perform comparison
        comparison_results = []
        care_pickups = data.get('drug_pickups', [])
        
        for i, care_pickup in enumerate(care_pickups):
            emr_pickup = emr_refills[i] if i < len(emr_refills) else None
            
            if not emr_pickup:
                comparison_results.append({
                    "field_name": f"Pickup #{i+1}",
                    "emr_value": "Not in EMR",
                    "care_card_value": str(care_pickup.get('pickup_date', 'N/A')),
                    "match": False
                })
                continue
            
            # Compare date
            emr_date = str(emr_pickup.get('pickup_date', ''))[:10]
            cc_date = str(care_pickup.get('pickup_date', ''))[:10]
            comparison_results.append({
                "field_name": f"Pickup #{i+1} Date",
                "emr_value": emr_date or 'N/A',
                "care_card_value": cc_date or 'N/A',
                "match": emr_date == cc_date
            })
            
            # Compare duration
            emr_dur = str(emr_pickup.get('duration', 0))
            cc_dur = str(care_pickup.get('duration', 0))
            comparison_results.append({
                "field_name": f"Pickup #{i+1} Duration",
                "emr_value": f"{emr_dur} days",
                "care_card_value": f"{cc_dur} days",
                "match": emr_dur == cc_dur
            })
        
        # Compare viral loads
        care_vls = data.get('viral_loads', [])
        for i, care_vl in enumerate(care_vls):
            emr_vl = emr_vls[i] if i < len(emr_vls) else None
            
            if not emr_vl:
                comparison_results.append({
                    "field_name": f"VL #{i+1}",
                    "emr_value": "Not in EMR",
                    "care_card_value": str(care_vl.get('viral_load_result', 'N/A')),
                    "match": False
                })
                continue
            
            emr_date = str(emr_vl.get('sample_collection_date', ''))[:10]
            cc_date = str(care_vl.get('sample_collection_date', ''))[:10]
            comparison_results.append({
                "field_name": f"VL #{i+1} Sample Date",
                "emr_value": emr_date or 'N/A',
                "care_card_value": cc_date or 'N/A',
                "match": emr_date == cc_date
            })
            
            emr_result = str(emr_vl.get('viral_load_result', '')).strip()
            cc_result = str(care_vl.get('viral_load_result', '')).strip()
            comparison_results.append({
                "field_name": f"VL #{i+1} Result",
                "emr_value": emr_result or 'N/A',
                "care_card_value": cc_result or 'N/A',
                "match": emr_result.lower() == cc_result.lower()
            })
        
        all_matched = all(r['match'] for r in comparison_results)
        mismatch_count = sum(1 for r in comparison_results if not r['match'])
        
        return {
            "success": True,
            "hospital_number": hospital_number,
            "comparison_results": comparison_results,
            "all_matched": all_matched,
            "can_submit": all_matched,
            "mismatch_count": mismatch_count,
            "matched_count": len(comparison_results) - mismatch_count,
            "message": "✅ All records match!" if all_matched else f"❌ Found {mismatch_count} discrepancies"
        }
        
    except Exception as e:
        logger.error(f"Comparison error: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"success": False, "detail": str(e)}
        )

# ============================================================================
# DQA SUBMISSION
# ============================================================================

@app.post("/api/care-cards/submit")
async def submit_care_card(request: Request):
    """Submit DQA verification data"""
    try:
        from app.database import dqa_engine
        from app.models.dqa_models import DQAAuditLog, CareCardRecord
        from sqlalchemy.orm import Session
        
        data = await request.json()
        user = request.headers.get("X-User", "anonymous")
        
        hospital_number = data.get('hospital_number')
        care_card_data = data.get('care_card_data', {})
        comparison_results = data.get('comparison_results', [])
        total_comparisons = data.get('total_comparisons', len(comparison_results))
        matched_comparisons = data.get('matched_comparisons', sum(1 for r in comparison_results if r.get('match')))
        
        if not hospital_number:
            return JSONResponse(
                status_code=400,
                content={"success": False, "detail": "Hospital number required"}
            )
        
        logger.info(f"User '{user}' submitting DQA for: {hospital_number}")
        
        with Session(dqa_engine) as dqa_session:
            # Check if already verified
            existing_record = dqa_session.query(CareCardRecord).filter(
                CareCardRecord.hospital_number == hospital_number,
                CareCardRecord.is_verified == True
            ).first()
            
            if existing_record:
                return {
                    "success": True,
                    "message": f"This patient was already verified by {existing_record.verified_by}",
                    "already_verified": True,
                    "verified_by": existing_record.verified_by,
                    "verified_at": str(existing_record.verified_at) if existing_record.verified_at else None,
                    "submitted_by": user,
                    "timestamp": str(datetime.now())
                }
            
            # Create audit log
            audit_log = DQAAuditLog(
                hospital_number=hospital_number,
                person_uuid=data.get('person_uuid', ''),
                first_name=data.get('first_name', ''),
                surname=data.get('surname', ''),
                facility_name=data.get('facility_name', ''),
                state=data.get('state', ''),
                care_card_data=care_card_data,
                emr_snapshot={},
                validation_status='Matched' if matched_comparisons == total_comparisons else 'Partial Match',
                discrepancies_found=total_comparisons - matched_comparisons,
                issues_fixed=0,
                total_comparisons=total_comparisons,
                matched_comparisons=matched_comparisons,
                user_name=user
            )
            dqa_session.add(audit_log)
            
            # Update care card record
            care_record = dqa_session.query(CareCardRecord).filter(
                CareCardRecord.hospital_number == hospital_number
            ).first()
            
            if care_record:
                care_record.is_verified = True
                care_record.verified_by = user
                care_record.verified_at = datetime.now()
            
            dqa_session.commit()
            
            logger.info(f"DQA submitted for {hospital_number} by {user}, Audit ID: {audit_log.id}")
            
            return {
                "success": True,
                "message": "DQA verification submitted successfully!",
                "submitted_by": user,
                "audit_id": audit_log.id,
                "already_verified": False,
                "timestamp": str(datetime.now())
            }
            
    except Exception as e:
        logger.error(f"Submission error: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"success": False, "detail": str(e)}
        )

# ============================================================================
# DQA REPORTS
# ============================================================================

@app.get("/api/reports/summary")
async def get_dqa_summary(request: Request):
    """Get DQA summary statistics"""
    try:
        from app.database import dqa_engine
        from app.models.dqa_models import DQAAuditLog, CareCardRecord
        from sqlalchemy.orm import Session
        from sqlalchemy import func
        
        with Session(dqa_engine) as session:
            total_audits = session.query(func.count(DQAAuditLog.id)).scalar() or 0
            total_verified = session.query(func.count(CareCardRecord.id)).filter(
                CareCardRecord.is_verified == True
            ).scalar() or 0
            total_care_cards = session.query(func.count(CareCardRecord.id)).scalar() or 0
            
            return {
                "success": True,
                "summary": {
                    "total_audits": total_audits,
                    "total_verified": total_verified,
                    "total_care_cards": total_care_cards,
                    "verification_rate": f"{(total_verified/total_care_cards*100):.1f}%" if total_care_cards > 0 else "0%"
                }
            }
    except Exception as e:
        logger.error(f"Summary error: {e}")
        return {"success": False, "detail": str(e)}

@app.get("/api/reports/excel")
async def generate_excel_report(request: Request):
    """Generate Excel report of DQA data"""
    try:
        from app.database import dqa_engine
        from app.models.dqa_models import CareCardRecord, DQAAuditLog
        from sqlalchemy.orm import Session
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from openpyxl.utils import get_column_letter
        
        user = request.headers.get("X-User", "anonymous")
        logger.info(f"User '{user}' generating DQA report")
        
        wb = Workbook()
        
        # === Sheet 1: Summary ===
        ws_summary = wb.active
        ws_summary.title = "DQA Summary"
        
        # Title
        ws_summary.merge_cells('A1:G1')
        ws_summary['A1'] = "MedDQA - Data Quality Audit Report"
        ws_summary['A1'].font = Font(bold=True, size=16, color="1e40af")
        ws_summary['A1'].alignment = Alignment(horizontal="center")
        
        ws_summary.merge_cells('A2:G2')
        ws_summary['A2'] = f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | By: {user}"
        ws_summary['A2'].alignment = Alignment(horizontal="center")
        
        # Headers
        headers = [
            "Hospital Number", "Patient Name", "Drug Pickups",
            "Viral Loads", "Verified", "Verified By", "Verified Date"
        ]
        
        header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
        header_font = Font(bold=True, color="FFFFFF", size=11)
        
        for col, header in enumerate(headers, 1):
            cell = ws_summary.cell(row=4, column=col, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center", vertical="center")
        
        # Data
        with Session(dqa_engine) as session:
            records = session.query(CareCardRecord).order_by(
                CareCardRecord.created_at.desc()
            ).all()
            
            for row_idx, record in enumerate(records, 5):
                ws_summary.cell(row=row_idx, column=1, value=record.hospital_number)
                ws_summary.cell(row=row_idx, column=2, value=f"{getattr(record, 'first_name', '')} {getattr(record, 'surname', '')}".strip())
                ws_summary.cell(row=row_idx, column=3, value=len(record.drug_pickups or []))
                ws_summary.cell(row=row_idx, column=4, value=len(record.viral_loads or []))
                ws_summary.cell(row=row_idx, column=5, value="Yes" if record.is_verified else "No")
                ws_summary.cell(row=row_idx, column=6, value=record.verified_by or '')
                ws_summary.cell(row=row_idx, column=7, value=str(record.verified_at)[:19] if record.verified_at else '')
        
        # Auto-size columns
        for column in ws_summary.columns:
            max_length = 0
            column_letter = get_column_letter(column[0].column)
            for cell in column:
                try:
                    if len(str(cell.value)) > max_length:
                        max_length = len(str(cell.value))
                except:
                    pass
            ws_summary.column_dimensions[column_letter].width = min(max_length + 2, 50)
        
        # === Sheet 2: Audit Log ===
        ws_audit = wb.create_sheet("Audit Log")
        
        audit_headers = [
            "ID", "Hospital Number", "User", "Status",
            "Discrepancies", "Comparisons", "Matched", "Timestamp"
        ]
        
        for col, header in enumerate(audit_headers, 1):
            cell = ws_audit.cell(row=1, column=col, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center")
        
        with Session(dqa_engine) as session:
            audits = session.query(DQAAuditLog).order_by(
                DQAAuditLog.created_at.desc()
            ).limit(500).all()
            
            for row_idx, audit in enumerate(audits, 2):
                ws_audit.cell(row=row_idx, column=1, value=audit.id)
                ws_audit.cell(row=row_idx, column=2, value=audit.hospital_number)
                ws_audit.cell(row=row_idx, column=3, value=audit.user_name)
                ws_audit.cell(row=row_idx, column=4, value=audit.validation_status)
                ws_audit.cell(row=row_idx, column=5, value=audit.discrepancies_found)
                ws_audit.cell(row=row_idx, column=6, value=audit.total_comparisons)
                ws_audit.cell(row=row_idx, column=7, value=audit.matched_comparisons)
                ws_audit.cell(row=row_idx, column=8, value=str(audit.created_at)[:19] if audit.created_at else '')
        
        # Save to bytes
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"DQA_Report_{timestamp}.xlsx"
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except Exception as e:
        logger.error(f"Report error: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"success": False, "detail": str(e)}
        )

# ============================================================================
# TEAM / ACTIVE USERS
# ============================================================================

@app.get("/api/team/active-users")
async def get_active_users():
    """Get list of currently active users"""
    # Clean up expired sessions
    current_time = datetime.now()
    expired_users = []
    
    for user_name, last_seen in list(active_sessions.items()):
        if (current_time - last_seen).total_seconds() > SESSION_EXPIRY_MINUTES * 60:
            expired_users.append(user_name)
    
    for user in expired_users:
        del active_sessions[user]
    
    # Build active users list
    active = []
    for user_name, last_seen in active_sessions.items():
        active.append({
            "user": user_name,
            "last_seen": str(last_seen),
            "status": "online"
        })
    
    return {
        "active_count": len(active),
        "users": active,
        "locked_records": {
            k: {
                "locked_by": v['user'],
                "locked_at": v['time']
            }
            for k, v in record_locks.items()
        }
    }

@app.post("/api/team/heartbeat")
async def heartbeat(request: Request):
    """Update user's active status"""
    user = request.headers.get("X-User", "anonymous")
    if user != "anonymous":
        active_sessions[user] = datetime.now()
    return {"status": "ok", "user": user}

# ============================================================================
# DEBUG ENDPOINTS
# ============================================================================

@app.get("/api/debug/sample-patients")
async def sample_patients(limit: int = 10):
    """Get sample patient hospital numbers for testing"""
    try:
        from app.database import emr_engine
        
        if not emr_engine:
            return {"error": "Database not configured"}
        
        with emr_engine.connect() as conn:
            rows = conn.execute(
                text("""
                    SELECT hospital_number, first_name, surname, uuid, sex
                    FROM patient_person 
                    WHERE archived = 0 AND hospital_number IS NOT NULL
                    LIMIT :lim
                """),
                {"lim": limit}
            ).fetchall()
            
            return {
                "patients": [
                    {
                        "hospital_number": r[0],
                        "name": f"{r[1]} {r[2]}",
                        "uuid": r[3],
                        "sex": r[4]
                    }
                    for r in rows
                ]
            }
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/debug/db-status")
async def database_status():
    """Check database connection status"""
    try:
        from app.database import emr_engine, dqa_engine
        
        status = {
            "emr": {"connected": False, "error": None},
            "dqa": {"connected": False, "error": None}
        }
        
        if emr_engine:
            try:
                with emr_engine.connect() as conn:
                    conn.execute(text("SELECT 1"))
                status["emr"]["connected"] = True
            except Exception as e:
                status["emr"]["error"] = str(e)
        
        if dqa_engine:
            try:
                with dqa_engine.connect() as conn:
                    conn.execute(text("SELECT 1"))
                status["dqa"]["connected"] = True
            except Exception as e:
                status["dqa"]["error"] = str(e)
        
        return status
        
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/debug/raw-regimens/{hospital_number:path}")
async def debug_raw_regimens(hospital_number: str):
    """Debug endpoint to see raw JSONB structure of refills"""
    try:
        from app.database import emr_engine
        
        hospital_number = unquote(hospital_number)
        
        with emr_engine.connect() as conn:
            result = conn.execute(
                text("SELECT uuid FROM patient_person WHERE hospital_number = :hn AND archived = 0"),
                {"hn": hospital_number}
            )
            row = result.fetchone()
            if not row:
                return {"error": "Patient not found"}
            
            person_uuid = row[0]
            
            refills = conn.execute(
                text("""
                    SELECT 
                        id,
                        visit_date,
                        extra,
                        extra -> 'regimens' AS regimens_raw,
                        jsonb_typeof(extra -> 'regimens') AS regimens_type,
                        jsonb_array_length(extra -> 'regimens') AS array_length
                    FROM hiv_art_pharmacy
                    WHERE person_uuid = :uuid AND archived = 0
                    AND extra -> 'regimens' IS NOT NULL
                    ORDER BY visit_date DESC
                    LIMIT 5
                """),
                {"uuid": person_uuid}
            ).fetchall()
            
            return {
                "patient_uuid": person_uuid,
                "refills": [
                    {
                        "id": r[0],
                        "visit_date": str(r[1]) if r[1] else None,
                        "extra_preview": str(r[2])[:500] if r[2] else None,
                        "regimens_type": r[4],
                        "array_length": r[5]
                    }
                    for r in refills
                ]
            }
    except Exception as e:
        return {"error": str(e)}

# ============================================================================
# ERROR HANDLERS
# ============================================================================

@app.exception_handler(404)
async def not_found_handler(request: Request, exc: HTTPException):
    """Handle 404 errors"""
    if request.url.path.startswith('/api/'):
        return JSONResponse(
            status_code=404,
            content={"success": False, "detail": "Endpoint not found"}
        )
    return HTMLResponse(
        content="""
        <html>
        <head><title>404 - Page Not Found</title>
        <style>
            body { font-family: 'Inter', sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; }
            .error-card { text-align: center; padding: 3rem; background: white; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.1); }
            h1 { font-size: 4rem; color: #4f46e5; margin: 0; }
            a { color: #4f46e5; text-decoration: none; font-weight: 600; }
        </style>
        </head>
        <body>
            <div class="error-card">
                <h1>404</h1>
                <p>Page not found</p>
                <a href='/'>Go to Home</a>
            </div>
        </body>
        </html>
        """,
        status_code=404
    )

@app.exception_handler(500)
async def internal_error_handler(request: Request, exc: HTTPException):
    """Handle 500 errors"""
    logger.error(f"500 error: {exc}")
    if request.url.path.startswith('/api/'):
        return JSONResponse(
            status_code=500,
            content={"success": False, "detail": "Internal server error"}
        )
    return HTMLResponse(
        content="""
        <html>
        <head><title>500 - Server Error</title>
        <style>
            body { font-family: 'Inter', sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; }
            .error-card { text-align: center; padding: 3rem; background: white; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.1); }
            h1 { font-size: 4rem; color: #ef4444; margin: 0; }
            a { color: #4f46e5; text-decoration: none; font-weight: 600; }
        </style>
        </head>
        <body>
            <div class="error-card">
                <h1>500</h1>
                <p>Internal server error</p>
                <a href='/'>Go to Home</a>
            </div>
        </body>
        </html>
        """,
        status_code=500
    )

# ============================================================================
# PHARMACY REPORT - PULLS FROM BOTH EMR (facility details) AND DQA (care card)
# ============================================================================

# ============================================================================
# PHARMACY EXCEL - SELF-CONTAINED (fetches its own data)
# ============================================================================

@app.get("/api/reports/pharmacy/excel")
async def generate_pharmacy_report_excel(
    request: Request,
    start_date: str = None,
    end_date: str = None
):
    """Generate Pharmacy Report Excel - fetches data directly"""
    try:
        from app.database import dqa_engine, emr_engine
        from app.models.dqa_models import CareCardRecord
        from sqlalchemy.orm import Session
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from openpyxl.utils import get_column_letter
        
        user = request.headers.get("X-User", "anonymous")
        logger.info(f"User '{user}' generating pharmacy Excel report")
        
        # Clean parameters - handle empty strings
        if start_date and start_date.strip():
            start_date = start_date.strip()
        else:
            start_date = None
        
        if end_date and end_date.strip():
            end_date = end_date.strip()
        else:
            end_date = None
        
        # Cache for EMR facility data
        facility_cache = {}
        
        def get_facility_info(hospital_number):
            if not hospital_number:
                return {"facility_name": "N/A", "datim_id": "N/A"}
            if hospital_number in facility_cache:
                return facility_cache[hospital_number]
            
            info = {"facility_name": "N/A", "datim_id": "N/A"}
            try:
                with emr_engine.connect() as conn:
                    result = conn.execute(text("""
                        SELECT facility.name, oi.code
                        FROM patient_person p
                        INNER JOIN hiv_enrollment h ON h.person_uuid = p.uuid AND h.archived = 0
                        INNER JOIN base_organisation_unit facility ON facility.id = h.facility_id
                        LEFT JOIN base_organisation_unit_identifier oi ON oi.organisation_unit_id = facility.id AND oi.name = 'DATIM_ID'
                        WHERE p.hospital_number = :hn AND p.archived = 0 LIMIT 1
                    """), {"hn": hospital_number}).fetchone()
                    if result:
                        info["facility_name"] = result[0] or 'N/A'
                        info["datim_id"] = result[1] or 'N/A'
            except Exception as e:
                logger.warning(f"EMR lookup failed for {hospital_number}: {e}")
            
            facility_cache[hospital_number] = info
            return info
        
        # Fetch DQA data
        with Session(dqa_engine) as session:
            query = session.query(CareCardRecord)
            
            # Only filter if dates are provided and not empty
            if start_date:
                query = query.filter(CareCardRecord.verified_at >= start_date)
            if end_date:
                query = query.filter(CareCardRecord.verified_at <= end_date)
            
            records = query.order_by(CareCardRecord.updated_at.desc()).all()
        
        # Build pharmacy data
        pharmacy_data = []
        sno = 1
        
        for record in records:
            facility_info = get_facility_info(record.hospital_number)
            
            for pickup in (record.drug_pickups or []):
                regimen_name = pickup.get('regimen', '') or pickup.get('regimen_name', '')
                duration = pickup.get('duration', 0) or 0
                
                pharmacy_data.append({
                    "s_no": sno,
                    "facility_name": facility_info['facility_name'],
                    "datim_id": facility_info['datim_id'],
                    "patient_id": record.person_uuid or 'N/A',
                    "hospital_num": record.hospital_number or 'N/A',
                    "date_visit": pickup.get('pickup_date', 'N/A') or 'N/A',
                    "regimen_line": categorize_regimen(regimen_name),
                    "regimens": regimen_name or 'N/A',
                    "refill_period": duration,
                    "mmd_type": get_mmd_type(duration),
                    "next_appointment": pickup.get('next_appointment', 'N/A') or 'N/A',
                    "dsd_model": getattr(record, 'dsd_model', '') or ''
                })
                sno += 1
        
        logger.info(f"Pharmacy Excel: {len(pharmacy_data)} rows")
        
        # Create Excel
        wb = Workbook()
        ws = wb.active
        ws.title = "Pharmacy Report"
        
        headers = [
            "S/No", "Facility Name", "DATIM Id", "Patient Id", "Hospital Num",
            "Date Visit (yyyy-mm-dd)", "Drug type", "Regimens (Include supported Drugs)",
            "Refill Period", "MMD_Type"
        ]
        
        header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
        header_font = Font(bold=True, color="FFFFFF", size=10)
        thin_border = Border(
            left=Side(style='thin'), right=Side(style='thin'),
            top=Side(style='thin'), bottom=Side(style='thin')
        )
        
        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = thin_border
        
        for row_idx, row_data in enumerate(pharmacy_data, 2):
            ws.cell(row=row_idx, column=1, value=row_data['s_no']).border = thin_border
            ws.cell(row=row_idx, column=2, value=row_data['facility_name']).border = thin_border
            ws.cell(row=row_idx, column=3, value=row_data['datim_id']).border = thin_border
            ws.cell(row=row_idx, column=4, value=row_data['patient_id']).border = thin_border
            ws.cell(row=row_idx, column=5, value=row_data['hospital_num']).border = thin_border
            ws.cell(row=row_idx, column=6, value=row_data['date_visit']).border = thin_border
            ws.cell(row=row_idx, column=7, value=row_data['regimen_line']).border = thin_border
            ws.cell(row=row_idx, column=8, value=row_data['regimens']).border = thin_border
            ws.cell(row=row_idx, column=9, value=row_data['refill_period']).border = thin_border
            ws.cell(row=row_idx, column=10, value=row_data['mmd_type']).border = thin_border
           
        
        widths = {1:6, 2:30, 3:15, 4:38, 5:18, 6:20, 7:15, 8:35, 9:12, 10:12, 11:20, 12:15}
        for col, width in widths.items():
            ws.column_dimensions[get_column_letter(col)].width = width
        
        ws.freeze_panes = 'A2'
        
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=Pharmacy_Report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"}
        )
        
    except Exception as e:
        logger.error(f"Pharmacy Excel error: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"success": False, "detail": str(e)})


# ============================================================================
# VIRAL LOAD EXCEL - SELF-CONTAINED
# ============================================================================

@app.get("/api/reports/viral-load/excel")
async def generate_viral_load_report_excel(
    request: Request,
    start_date: str = None,
    end_date: str = None
):
    """Generate Viral Load Report Excel - fetches data directly"""
    try:
        from app.database import dqa_engine, emr_engine
        from app.models.dqa_models import CareCardRecord
        from sqlalchemy.orm import Session
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from openpyxl.utils import get_column_letter
        
        user = request.headers.get("X-User", "anonymous")
        logger.info(f"User '{user}' generating VL Excel report")
        
        # Clean parameters
        if start_date and start_date.strip():
            start_date = start_date.strip()
        else:
            start_date = None
        
        if end_date and end_date.strip():
            end_date = end_date.strip()
        else:
            end_date = None
        
        # Cache for EMR data
        emr_cache = {}
        
        def get_emr_patient_info(hospital_number):
            if not hospital_number:
                return {"facility_name": "N/A", "datim_id": "N/A", "art_start_date": "N/A", "current_regimen": "N/A"}
            if hospital_number in emr_cache:
                return emr_cache[hospital_number]
            
            info = {"facility_name": "N/A", "datim_id": "N/A", "art_start_date": "N/A", "current_regimen": "N/A"}
            try:
                with emr_engine.connect() as conn:
                    result = conn.execute(text("""
                        SELECT facility.name, oi.code, h.date_of_registration, p.uuid
                        FROM patient_person p
                        INNER JOIN hiv_enrollment h ON h.person_uuid = p.uuid AND h.archived = 0
                        INNER JOIN base_organisation_unit facility ON facility.id = h.facility_id
                        LEFT JOIN base_organisation_unit_identifier oi ON oi.organisation_unit_id = facility.id AND oi.name = 'DATIM_ID'
                        WHERE p.hospital_number = :hn AND p.archived = 0 LIMIT 1
                    """), {"hn": hospital_number}).fetchone()
                    
                    if result:
                        info["facility_name"] = result[0] or 'N/A'
                        info["datim_id"] = result[1] or 'N/A'
                        info["art_start_date"] = str(result[2]) if result[2] else 'N/A'
                        
                        person_uuid = result[3]
                        if person_uuid:
                            cr = conn.execute(text("""
                                SELECT COALESCE(elem ->> 'regimenName', elem ->> 'name', 'Unknown')
                                FROM hiv_art_pharmacy hap
                                CROSS JOIN LATERAL jsonb_array_elements(hap.extra -> 'regimens') AS elem
                                WHERE hap.archived = 0 AND hap.person_uuid = :uuid
                                AND hap.extra -> 'regimens' IS NOT NULL
                                AND jsonb_typeof(hap.extra -> 'regimens') = 'array'
                                ORDER BY hap.visit_date DESC LIMIT 1
                            """), {"uuid": person_uuid}).fetchone()
                            if cr and cr[0]:
                                info["current_regimen"] = cr[0]
            except Exception as e:
                logger.warning(f"EMR lookup failed for {hospital_number}: {e}")
            
            emr_cache[hospital_number] = info
            return info
        
        # Fetch DQA data
        with Session(dqa_engine) as session:
            query = session.query(CareCardRecord)
            if start_date:
                query = query.filter(CareCardRecord.verified_at >= start_date)
            if end_date:
                query = query.filter(CareCardRecord.verified_at <= end_date)
            records = query.order_by(CareCardRecord.updated_at.desc()).all()
        
        # Build VL data
        vl_data = []
        sno = 1
        
        for record in records:
            emr_info = get_emr_patient_info(record.hospital_number)
            
            for vl in (record.viral_loads or []):
                vl_result = vl.get('viral_load_result', 'N/A') or 'N/A'
                
                vl_data.append({
                    "s_no": sno,
                    "facility_name": emr_info['facility_name'],
                    "datim_id": emr_info['datim_id'],
                    "patient_id": record.person_uuid or 'N/A',
                    "hospital_num": record.hospital_number or 'N/A',
                    "sample_collection_date": vl.get('sample_collection_date', 'N/A') or 'N/A',
                    "viral_load_result": vl_result,
                    "result_date": vl.get('result_date', 'N/A') or 'N/A',
                    "vl_classification": classify_vl_result(vl_result),
                    "art_start_date": emr_info['art_start_date'],
                    "current_regimen": emr_info['current_regimen']
                })
                sno += 1
        
        logger.info(f"VL Excel: {len(vl_data)} rows")
        
        # Create Excel
        wb = Workbook()
        ws = wb.active
        ws.title = "Viral Load Report"
        
        headers = [
            "S/No", "Facility Name", "DATIM Id", "Patient Id", "Hospital Num",
            "Sample Collection Date", "Viral Load Result", "Result Date",
            "VL Classification", "ART Start Date", "Current Regimen"
        ]
        
        header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
        header_font = Font(bold=True, color="FFFFFF", size=10)
        thin_border = Border(
            left=Side(style='thin'), right=Side(style='thin'),
            top=Side(style='thin'), bottom=Side(style='thin')
        )
        
        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = thin_border
        
        for row_idx, row_data in enumerate(vl_data, 2):
            ws.cell(row=row_idx, column=1, value=row_data['s_no']).border = thin_border
            ws.cell(row=row_idx, column=2, value=row_data['facility_name']).border = thin_border
            ws.cell(row=row_idx, column=3, value=row_data['datim_id']).border = thin_border
            ws.cell(row=row_idx, column=4, value=row_data['patient_id']).border = thin_border
            ws.cell(row=row_idx, column=5, value=row_data['hospital_num']).border = thin_border
            ws.cell(row=row_idx, column=6, value=row_data['sample_collection_date']).border = thin_border
            ws.cell(row=row_idx, column=7, value=row_data['viral_load_result']).border = thin_border
            ws.cell(row=row_idx, column=8, value=row_data['result_date']).border = thin_border
            ws.cell(row=row_idx, column=9, value=row_data['vl_classification']).border = thin_border
            ws.cell(row=row_idx, column=10, value=row_data['art_start_date']).border = thin_border
            ws.cell(row=row_idx, column=11, value=row_data['current_regimen']).border = thin_border
        
        widths = {1:6, 2:30, 3:15, 4:38, 5:18, 6:20, 7:15, 8:20, 9:18, 10:20, 11:35}
        for col, width in widths.items():
            ws.column_dimensions[get_column_letter(col)].width = width
        
        ws.freeze_panes = 'A2'
        
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=VL_Report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"}
        )
        
    except Exception as e:
        logger.error(f"VL Excel error: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"success": False, "detail": str(e)})
# ============================================================================
# VIRAL LOAD EXCEL - NO TITLE ROWS, JUST HEADERS + DATA
# ============================================================================

@app.get("/api/reports/viral-load/excel")
async def generate_viral_load_report_excel(
    request: Request,
    start_date: str = None,
    end_date: str = None
):
    """Generate Viral Load Report Excel - clean format"""
    try:
        result = await generate_viral_load_report(request, start_date, end_date)
        if not result.get("success"):
            raise Exception(result.get("detail", "Failed"))
        
        vl_data = result.get("data", [])
        
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from openpyxl.utils import get_column_letter
        
        wb = Workbook()
        ws = wb.active
        ws.title = "Viral Load Report"
        
        headers = [
            "S/No", "Facility Name", "DATIM Id", "Patient Id", "Hospital Num",
            "Sample Collection Date", "Viral Load Result", "Result Date",
            "VL Classification", "ART Start Date", "Current Regimen"
        ]
        
        header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
        header_font = Font(bold=True, color="FFFFFF", size=10)
        thin_border = Border(
            left=Side(style='thin'), right=Side(style='thin'),
            top=Side(style='thin'), bottom=Side(style='thin')
        )
        
        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = thin_border
        
        for row_idx, row_data in enumerate(vl_data, 2):
            ws.cell(row=row_idx, column=1, value=row_data['s_no']).border = thin_border
            ws.cell(row=row_idx, column=2, value=row_data['facility_name']).border = thin_border
            ws.cell(row=row_idx, column=3, value=row_data['datim_id']).border = thin_border
            ws.cell(row=row_idx, column=4, value=row_data['patient_id']).border = thin_border
            ws.cell(row=row_idx, column=5, value=row_data['hospital_num']).border = thin_border
            ws.cell(row=row_idx, column=6, value=row_data['sample_collection_date']).border = thin_border
            ws.cell(row=row_idx, column=7, value=row_data['viral_load_result']).border = thin_border
            ws.cell(row=row_idx, column=8, value=row_data['result_date']).border = thin_border
            ws.cell(row=row_idx, column=9, value=row_data['vl_classification']).border = thin_border
            ws.cell(row=row_idx, column=10, value=row_data['art_start_date']).border = thin_border
            ws.cell(row=row_idx, column=11, value=row_data['current_regimen']).border = thin_border
        
        widths = {1:6, 2:30, 3:15, 4:38, 5:18, 6:20, 7:15, 8:20, 9:18, 10:20, 11:35}
        for col, width in widths.items():
            ws.column_dimensions[get_column_letter(col)].width = width
        
        ws.freeze_panes = 'A2'
        
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=VL_Report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"}
        )
        
    except Exception as e:
        logger.error(f"VL Excel error: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"success": False, "detail": str(e)})
# ============================================================================
# DQA SUMMARY REPORT - FROM DQA DATABASE
# ============================================================================

@app.get("/api/reports/dqa-summary")
async def generate_dqa_summary_report(
    request: Request,
    start_date: str = None,
    end_date: str = None
):
    """
    Generate DQA Summary Report showing all verified records.
    """
    try:
        from app.database import dqa_engine
        from app.models.dqa_models import CareCardRecord, DQAAuditLog
        from sqlalchemy.orm import Session
        from sqlalchemy import func
        
        user = request.headers.get("X-User", "anonymous")
        logger.info(f"User '{user}' generating DQA summary report")
        
        with Session(dqa_engine) as session:
            # Build query
            query = session.query(CareCardRecord)
            audit_query = session.query(DQAAuditLog)
            
            if start_date:
                query = query.filter(CareCardRecord.verified_at >= start_date)
                audit_query = audit_query.filter(DQAAuditLog.created_at >= start_date)
            if end_date:
                query = query.filter(CareCardRecord.verified_at <= end_date)
                audit_query = audit_query.filter(DQAAuditLog.created_at <= end_date)
            
            records = query.order_by(CareCardRecord.verified_at.desc()).all()
            
            summary_data = []
            sno = 1
            
            for record in records:
                drug_pickups = record.drug_pickups or []
                viral_loads = record.viral_loads or []
                
                # Get drug names
                drug_names = [p.get('regimen', '') or p.get('regimen_name', '') for p in drug_pickups]
                drug_names = [d for d in drug_names if d]
                
                # Get VL results
                vl_results = [v.get('viral_load_result', '') for v in viral_loads]
                vl_results = [v for v in vl_results if v]
                
                summary_data.append({
                    "s_no": sno,
                    "hospital_number": record.hospital_number or 'N/A',
                    "person_uuid": record.person_uuid or 'N/A',
                    "drug_pickups_count": len(drug_pickups),
                    "drugs": ', '.join(drug_names) if drug_names else 'N/A',
                    "viral_loads_count": len(viral_loads),
                    "vl_results": ', '.join(vl_results) if vl_results else 'N/A',
                    "is_verified": "Yes" if record.is_verified else "No",
                    "verified_by": record.verified_by or 'N/A',
                    "verified_at": str(record.verified_at)[:19] if record.verified_at else 'N/A',
                    "created_by": record.created_by or 'N/A',
                    "updated_by": record.updated_by or 'N/A'
                })
                sno += 1
            
            # Get audit statistics
            total_audits = audit_query.count()
            matched_audits = audit_query.filter(DQAAuditLog.validation_status == 'Matched').count()
            
            return {
                "success": True,
                "count": len(summary_data),
                "source": "DQA Care Card Database",
                "statistics": {
                    "total_verified": len([r for r in records if r.is_verified]),
                    "total_audits": total_audits,
                    "fully_matched": matched_audits,
                    "match_rate": f"{(matched_audits/total_audits*100):.1f}%" if total_audits > 0 else "0%"
                },
                "filters": {
                    "start_date": start_date,
                    "end_date": end_date
                },
                "data": summary_data
            }
            
    except Exception as e:
        logger.error(f"DQA summary report error: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"success": False, "detail": str(e)})


# ============================================================================
# HELPER FUNCTIONS FOR REPORTS
# ============================================================================

def categorize_regimen(name):
    """Categorize a regimen based on its drug components"""
    if not name:
        return 'ARVs'
    
    name_lower = str(name).lower()
    
    # Anti-TB drugs
    tb_drugs = ['isoniazid', 'inh', '3hp', 'rifampicin', 'rifampin', 'rifapentine',
                'pyrazinamide', 'ethambutol', 'rhze', 'rhz', 'tb ', 'rifinah', 'akurit']
    for tb in tb_drugs:
        if tb in name_lower:
            return 'Anti-TB'
    
    # Prophylaxis drugs
    prophylaxis_drugs = ['cotrimoxazole', 'septrin', 'bactrim', 'fluconazole',
                         'dapsone', 'azithromycin', 'nystatin', 'clotrimazole']
    for proph in prophylaxis_drugs:
        if proph in name_lower:
            return 'Prophylaxis'
    
    # Other drugs
    other_drugs = ['pyridoxine', 'vitamin', 'folic', 'ferrous', 'paracetamol',
                   'ibuprofen', 'amitriptyline', 'amoxicillin']
    for other in other_drugs:
        if other in name_lower:
            return 'Other'
    
    # ARV components
    arv_components = ['tdf', '3tc', 'dtg', 'efv', 'nvp', 'abc', 'azt', 'lpv',
                      'atv', 'taf', 'ftc', 'd4t', 'tenofovir', 'lamivudine',
                      'dolutegravir', 'efavirenz', 'nevirapine', 'abacavir',
                      'zidovudine', 'lopinavir', 'atazanavir']
    for arv in arv_components:
        if arv in name_lower:
            return 'ARVs'
    
    return 'ARVs'


def get_mmd_type(duration):
    """Get MMD type based on duration"""
    if not duration:
        return 'N/A'
    duration = int(duration)
    if duration <= 30:
        return 'MMD-1'
    elif duration <= 60:
        return 'MMD-2'
    elif duration <= 90:
        return 'MMD-3'
    elif duration <= 120:
        return 'MMD-4'
    else:
        return 'MMD-6'


def classify_vl_result(vl_result):
    """Classify viral load result"""
    if not vl_result:
        return 'Unknown'
    
    vl_str = str(vl_result).strip()
    
    if vl_str.startswith('<'):
        return 'Suppressed'
    
    try:
        vl_num = int(float(vl_str.replace(',', '')))
        if vl_num < 200:
            return 'Suppressed'
        elif vl_num < 1000:
            return 'Low Viremia'
        else:
            return 'Unsuppressed'
    except (ValueError, TypeError):
        return 'Unknown'


def get_current_regimen_from_record(record):
    """Get the most recent regimen from a care card record"""
    drug_pickups = record.drug_pickups or []
    if not drug_pickups:
        return 'N/A'
    
    # Get the first (most recent) pickup
    first_pickup = drug_pickups[0]
    return first_pickup.get('regimen', '') or first_pickup.get('regimen_name', '') or 'N/A'


# ============================================================================
# EXCEL EXPORT FOR PHARMACY REPORT (FROM DQA)
# ============================================================================

@app.get("/api/reports/pharmacy/excel")
async def generate_pharmacy_report_excel(
    request: Request,
    start_date: str = None,
    end_date: str = None
):
    """Generate Pharmacy Report as Excel from DQA database"""
    try:
        from app.database import dqa_engine
        from app.models.dqa_models import CareCardRecord
        from sqlalchemy.orm import Session
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from openpyxl.utils import get_column_letter
        
        user = request.headers.get("X-User", "anonymous")
        logger.info(f"User '{user}' generating pharmacy Excel from DQA database")
        
        with Session(dqa_engine) as session:
            query = session.query(CareCardRecord)
            if start_date:
                query = query.filter(CareCardRecord.verified_at >= start_date)
            if end_date:
                query = query.filter(CareCardRecord.verified_at <= end_date)
            
            records = query.order_by(CareCardRecord.updated_at.desc()).all()
        
        wb = Workbook()
        ws = wb.active
        ws.title = "Pharmacy Report"
        
        # Title
        ws.merge_cells('A1:L1')
        ws['A1'] = "MedDQA - Pharmacy Dispensing Report (Care Card Data)"
        ws['A1'].font = Font(bold=True, size=16, color="1e40af")
        ws['A1'].alignment = Alignment(horizontal="center")
        
        ws.merge_cells('A2:L2')
        ws['A2'] = f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | Source: DQA Care Card Database"
        ws['A2'].alignment = Alignment(horizontal="center")
        
        # Headers
        headers = [
            "S/No", "Facility Name", "DATIM Id", "Patient Id", "Hospital Num",
            "Date Visit (yyyy-mm-dd)", "Regimen Line", "Regimens",
            "Refill Period", "MMD_Type", "Next Appointment", "DSD Model"
        ]
        
        header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
        header_font = Font(bold=True, color="FFFFFF", size=10)
        thin_border = Border(
            left=Side(style='thin'), right=Side(style='thin'),
            top=Side(style='thin'), bottom=Side(style='thin')
        )
        
        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=4, column=col, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = thin_border
        
        # Data
        row_idx = 5
        sno = 1
        
        for record in records:
            drug_pickups = record.drug_pickups or []
            
            for pickup in drug_pickups:
                regimen_name = pickup.get('regimen', '') or pickup.get('regimen_name', '')
                duration = pickup.get('duration', 0) or 0
                pickup_date = pickup.get('pickup_date', '') or 'N/A'
                regimen_line = categorize_regimen(regimen_name)
                
                ws.cell(row=row_idx, column=1, value=sno).border = thin_border
                ws.cell(row=row_idx, column=2, value=getattr(record, 'facility_name', 'N/A') or 'N/A').border = thin_border
                ws.cell(row=row_idx, column=3, value=getattr(record, 'datim_id', 'N/A') or 'N/A').border = thin_border
                ws.cell(row=row_idx, column=4, value=record.person_uuid or 'N/A').border = thin_border
                ws.cell(row=row_idx, column=5, value=record.hospital_number or 'N/A').border = thin_border
                ws.cell(row=row_idx, column=6, value=pickup_date).border = thin_border
                ws.cell(row=row_idx, column=7, value=regimen_line).border = thin_border
                ws.cell(row=row_idx, column=8, value=regimen_name or 'N/A').border = thin_border
                ws.cell(row=row_idx, column=9, value=duration).border = thin_border
                ws.cell(row=row_idx, column=10, value=get_mmd_type(duration)).border = thin_border
                ws.cell(row=row_idx, column=11, value=pickup.get('next_appointment', 'N/A') or 'N/A').border = thin_border
                ws.cell(row=row_idx, column=12, value=getattr(record, 'dsd_model', '') or '').border = thin_border
                
                row_idx += 1
                sno += 1
        
        # Column widths
        col_widths = {1: 6, 2: 30, 3: 15, 4: 38, 5: 18, 6: 20, 7: 15, 8: 35, 9: 12, 10: 12, 11: 20, 12: 15}
        for col, width in col_widths.items():
            ws.column_dimensions[get_column_letter(col)].width = width
        
        ws.freeze_panes = 'A5'
        
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        
        filename = f"Pharmacy_Report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except Exception as e:
        logger.error(f"Pharmacy Excel error: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"success": False, "detail": str(e)})


# ============================================================================
# EXCEL EXPORT FOR VIRAL LOAD REPORT (FROM DQA)
# ============================================================================

@app.get("/api/reports/viral-load/excel")
async def generate_viral_load_report_excel(
    request: Request,
    start_date: str = None,
    end_date: str = None
):
    """Generate Viral Load Report as Excel from DQA database"""
    try:
        from app.database import dqa_engine
        from app.models.dqa_models import CareCardRecord
        from sqlalchemy.orm import Session
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from openpyxl.utils import get_column_letter
        
        user = request.headers.get("X-User", "anonymous")
        logger.info(f"User '{user}' generating VL Excel from DQA database")
        
        with Session(dqa_engine) as session:
            query = session.query(CareCardRecord)
            if start_date:
                query = query.filter(CareCardRecord.verified_at >= start_date)
            if end_date:
                query = query.filter(CareCardRecord.verified_at <= end_date)
            
            records = query.order_by(CareCardRecord.updated_at.desc()).all()
        
        wb = Workbook()
        ws = wb.active
        ws.title = "Viral Load Report"
        
        # Title
        ws.merge_cells('A1:L1')
        ws['A1'] = "MedDQA - Viral Load Report (Care Card Data)"
        ws['A1'].font = Font(bold=True, size=16, color="1e40af")
        ws['A1'].alignment = Alignment(horizontal="center")
        
        ws.merge_cells('A2:L2')
        ws['A2'] = f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | Source: DQA Care Card Database"
        ws['A2'].alignment = Alignment(horizontal="center")
        
        # Headers
        headers = [
            "S/No", "Facility Name", "DATIM Id", "Patient Id", "Hospital Num",
            "Sample Collection Date", "Viral Load Result", "Result Date",
            "VL Classification", "ART Start Date", "Current Regimen", "Verified By"
        ]
        
        header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
        header_font = Font(bold=True, color="FFFFFF", size=10)
        thin_border = Border(
            left=Side(style='thin'), right=Side(style='thin'),
            top=Side(style='thin'), bottom=Side(style='thin')
        )
        
        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=4, column=col, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = thin_border
        
        # Data
        row_idx = 5
        sno = 1
        
        for record in records:
            viral_loads = record.viral_loads or []
            current_regimen = get_current_regimen_from_record(record)
            
            for vl in viral_loads:
                vl_result = vl.get('viral_load_result', '') or 'N/A'
                classification = classify_vl_result(vl_result)
                
                ws.cell(row=row_idx, column=1, value=sno).border = thin_border
                ws.cell(row=row_idx, column=2, value=getattr(record, 'facility_name', 'N/A') or 'N/A').border = thin_border
                ws.cell(row=row_idx, column=3, value=getattr(record, 'datim_id', 'N/A') or 'N/A').border = thin_border
                ws.cell(row=row_idx, column=4, value=record.person_uuid or 'N/A').border = thin_border
                ws.cell(row=row_idx, column=5, value=record.hospital_number or 'N/A').border = thin_border
                ws.cell(row=row_idx, column=6, value=vl.get('sample_collection_date', 'N/A') or 'N/A').border = thin_border
                ws.cell(row=row_idx, column=7, value=vl_result).border = thin_border
                ws.cell(row=row_idx, column=8, value=vl.get('result_date', 'N/A') or 'N/A').border = thin_border
                ws.cell(row=row_idx, column=9, value=classification).border = thin_border
                ws.cell(row=row_idx, column=10, value=getattr(record, 'art_start_date', 'N/A') or 'N/A').border = thin_border
                ws.cell(row=row_idx, column=11, value=current_regimen).border = thin_border
                ws.cell(row=row_idx, column=12, value=record.verified_by or record.updated_by or 'N/A').border = thin_border
                
                row_idx += 1
                sno += 1
        
        # Column widths
        col_widths = {1: 6, 2: 30, 3: 15, 4: 38, 5: 18, 6: 20, 7: 15, 8: 20, 9: 18, 10: 20, 11: 35, 12: 20}
        for col, width in col_widths.items():
            ws.column_dimensions[get_column_letter(col)].width = width
        
        ws.freeze_panes = 'A5'
        
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        
        filename = f"VL_Report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except Exception as e:
        logger.error(f"VL Excel error: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"success": False, "detail": str(e)})
# ============================================================================
# STARTUP EVENT
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """Initialize application on startup"""
    logger.info("=" * 60)
    logger.info("🚀 MedDQA v3.0 Starting Up...")
    logger.info(f"Setup complete: {is_setup_complete()}")
    
    if is_setup_complete():
        try:
            from app.database import emr_engine, dqa_engine
            if emr_engine:
                logger.info("✅ EMR Database connected")
            if dqa_engine:
                logger.info("✅ DQA Database connected")
        except Exception as e:
            logger.warning(f"Database initialization: {e}")
    
    logger.info("=" * 60)

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("MedDQA shutting down...")
    record_locks.clear()
    active_sessions.clear()

# ============================================================================
# MAIN ENTRY POINT
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )