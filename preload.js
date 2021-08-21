const {contextBridge} = require("electron");

let Versions = {}
for (const dependency of ['chrome', 'node', 'electron']) {
    Versions[dependency] = process.versions[dependency]
    //replaceText(`${dependency}-version`, process.versions[dependency])
}
contextBridge.exposeInMainWorld("Versions", Versions);

/*window.addEventListener('DOMContentLoaded', () => {
    const replaceText = (selector, text) => {
        const element = document.getElementById(selector)
        if (element) element.innerText = text
    }
    window.Versions = {}
    for (const dependency of ['chrome', 'node', 'electron']) {
        window.Versions[dependency] = process.versions[dependency]
        //replaceText(`${dependency}-version`, process.versions[dependency])
    }
})*/
