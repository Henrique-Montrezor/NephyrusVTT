@echo off
REM ============================================================
REM  Nephyrus VTT - inicia o aplicativo desktop (Electron).
REM  O Mestre hospeda a mesa localmente; nao ha servidor externo.
REM  Basta dar um duplo-clique neste arquivo.
REM ============================================================
setlocal
cd /d "%~dp0"

REM 1) Recompila o frontend para nunca servir um bundle antigo incompatível
REM com o backend atual (por exemplo, o handshake WebSocket anterior ao JWT).
echo [Nephyrus] Compilando o frontend...
pushd "frontend-react"
call node "node_modules\vite\bin\vite.js" build
if errorlevel 1 (
  popd
  echo [Nephyrus] Falha ao compilar o frontend.
  exit /b 1
)
popd

REM 2) Compila o processo principal do Electron.
echo [Nephyrus] Compilando o app desktop...
call node "electron\node_modules\typescript\bin\tsc" -p "electron\tsconfig.json"
if errorlevel 1 (
  echo [Nephyrus] Falha ao compilar o app desktop.
  exit /b 1
)

REM 3) Abre a janela do aplicativo (sobe o backend local automaticamente).
echo [Nephyrus] Abrindo o Nephyrus VTT...
"electron\node_modules\electron\dist\electron.exe" "electron"

endlocal
