const {app} = require('electron')
const isDev = require('electron-is-dev')
const prepareNext = require('electron-next')
const serve = require('electron-serve')
const {CreateWindow} = require("./app/window");
const {AllHandlers} = require("./app/handlers");
const {ApplyStoredTheme} = require("./app/handlers/theme");

// In dev, electron-next runs the Next dev server on localhost:8000 (with hot
// reload). In a packaged build there is no Next process, so serve the static
// export over a custom app:// protocol - the conventional Electron/Nextron
// approach, which needs no TCP port. Registering the scheme has to happen before
// the app 'ready' event, so serve() is called here at module load, not inside
// whenReady. The dev/prod URL split lives in window.js.
if (!isDev) {
    serve({directory: "renderer/out"})
}

app.whenReady().then(async () => {
    if (isDev) {
        await prepareNext('./renderer')
    }
    ApplyStoredTheme()
    AllHandlers()
    await CreateWindow()
})
