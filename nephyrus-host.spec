# -*- mode: python ; coding: utf-8 -*-
"""Spec do PyInstaller para o backend do Nephyrus VTT (nephyrus-host).

Gera um bundle onedir com o servidor FastAPI/Uvicorn. O frontend e as pastas
graváveis (data/storage) NÃO entram aqui — são fornecidos pelo Electron via
resources e variáveis de ambiente NEFERUS_*.
"""

from PyInstaller.utils.hooks import collect_submodules

hiddenimports = (
    collect_submodules("uvicorn")
    + collect_submodules("backend")
    + ["h11", "websockets", "anyio"]
)

a = Analysis(
    ["desktop_host.py"],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter"],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="nephyrus-host",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="nephyrus-host",
)
