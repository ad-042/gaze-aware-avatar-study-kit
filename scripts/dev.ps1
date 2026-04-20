# Dev helper — start backend or frontend locally
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("backend", "frontend", "lint")]
    [string]$Target
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

switch ($Target) {
    "backend" {
        Set-Location "$Root\backend"
        Write-Host "Starting backend on http://127.0.0.1:8000 ..."
        uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
    }
    "frontend" {
        Set-Location "$Root\frontend"
        Write-Host "Starting frontend dev server ..."
        npm run dev
    }
    "lint" {
        Write-Host "=== Backend lint ==="
        Set-Location "$Root\backend"
        ruff check .
        ruff format --check .

        Write-Host ""
        Write-Host "=== Frontend lint ==="
        Set-Location "$Root\frontend"
        npm run lint

        Write-Host ""
        Write-Host "=== Frontend build ==="
        npm run build

        Write-Host ""
        Write-Host "All checks passed."
    }
}
