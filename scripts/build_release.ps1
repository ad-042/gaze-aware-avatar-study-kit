# Build a portable Windows release of gaze-aware-avatar-study-kit.
#
# Prerequisites:
#   - Node.js 22+, npm
#   - Python 3.11+ with backend venv set up (pip install -e ".[dev]")
#   - PyInstaller installed in backend venv (pip install -e ".[package]")
#
# Optional:
#   - pyzmq installed in backend venv for Tobii support (pip install -e ".[tobii]")
#
# Output:
#   release/win-unpacked/   - portable app directory
#
# Usage:
#   .\scripts\build_release.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Write-Host "=== gaze-aware-avatar-study-kit Windows release build ===" -ForegroundColor Cyan
Write-Host ""

# ---------------------------------------------------------------
# 1. Clean stale build artifacts
# ---------------------------------------------------------------
Write-Host "--- Cleaning stale artifacts ---"

$backendResources = Join-Path $Root "electron\resources\backend"
if (Test-Path $backendResources) {
    Remove-Item -Recurse -Force $backendResources
    Write-Host "  Removed electron\resources\backend\"
}

$releaseDir = Join-Path $Root "release"
if (Test-Path $releaseDir) {
    Remove-Item -Recurse -Force $releaseDir
    Write-Host "  Removed release\"
}

# Also clean PyInstaller work dirs inside backend/
$backendBuild = Join-Path $Root "backend\build"
if (Test-Path $backendBuild) {
    Remove-Item -Recurse -Force $backendBuild
    Write-Host "  Removed backend\build\"
}

Write-Host ""

# ---------------------------------------------------------------
# 2. Build frontend
# ---------------------------------------------------------------
Write-Host "--- Building frontend ---"
Set-Location (Join-Path $Root "frontend")
npm run build
if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
Write-Host ""

# ---------------------------------------------------------------
# 3. Build backend executable (PyInstaller)
# ---------------------------------------------------------------
Write-Host "--- Building backend executable (PyInstaller) ---"
Set-Location (Join-Path $Root "backend")

# Use the venv's pyinstaller directly so activation is not required.
$pyinstaller = Join-Path $Root "backend\.venv\Scripts\pyinstaller.exe"
if (-not (Test-Path $pyinstaller)) {
    throw "PyInstaller not found at $pyinstaller - install with: pip install -e '.[package]'"
}

$distPath = Join-Path $Root "electron\resources"
& $pyinstaller backend.spec --distpath $distPath --noconfirm
if ($LASTEXITCODE -ne 0) { throw "PyInstaller build failed" }
Write-Host ""

# ---------------------------------------------------------------
# 4. Install electron dev deps if needed
# ---------------------------------------------------------------
Write-Host "--- Preparing Electron ---"
Set-Location (Join-Path $Root "electron")
npm install
if ($LASTEXITCODE -ne 0) { throw "Electron npm install failed" }
Write-Host ""

# ---------------------------------------------------------------
# 5. Build Electron + electron-builder
# ---------------------------------------------------------------
Write-Host "--- Building Electron release ---"
# Disable code signing - not needed for portable release.
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npm run build:release
if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }
Write-Host ""

# ---------------------------------------------------------------
# 6. Verify output
# ---------------------------------------------------------------
Write-Host "--- Verifying release output ---" -ForegroundColor Cyan
Set-Location $Root

$checks = @(
    "release\win-unpacked\gaze-aware-avatar-study-kit.exe",
    "release\win-unpacked\resources\backend\backend.exe",
    "release\win-unpacked\resources\frontend\dist\index.html",
    "release\win-unpacked\resources\study\demo-study\study.json"
)

$allOk = $true
foreach ($file in $checks) {
    $fullPath = Join-Path $Root $file
    if (Test-Path $fullPath) {
        Write-Host "  OK: $file" -ForegroundColor Green
    } else {
        Write-Host "  MISSING: $file" -ForegroundColor Red
        $allOk = $false
    }
}

Write-Host ""
if ($allOk) {
    Write-Host "Release build complete: release\win-unpacked\" -ForegroundColor Green
    Write-Host "Run the app: release\win-unpacked\gaze-aware-avatar-study-kit.exe"
} else {
    Write-Host "Release build incomplete - check errors above." -ForegroundColor Red
    exit 1
}
