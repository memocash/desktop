const {app} = require('electron')
const prepareNext = require('electron-next')
const {CreateWindow} = require("./app/window");
const {AllHandlers} = require("./app/handlers");

app.whenReady().then(async () => {
    await prepareNext('./renderer')
    AllHandlers()
    await CreateWindow()
})
