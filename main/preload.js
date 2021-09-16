const {ipcRenderer, contextBridge} = require('electron')

let Versions = {}
for (const dependency of ['chrome', 'node', 'electron']) {
    Versions[dependency] = process.versions[dependency]
}
contextBridge.exposeInMainWorld("Versions", Versions);

contextBridge.exposeInMainWorld('electron', {
    message: {
        send: (payload) => ipcRenderer.send('message', payload),
        on: (handler) => ipcRenderer.on('message', handler),
        off: (handler) => ipcRenderer.off('message', handler),
    },
})
