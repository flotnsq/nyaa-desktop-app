const { contextBridge, ipcRenderer } = require('electron/renderer')

contextBridge.exposeInMainWorld('electronAPI', {
  // Define functions here that the renderer process (index.html/renderer.js)
  // can call to interact with the main process (main.js)
  searchNyaa: (term, page, options) => ipcRenderer.invoke('search-nyaa', term, page, options),
  searchNyaaPage: (term, page, options) => ipcRenderer.invoke('search-nyaa-page', term, page, options),
  getTorrentDetails: (torrentId) => ipcRenderer.invoke('get-torrent-details', torrentId),
  openExternalLink: (url) => ipcRenderer.send('open-external-link', url),
  downloadFile: (downloadInfo) => ipcRenderer.invoke('download-file', downloadInfo),
  downloadTorrent: (url, filename) => ipcRenderer.invoke('download-torrent', url, filename),
  cancelDownload: (downloadId) => ipcRenderer.invoke('cancel-download', downloadId),
  onDownloadStarted: (callback) => ipcRenderer.on('download-started', (_event, value) => callback(value)),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (_event, value) => callback(value)),
  onDownloadComplete: (callback) => ipcRenderer.on('download-complete', (_event, value) => callback(value)),
  onDownloadUpdate: (callback) => ipcRenderer.on('download-update', callback),
  removeDownloadListeners: () => {
    ipcRenderer.removeAllListeners('download-started');
    ipcRenderer.removeAllListeners('download-progress');
    ipcRenderer.removeAllListeners('download-complete');
  },
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  performSearch: (term, page, filters, sortBy, sortOrder) => ipcRenderer.invoke('perform-search', term, page, filters, sortBy, sortOrder),
  openContainingFolder: (filePath) => ipcRenderer.send('open-containing-folder', filePath)
})
