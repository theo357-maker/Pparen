@echo off
echo === Déploiement CS La Colombe ===

REM Lire la version actuelle
for /f "tokens=2 delimiters=''" %%a in ('findstr "const APP_VERSION =" sw.js') do set CURRENT_VERSION=%%a
echo Version actuelle: %CURRENT_VERSION%

REM Incrémenter la version
for /f "tokens=1,2,3 delims=." %%a in ("%CURRENT_VERSION%") do (
  set /a MAJOR=%%a
  set /a MINOR=%%b
  set /a PATCH=%%c+1
)
set NEW_VERSION=%MAJOR%.%MINOR%.%PATCH%
echo Nouvelle version: %NEW_VERSION%

REM Mettre à jour les fichiers
powershell -Command "(Get-Content sw.js) -replace 'const APP_VERSION = ''%CURRENT_VERSION%''', 'const APP_VERSION = ''%NEW_VERSION%''' | Set-Content sw.js"
powershell -Command "(Get-Content sw.js) -replace 'const CACHE_NAME = \`colombe-cache-v%CURRENT_VERSION%\`', 'const CACHE_NAME = \`colombe-cache-v%NEW_VERSION%\`' | Set-Content sw.js"

powershell -Command "(Get-Content version-manifest.json) -replace '\"currentVersion\": \"%CURRENT_VERSION%\"', '\"currentVersion\": \"%NEW_VERSION%\"' | Set-Content version-manifest.json"

for /f "tokens=2 delims==" %%a in ('wmic os get localdatetime /value') do set DATETIME=%%a
set TODAY=%DATETIME:~0,4%-%DATETIME:~4,2%-%DATETIME:~6,2%
powershell -Command "(Get-Content version-manifest.json) -replace '\"releaseDate\": \".*\"', '\"releaseDate\": \"%TODAY%\"' | Set-Content version-manifest.json"

set /p CHANGELOG=Entrez les notes de version: 
powershell -Command "(Get-Content version-manifest.json) -replace '\"changelog\": \".*\"', '\"changelog\": \"%CHANGELOG%\"' | Set-Content version-manifest.json"

echo.
echo ✅ Version mise à jour à %NEW_VERSION%
echo 📅 Date: %TODAY%
echo 📝 Changelog: %CHANGELOG%
echo.
echo 🚀 Prêt pour le déploiement!
pause