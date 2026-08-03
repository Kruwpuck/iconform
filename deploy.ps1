# deploy.ps1 — build/redeploy/run ICONFORM (Windows PowerShell)
#
#   .\deploy.ps1            -> pull latest, rebuild, restart (default)
#   .\deploy.ps1 up         -> start containers (no rebuild)
#   .\deploy.ps1 down       -> stop containers
#   .\deploy.ps1 rebuild    -> rebuild image + restart (no git pull)
#   .\deploy.ps1 logs       -> tail app logs
#   .\deploy.ps1 migrate    -> apply schema to DB (prisma db push)
#   .\deploy.ps1 seed       -> run seed script in container
#   .\deploy.ps1 psql       -> open psql shell on the DB
#   .\deploy.ps1 status     -> show container status
#
# Requires: Docker Desktop, Git — both in PATH
param([string]$cmd = "redeploy")

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$APP = "iconform-app"
$DB  = "iconform-db"

function Wait-Healthy {
    Write-Host "Waiting for app..."
    for ($i = 1; $i -le 60; $i++) {
        $status = docker compose ps $APP 2>$null
        if ($status -match "Up") { Write-Host "App is up."; return }
        Start-Sleep -Seconds 2
    }
    Write-Warning "App not up after 120s — run: .\deploy.ps1 logs"
}

switch ($cmd) {
    "redeploy" {
        Write-Host "git pull..."
        git pull --rebase origin main
        Write-Host "Building..."
        docker compose build $APP
        Write-Host "Restarting..."
        docker compose up -d
        Wait-Healthy
    }
    "rebuild" {
        docker compose build $APP
        docker compose up -d
        Wait-Healthy
    }
    "up" {
        docker compose up -d
        Wait-Healthy
    }
    "down"    { docker compose down }
    "logs"    { docker compose logs -f --tail=100 $APP }
    "migrate" { docker compose exec $APP prisma db push --accept-data-loss }
    "seed"    { docker compose exec $APP node prisma/seed.cjs }
    "psql"    { docker compose exec $DB psql -U iconform -d iconform }
    "status"  { docker compose ps }
    default   { Write-Error "Unknown command: $cmd — see header for options" }
}
