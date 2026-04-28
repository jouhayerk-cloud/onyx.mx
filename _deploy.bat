@echo off
echo [1/3] Committing source changes...
git add -A
git commit -m "v1.81.4 - Logistics Stabilization: Fixed PDF hangs, recursive weight TypeErrors, and logical nesting relationships"
git push origin main






echo [2/3] Building production bundle...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo BUILD FAILED - aborting deploy
    exit /b 1
)

echo [3/3] Deploying to GitHub Pages...
call npx gh-pages -d dist
echo Deploy complete.
