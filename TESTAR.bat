@echo off
setlocal
cd /d "%~dp0"
title ApolloCut - testes

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale em https://nodejs.org e rode este arquivo de novo.
  pause
  exit /b 1
)

if not exist "node_modules\playwright" (
  echo Instalando dependencias ^(so na primeira vez^)...
  call npm install --legacy-peer-deps
)

if not exist "vendor\transformers.bundle.mjs" (
  echo Preparando o Whisper local ^(so na primeira vez^)...
  call npm run vendor
)

echo.
echo Rodando as verificacoes. A transcricao leva alguns minutos na primeira vez.
echo Evidencias em docs\evidencias\
echo.

node tests\e2e\run-all.mjs
set RESULT=%ERRORLEVEL%
echo.
if "%RESULT%"=="0" (echo RESULTADO: APROVADO) else (echo RESULTADO: REPROVADO)
pause
exit /b %RESULT%
