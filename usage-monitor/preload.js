'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('usage', {
  get: () => ipcRenderer.invoke('usage:get'),
  refresh: () => ipcRenderer.invoke('usage:refresh'),
  onUpdate: (fn) => {
    const h = (_e, snap) => fn(snap);
    ipcRenderer.on('usage:update', h);
    return () => ipcRenderer.removeListener('usage:update', h);
  },
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  login: (id) => ipcRenderer.invoke('account:login', id),
  setHeight: (h) => ipcRenderer.send('panel:height', h),
  close: () => ipcRenderer.send('panel:close'),
  openUsagePage: (id) => ipcRenderer.send('open-usage-page', id),
  logout: (id) => ipcRenderer.invoke('account:logout', id),
});
