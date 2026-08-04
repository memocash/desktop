const {app, nativeImage, session} = require('electron')
const path = require('path')
const isDev = require('electron-is-dev')
const prepareNext = require('electron-next')
const {CreateWindow} = require("./app/window");
const {AllHandlers} = require("./app/handlers");
const {ApplyStoredTheme} = require("./app/handlers/theme");
const {TightenWalletPermissions} = require("./app/keystore");
const {ScheduleUpdateChecks} = require("./app/handlers/update");
const {RegisterRendererProtocol} = require("./static_server");

// In dev, electron-next runs the Next dev server on localhost:8000 (with hot
// reload). In a packaged build there is no Next process, so serve the static
// export over a custom app:// protocol, which needs no TCP port. Registering the
// scheme has to happen before the app 'ready' event, so this is called at module
// load rather than inside whenReady. The dev/prod URL split lives in window.js.
if (!isDev) {
    RegisterRendererProtocol("renderer/out")
}

app.whenReady().then(async () => {
    // The wallet has no feature that needs a Chromium permission. Deny at the
    // session boundary even if a future page or dependency asks for one.
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
    session.defaultSession.setPermissionCheckHandler(() => false)
    // BrowserWindow's icon option is ignored by macOS. Explicitly set the Dock
    // icon as well so packaged builds do not retain Electron's runtime icon.
    if (process.platform === 'darwin') {
        const iconPath = path.join(__dirname, '..', 'build', 'icon.png')
        app.dock.setIcon(nativeImage.createFromPath(iconPath))
    }
    if (isDev) {
        await prepareNext('./renderer')
    }
    // Before any window can list or open a wallet, so nothing races the files
    // while they are still sitting at the modes an earlier release left.
    await TightenWalletPermissions()
    ApplyStoredTheme()
    AllHandlers()
    await CreateWindow()
    ScheduleUpdateChecks()
})
