#!/usr/bin/env python3
"""
VocabApp Monorepo Reorganizer
Moves files into VocabApp-App and VocabApp-DataPipeline subdirectories
"""

import os
import shutil
from pathlib import Path

# Get the VocabApp directory
vocabapp_root = Path(__file__).parent
print(f"📁 Working in: {vocabapp_root}\n")

# Define source and target directories
app_dir = vocabapp_root / "VocabApp-App"
pipeline_dir = vocabapp_root / "VocabApp-DataPipeline"

# Create directories if they don't exist
app_dir.mkdir(exist_ok=True)
pipeline_dir.mkdir(exist_ok=True)
(pipeline_dir / "scripts").mkdir(exist_ok=True)
(pipeline_dir / "data" / "sources").mkdir(parents=True, exist_ok=True)
(pipeline_dir / "archive").mkdir(exist_ok=True)

print("📂 Created directory structure\n")

# Files/folders to move to VocabApp-App
app_items = [
    "backend",
    "public",
    "packages",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "vite.config.js",
    ".gitignore",
    ".env.example",
    "README.md",
    "ARCHITECTURE.md",
    "node_modules"
]

print("Moving to VocabApp-App/:")
for item in app_items:
    source = vocabapp_root / item
    target = app_dir / item

    if not source.exists():
        continue

    try:
        if source.is_dir():
            if target.exists():
                shutil.rmtree(target)
            shutil.move(str(source), str(target))
        else:
            shutil.move(str(source), str(target))
        print(f"  ✓ {item}")
    except Exception as e:
        print(f"  ✗ {item}: {e}")

# Files/folders to move to VocabApp-DataPipeline
print("\nMoving to VocabApp-DataPipeline/:")

# Move backend/scripts to DataPipeline/scripts
backend_scripts = vocabapp_root / "backend" / "scripts"
if backend_scripts.exists():
    for script_file in backend_scripts.glob("*"):
        try:
            if script_file.is_file():
                shutil.move(str(script_file), str(pipeline_dir / "scripts" / script_file.name))
        except Exception as e:
            print(f"  ✗ scripts/{script_file.name}: {e}")
    print(f"  ✓ backend/scripts → scripts/")

# Move backend/data to DataPipeline/data
backend_data = vocabapp_root / "backend" / "data"
if backend_data.exists():
    for data_file in backend_data.glob("*"):
        try:
            if data_file.is_file() and data_file.suffix == ".json":
                shutil.move(str(data_file), str(pipeline_dir / "data" / data_file.name))
        except Exception as e:
            print(f"  ✗ data/{data_file.name}: {e}")

    # Move data/sources CSV files
    sources_dir = backend_data / "sources"
    if sources_dir.exists():
        for csv_file in sources_dir.glob("*.csv"):
            try:
                shutil.move(str(csv_file), str(pipeline_dir / "data" / "sources" / csv_file.name))
            except Exception as e:
                print(f"  ✗ data/sources/{csv_file.name}: {e}")
    print(f"  ✓ backend/data → data/")

# Move archive if it exists
archive_src = vocabapp_root / "archive"
archive_dst = pipeline_dir / "archive"
if archive_src.exists():
    try:
        if archive_dst.exists():
            shutil.rmtree(archive_dst)
        shutil.move(str(archive_src), str(archive_dst))
        print(f"  ✓ archive/ → archive/")
    except Exception as e:
        print(f"  ✗ archive: {e}")

print("\n" + "="*60)
print("✅ Reorganization complete!\n")
print("Your structure is now:")
print("""
VocabApp/
├── VocabApp-App/          (the web application)
│   ├── backend/
│   ├── public/
│   ├── packages/
│   ├── package.json
│   └── ...
├── VocabApp-DataPipeline/ (data management tool)
│   ├── scripts/
│   ├── data/
│   │   ├── sources/ (CSV seeds)
│   │   └── *.json (generated vocab)
│   └── archive/
└── reorganize.py
""")

print("\n📝 Next steps:")
print("1. Create a root README.md to explain the structure")
print("2. In VocabApp-App/: npm install && npm run dev")
print("3. In VocabApp-DataPipeline/: node scripts/generate-from-csv.js spanish")
