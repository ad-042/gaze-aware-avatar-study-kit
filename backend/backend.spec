# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the Gaze-Aware Avatar Study Kit backend.

Produces a one-directory bundle (``backend/``) containing ``backend.exe``
and a ``_internal/`` folder with all dependencies.

Usage (from the backend/ directory):
    pyinstaller backend.spec --noconfirm

Or with a custom output path (used by the release build script):
    pyinstaller backend.spec --distpath ../electron/resources --noconfirm
"""

from PyInstaller.utils.hooks import collect_submodules

hiddenimports = []
hiddenimports += collect_submodules("app")
hiddenimports += collect_submodules("uvicorn")

a = Analysis(
    ["run.py"],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="backend",
    debug=False,
    strip=False,
    upx=False,
    console=True,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="backend",
)
