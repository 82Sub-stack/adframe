const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('adframeDesktop', {
  selectOutputDirectory: () => ipcRenderer.invoke('adframe:select-output-directory'),
  getAppInfo: () => ipcRenderer.invoke('adframe:get-app-info'),
  openExternal: (url) => ipcRenderer.invoke('adframe:open-external', url),
});
