#!/usr/bin/env python3
"""
MedDQA Ultimate - Simple Build Script
"""

import os
import sys
import subprocess
import shutil
import time

def kill_processes():
    """Kill any running MedDQA processes"""
    print("Killing any running MedDQA processes...")
    subprocess.run("taskkill /f /im MedDQA.exe 2>nul", shell=True)
    time.sleep(2)

def clean_build():
    """Clean build directories"""
    print("Cleaning build directories...")
    for dir_name in ['build', 'dist']:
        if os.path.exists(dir_name):
            try:
                shutil.rmtree(dir_name)
                print(f"  Removed {dir_name}")
            except Exception as e:
                print(f"  Warning: Could not remove {dir_name}")
    
    # Remove spec files
    for spec in os.listdir('.'):
        if spec.endswith('.spec'):
            os.remove(spec)
            print(f"  Removed {spec}")

def build_exe():
    """Build the executable"""
    print("\nBuilding MedDQA executable...")
    print("This will take 5-10 minutes...")
    
    # Build command - simplified
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",  # Single file executable
        "--name=MedDQA",
        "--add-data=app;app",
        "--hidden-import=uvicorn",
        "--hidden-import=uvicorn.lifespan",
        "--hidden-import=fastapi",
        "--hidden-import=jinja2",
        "--hidden-import=sqlalchemy",
        "--hidden-import=pydantic",
        "--hidden-import=psycopg2",
        "--hidden-import=dotenv",
        "--hidden-import=openpyxl",
        "--hidden-import=pandas",
        "--collect-all=fastapi",
        "--collect-all=uvicorn",
        "--exclude-module=setuptools",
        "--exclude-module=pytest",
        "--exclude-module=unittest",
        "--exclude-module=tkinter",
        "--exclude-module=matplotlib",
        "--clean",
        "--noconfirm",
        "run.py"
    ]
    
    result = subprocess.run(cmd)
    return result.returncode == 0

def main():
    print("=" * 60)
    print("     MedDQA Ultimate Builder")
    print("=" * 60)
    
    # Kill existing processes
    kill_processes()
    
    # Clean
    clean_build()
    
    # Build
    if build_exe():
        print("\n" + "=" * 60)
        print("✅ BUILD SUCCESSFUL!")
        print("=" * 60)
        print(f"\nExecutable: {os.getcwd()}\\dist\\MedDQA.exe")
        print("\nTo run: double-click MedDQA.exe")
    else:
        print("\n" + "=" * 60)
        print("❌ BUILD FAILED!")
        print("=" * 60)
        print("\nTry running as Administrator or close any running MedDQA processes")
    
    print("\nPress Enter to exit...")
    input()

if __name__ == "__main__":
    main()