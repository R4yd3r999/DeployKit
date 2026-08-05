const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('deploykit', {
  // Datos
  getPrograms: () => ipcRenderer.invoke('programs:list'),
  getTools: () => ipcRenderer.invoke('tools:list'),

  // Configuración persistente
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (partial) => ipcRenderer.invoke('settings:set', partial),
  getDefaultDownloadDir: () => ipcRenderer.invoke('settings:default-download-dir'),
  pickDownloadFolder: () => ipcRenderer.invoke('settings:pick-folder'),

  // Perfil de selección
  exportProfile: (payload) => ipcRenderer.invoke('profile:export', payload),
  importProfile: () => ipcRenderer.invoke('profile:import'),

  // Dependencias
  checkDependency: (method) => ipcRenderer.invoke('dep:check', method),
  installDependency: (method) => ipcRenderer.invoke('dep:install', method),
  onDepStream: (cb) => ipcRenderer.on('dep:stream', (_e, payload) => cb(payload)),

  // Instalación de programas (página Programas)
  installProgram: (program, method, mode) => ipcRenderer.invoke('program:install', { program, method, mode }),
  onInstallStream: (cb) => ipcRenderer.on('install:stream', (_e, payload) => cb(payload)),

  // Útiles (runtimes / herramientas) — se identifican por tool.id
  toolStatus: (toolId) => ipcRenderer.invoke('tool:status', toolId),
  toolInstall: (toolId) => ipcRenderer.invoke('tool:install', toolId),
  toolUpdate: (toolId) => ipcRenderer.invoke('tool:update', toolId),
  onToolStream: (cb) => ipcRenderer.on('tool:stream', (_e, payload) => cb(payload)),

  // Ventana (los botones min/max/cerrar son nativos vía titleBarOverlay)
  setTitlebarTheme: (theme) => ipcRenderer.send('window:set-titlebar-theme', theme),
});
