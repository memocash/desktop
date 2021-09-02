const {contextBridge} = require("electron");

let Versions = {}
for (const dependency of ['chrome', 'node', 'electron']) {
    Versions[dependency] = process.versions[dependency]
}
contextBridge.exposeInMainWorld("Versions", Versions);
