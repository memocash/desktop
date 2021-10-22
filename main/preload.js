const {ipcRenderer, contextBridge} = require('electron')
const fs = require("fs")
const homedir = require('os').homedir()

contextBridge.exposeInMainWorld('electron', {
    message: {
        send: (payload) => ipcRenderer.send('message', payload),
        on: (handler) => ipcRenderer.on('message', handler),
        off: (handler) => ipcRenderer.off('message', handler),
    },
    getFile: async () => {
        return new Promise((res, rej) => {
            fs.readFile(homedir + "/.bash_profile", "utf8", (err, data) => {
                if (err) {
                    rej(err)
                    return
                }
                res(data)
            })
        })
    }
})
