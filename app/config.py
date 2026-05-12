"""
MedDQA System Configuration
Handles all configuration with proper defaults and error messages
"""

import os
import sys
from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import Field, field_validator

class Settings(BaseSettings):
    """Application settings with validation"""
    
    # Application
    APP_NAME: str = "MedDQA"
    VERSION: str = "1.0.0"
    DEBUG: bool = False
    
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # EMR Database (Existing)
    EMR_DB_HOST: str = "localhost"
    EMR_DB_PORT: int = 5432
    EMR_DB_NAME: str = "emr_database"
    EMR_DB_USER: str = "postgres"
    EMR_DB_PASSWORD: str = "postgres"
    
    # DQA Database (New)
    DQA_DB_HOST: str = "localhost"
    DQA_DB_PORT: int = 5432
    DQA_DB_NAME: str = "dqa_database"
    DQA_DB_USER: str = "postgres"
    DQA_DB_PASSWORD: str = "postgres"
    
    # Redis (Optional)
    REDIS_URL: Optional[str] = None
    
    # Security
    SECRET_KEY: str = "change-this-in-production"
    
    # Session
    SESSION_EXPIRY_MINUTES: int = 30
    
    # ✅ Strip quotes and whitespace from ALL string fields
    @field_validator('*', mode='before')
    @classmethod
    def clean_strings(cls, v):
        if isinstance(v, str):
            v = v.strip()
            # Remove surrounding quotes
            if (v.startswith("'") and v.endswith("'")) or \
               (v.startswith('"') and v.endswith('"')):
                v = v[1:-1]
            # Remove any extra spaces
            v = v.strip()
        return v
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

# Create settings instance
try:
    settings = Settings()
except Exception as e:
    print(f"⚠️  Configuration warning: {e}")
    print("Using default settings. Please run setup to configure properly.")
    settings = Settings()