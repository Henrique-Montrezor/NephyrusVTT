/**
 * Processo principal do Electron — o Mestre hospeda a mesa localmente.
 *
 * Ao iniciar: sobe o backend (FastAPI/Uvicorn) na máquina do Mestre, aguarda
 * o /health responder e então abre a janela apontando para o servidor local.
 * Os jogadores conectam pela rede local no IP do Mestre (o backend escuta em
 * 0.0.0.0). Não há servidor externo.
 */
import { app, BrowserWindow, shell } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import http from "node:http";

const HOST = "127.0.0.1";
const PORT = 8000;
const HEALTH_URL = `http://${HOST}:${PORT}/health`;
const APP_URL = `http://${HOST}:${PORT}/?campaign_id=lobby&user_id=host&is_gm=true`;

let backend: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;

/** Diretório raiz do projeto (em dev) — dois níveis acima de electron/dist. */
function repoRoot(): string {
  return resolve(__dirname, "..", "..");
}

/** Sobe o backend: em dev usa a venv; empacotado usa o executável em resources. */
function startBackend(): void {
  if (app.isPackaged) {
    const exeName = process.platform === "win32" ? "nephyrus-host.exe" : "nephyrus-host";
    const backendDir = join(process.resourcesPath, "backend");
    const exePath = join(backendDir, exeName);
    if (!existsSync(exePath)) {
      console.error(`[Electron] Backend empacotado não encontrado: ${exePath}`);
      return;
    }
    // Frontend vem de resources/web; dados/uploads vão para userData (gravável).
    const userData = app.getPath("userData");
    const env = {
      ...process.env,
      NEFERUS_FRONTEND_DIST_DIR: join(process.resourcesPath, "web"),
      NEFERUS_DATA_DIR: join(userData, "data"),
      NEFERUS_STORAGE_DIR: join(userData, "storage"),
    };
    backend = spawn(exePath, [], { cwd: backendDir, stdio: "inherit", env });
  } else {
    const root = repoRoot();
    const python =
      process.platform === "win32"
        ? join(root, ".venv", "Scripts", "python.exe")
        : join(root, ".venv", "bin", "python");
    const runner = existsSync(python) ? python : process.platform === "win32" ? "python" : "python3";
    backend = spawn(runner, ["run.py"], { cwd: root, stdio: "inherit" });
  }

  backend.on("exit", (code) => {
    console.info(`[Electron] Backend encerrado (code=${code}).`);
    backend = null;
  });
}

/** Faz um GET /health rápido; resolve true se um backend já está no ar. */
function isBackendUp(): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const req = http.get(HEALTH_URL, (res) => {
      res.resume();
      resolvePromise(res.statusCode === 200);
    });
    req.on("error", () => resolvePromise(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolvePromise(false);
    });
  });
}

/** Garante um backend disponível: reutiliza um já ativo ou sobe um novo. */
async function ensureBackend(): Promise<void> {
  if (await isBackendUp()) {
    console.info("[Electron] Backend já ativo — reutilizando.");
    return;
  }
  startBackend();
}

/** Aguarda o /health responder OK (poll até timeout). */
function waitForHealth(timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  return new Promise((resolvePromise, reject) => {
    const attempt = () => {
      const req = http.get(HEALTH_URL, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolvePromise();
        retry();
      });
      req.on("error", retry);
      req.setTimeout(2000, () => req.destroy());
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) return reject(new Error("Backend não respondeu ao /health a tempo."));
      setTimeout(attempt, 400);
    };
    attempt();
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: "#0b1020",
    title: "Nephyrus VTT",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Links externos abrem no navegador padrão, não numa janela do app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  void mainWindow.loadURL(APP_URL);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await ensureBackend();
  try {
    await waitForHealth();
  } catch (err) {
    console.error("[Electron]", (err as Error).message);
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("quit", () => {
  backend?.kill();
});
