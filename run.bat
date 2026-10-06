@echo off
cd /d "%~dp0"
if not exist "node_modules" (
    npm install --legacy-peer-deps
)
start http://localhost:3000
npm run dev
