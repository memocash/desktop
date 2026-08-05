const {app, nativeImage, session} = require('electron')
const path = require('path')
const isDev = !app.isPackaged
const {ApplyContentsSecurity, CreateWindow} = require("./app/window");
const {AllHandlers} = require("./app/handlers");
const {ApplyStoredTheme} = require("./app/handlers/theme");
const {SweepStrandedTempFiles, TightenWalletPermissions} = require("./app/keystore");
const {ScheduleUpdateChecks} = require("./app/handlers/update");
const {RegisterRendererProtocol} = require("./static_server");

// A throw that escapes every handler would otherwise kill the process that
// holds the keys and every wallet window with it, mid-operation and with no
// record of why. Nothing about the process state is trustworthy after one, so
// log it and exit deliberately instead of limping on.
process.on("uncaughtException", (err) => {
    console.error("uncaught exception in main process")
    console.error(err)
    app.exit(1)
})

// In dev, a spawned `next dev` child serves the renderer on localhost:8000
// (with hot reload). In a packaged build there is no Next process, so serve the
// static export over a custom app:// protocol, which needs no TCP port.
// Registering the scheme has to happen before the app 'ready' event, so this is
// called at module load rather than inside whenReady. The dev/prod URL split
// lives in ipc.js.
if (!isDev) {
    RegisterRendererProtocol("renderer/out")
}

// Every WebContents the app will ever create - wallet windows, transaction
// viewers, the spend prompt, anything a future feature opens - gets the
// window-open and navigation lockdown at creation, before it has loaded a
// byte. Structural, so no window type can be added without it.
app.on("web-contents-created", (_e, contents) => ApplyContentsSecurity(contents))

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
        // The dev server script imports esbuild (a devDependency that does not
        // exist in packaged builds), so it can only start on this branch. The
        // app handle goes along so the child dies with the app even when quit
        // arrives before the server has turned ready.
        await require("./dev_server").StartDevServer(
            path.join(__dirname, "..", "scripts", "dev-renderer.js"), app)
    }
    // Before any window can list or open a wallet, so nothing races the files
    // while they are still sitting at the modes an earlier release left.
    await TightenWalletPermissions()
    await SweepStrandedTempFiles()
    ApplyStoredTheme()
    AllHandlers()
    await CreateWindow()
    ScheduleUpdateChecks()
})
