const fs = require("fs")
const path = require("path")
const http = require("http")
const esbuild = require("esbuild")
const {BuildOptions, WriteStatic, outDir} = require("./build-renderer")

// Development stand-in for the packaged app:// handler: main spawns this
// script when not packaged (see main/dev_server.js) and loads its windows
// from it. Serves the same renderer/out tree a build ships, with esbuild
// rebuilding the bundles on change - reload the window to pick a rebuild up.
const Port = Number(process.argv[2]) || 8000

const ContentTypes = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".map": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
}

// Same resolution the packaged server performs: a path is a file inside the
// export, or a directory holding an index.html - /tx serves tx/index.html.
// The URL parser upstream already folds dotted segments and leaves encoded
// ones undecoded; the containment check here is the second lock on the same
// door, and has to be segment-exact so a sibling directory sharing the
// root's prefix does not pass as inside it.
const Resolve = (root, urlPath) => {
    const file = path.normalize(path.join(root, urlPath))
    if (file !== root && !file.startsWith(root + path.sep)) {
        return null
    }
    for (const candidate of [file, path.join(file, "index.html")]) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            return candidate
        }
    }
    return null
}

const Serve = async () => {
    fs.rmSync(outDir, {recursive: true, force: true})
    WriteStatic()
    const context = await esbuild.context({
        ...BuildOptions,
        sourcemap: "inline",
        define: {"process.env.NODE_ENV": '"development"'},
    })
    // The first build completes before the listener announces itself: main
    // treats the ready line as permission to load windows, so nothing may
    // print it while the export is still half-written. A build failure here
    // kills the child, which main reports as the dev server dying.
    await context.rebuild()
    await context.watch()
    http.createServer((request, response) => {
        const file = Resolve(outDir, new URL(request.url, "http://localhost").pathname)
        if (file === null) {
            response.writeHead(404).end("not found")
            return
        }
        response.writeHead(200, {"Content-Type": ContentTypes[path.extname(file)] || "application/octet-stream"})
        fs.createReadStream(file).pipe(response)
    }).listen(Port, "localhost", () => {
        // The line main/dev_server.js watches for; it must outlive rewording
        // whims, so keep "Ready on" intact.
        console.log("Ready on http://localhost:" + Port + " - rebuilding on change, reload to pick up")
    })
}

module.exports = {Resolve}

if (require.main === module) {
    Serve()
}
