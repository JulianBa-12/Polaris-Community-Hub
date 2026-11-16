/*
 * POLARIS Client — Preload (Bridge zwischen Kirka-Seite und Client)
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('polaris', {
  // Einstellungen
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),
  exportConfig: () => ipcRenderer.invoke('config:export'),
  importConfig: () => ipcRenderer.invoke('config:import'),
  relaunch: () => ipcRenderer.invoke('app:relaunch'),

  // Quick CSS
  getCss: () => ipcRenderer.invoke('css:get'),
  saveCss: (css) => ipcRenderer.invoke('css:save', css),
  applyCss: (css) => ipcRenderer.invoke('css:apply', css),

  // Userscripts
  runScript: (code) => ipcRenderer.invoke('scripts:run', code),

  // Sonstiges
  openFolder: (which) => ipcRenderer.invoke('folder:open', which),
  updatePresence: (state) => ipcRenderer.invoke('presence:update', state),
});
