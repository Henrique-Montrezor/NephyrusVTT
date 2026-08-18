@echo off
REM ============================================================
REM  Nephyrus VTT - inicia o aplicativo desktop (Electron).
REM  O Mestre hospeda a mesa localmente; nao ha servidor externo.
REM  Basta dar um duplo-clique neste arquivo.
REM ============================================================
setlocal
cd /d "%~dp0"

REM 1) Garante o build do frontend (Preact/Vite) para o backend/app servir.
if not exist "frontend-react\dist\index.html" (
  echo [Nephyrus] Compilando o frontend...
  pushd "frontend-react"
  call node "node_modules\vite\bin\vite.js" build
  popd
)

REM 2) Compila o processo principal do Electron.
echo [Nephyrus] Compilando o app desktop...
call node "electron\node_modules\typescript\bin\tsc" -p "electron\tsconfig.json"

REM 3) Abre a janela do aplicativo (sobe o backend local automaticamente).
echo [Nephyrus] Abrindo o Nephyrus VTT...
"electron\node_modules\electron\dist\electron.exe" "electron"

endlocal
