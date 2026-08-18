/**
 * Preload — ponte segura entre o renderer (frontend) e o Electron.
 * Mantém contextIsolation; expõe apenas o mínimo necessário.
 */
import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("nephyrus", {
  isDesktop: true,
  platform: process.platform,
});
