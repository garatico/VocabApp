#!/usr/bin/env python3
"""
Deploy SQLite database from DataPipeline to App backend
"""

import shutil
import os
from pathlib import Path

# Paths
root_dir = Path("/sessions/bold-sweet-euler/mnt/VocabApp")
source_db = root_dir / "VocabApp-DataPipeline" / "data" / "vocabulary.db"
dest_dir = root_dir / "VocabApp-App" / "backend" / "data"
dest_db = dest_dir / "vocabulary.db"

print("📦 Deploying SQLite Database\n")
print(f"Source: {source_db}")
print(f"Destination: {dest_db}\n")

# Verify source exists
if not source_db.exists():
    print(f"❌ Error: Database not found at {source_db}")
    exit(1)

print(f"✓ Source database exists ({os.path.getsize(source_db) / 1024:.0f}KB)")

# Create destination directory
dest_dir.mkdir(parents=True, exist_ok=True)
print(f"✓ Destination directory ready")

# Copy database
try:
    shutil.copy2(source_db, dest_db)
    print(f"✓ Database copied successfully")
    print(f"  Size: {os.path.getsize(dest_db) / 1024:.0f}KB")
except Exception as e:
    print(f"❌ Error copying database: {e}")
    exit(1)

# Verify copy
if dest_db.exists():
    source_size = os.path.getsize(source_db)
    dest_size = os.path.getsize(dest_db)
    if source_size == dest_size:
        print(f"\n✅ Database successfully deployed!")
        print(f"\n📄 Files in {dest_dir}:")
        for f in sorted(dest_dir.glob("*")):
            size = os.path.getsize(f) / 1024
            print(f"   {f.name:30} {size:>6.0f}KB")
    else:
        print(f"⚠️  Warning: File sizes don't match")
        print(f"   Source: {source_size} bytes")
        print(f"   Dest:   {dest_size} bytes")
        exit(1)
else:
    print(f"❌ Error: Database was not copied")
    exit(1)
