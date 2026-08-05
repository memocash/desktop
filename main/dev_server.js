// In dev the renderer comes from scripts/dev-renderer.js (esbuild rebuilding
// on change behind a static server). electron-next used to run the dev server
// inside this process, so the process holding wallet keys also hosted the
// whole renderer toolchain and an HTTP listener that bound every interface.
// Spawning the server as a child keeps the toolchain out of the key-holding
// process and pins the listener to loopback, which is all the window ever
// dials. Dev only; packaged builds serve the static export over app:// and
// never require this file's dev path.
const {spawn} = require("child_process")
const net = require("net")

const Port = 8000
const Host = "localhost"

// One TCP dial: can something already be reached at the dev address?
const Reachable = (port) => new Promise((resolve) => {
    const socket = net.connect(port, Host, () => {
        socket.destroy()
        resolve(true)
    })
    socket.on("error", () => resolve(false))
})

// Readiness has to be attributable to the spawned child, not to the shared
// port: probing the port again after the spawn would accept whatever process
// won it in the meantime, and the window would load a squatter's content.
// The server prints its ready line only once its own listener is bound, so
// watch the child's output for that, and fail if the child dies first - a
// squatter that wins the bind race makes the child die on EADDRINUSE, which
// lands here as a rejection rather than as a window pointed at the wrong
// server. Output keeps streaming through to the log afterwards; only the
// matching stops.
const WaitForReady = (child, log = process.stdout) => new Promise((resolve, reject) => {
    let seen = ""
    const scan = (chunk) => {
        log.write(chunk)
        if (seen === null) {
            return
        }
        seen += chunk.toString()
        if (seen.includes("Ready on")) {
            seen = null
            resolve()
        }
    }
    child.stdout.on("data", scan)
    child.stderr.on("data", scan)
    child.on("error", reject)
    child.on("exit", (code, signal) =>
        reject(new Error("renderer dev server exited with " + (signal || "code " + code))))
})

// Spawns the renderer dev server and resolves once it reports ready - which
// it prints only after its first build has finished, so the window never
// loads a half-written export. The app handle comes from the caller (and
// stays injectable for tests): the child has to be tied to quit the moment it
// exists, before readiness is awaited, or a quit during startup would leave
// an unmanaged server holding the port.
const StartDevServer = async (serverScript, app, port = Port) => {
    // Fail while the error can still say what is actually wrong; a squatter
    // that instead binds after this check surfaces through WaitForReady.
    if (await Reachable(port)) {
        throw new Error("something is already listening on " + Host + ":" + port)
    }
    // The child runs under Electron's own binary in Node mode, so dev builds
    // against the same Node the app embeds and needs no system node.
    const child = spawn(process.execPath,
        [serverScript, String(port)], {
            env: {...process.env, ELECTRON_RUN_AS_NODE: "1"},
            stdio: ["ignore", "pipe", "pipe"],
        })
    app.on("before-quit", () => child.kill())
    await WaitForReady(child)
    return child
}

module.exports = {
    Port: Port,
    Reachable: Reachable,
    StartDevServer: StartDevServer,
    WaitForReady: WaitForReady,
}
