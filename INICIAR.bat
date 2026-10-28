@echo off
setlocal
cd /d "%~dp0"
title ApolloCut

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js nao encontrado. Instale em https://nodejs.org e rode este arquivo de novo.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\esbuild" (
  echo Instalando dependencias ^(so na primeira vez^)...
  call npm install --legacy-peer-deps
  if errorlevel 1 (
    echo.
    echo Falhou o npm install. Verifique a conexao e tente de novo.
    pause
    exit /b 1
  )
)

if not exist "vendor\transformers.bundle.mjs" (
  echo Preparando o Whisper local ^(so na primeira vez, ~1 min^)...
  call npm run vendor
  if errorlevel 1 (
    echo.
    echo Falhou ao preparar o Whisper. Rode: npm install ^&^& npm run vendor
    pause
    exit /b 1
  )
)

echo.
echo ApolloCut em http://localhost:4173
echo Feche esta janela para encerrar.
echo.

start "" cmd /c "timeout /t 2 >nul & start "" http://localhost:4173"
node tools\servir.mjs 4173
pause
