@echo off
REM Inicializador do Host Neferus VTT no Windows.
REM Cria o venv na primeira execucao, instala dependencias e sobe o servidor.

cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo Criando ambiente virtual...
    python -m venv .venv
    call .venv\Scripts\activate.bat
    echo Instalando dependencias...
    python -m pip install --upgrade pip
    python -m pip install -r backend\requirements.txt
) else (
    call .venv\Scripts\activate.bat
)

echo Iniciando Neferus VTT...
python run.py

pause
