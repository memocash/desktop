const fs = require("fs/promises")
const path = require("path")
const {pathToFileURL} = require("url")
const {app, net, protocol, session} = require("electron")

const ResolveRendererPath = (root, pathname) => {
    let decoded
    try {
        decoded = decodeURIComponent(pathname)
    } catch (_) {
        return null
    }
    const resolved = path.resolve(root, "." + decoded)
    const relative = path.relative(root, resolved)
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        return null
    }
    return resolved
}

const findFile = async (candidate) => {
    try {
        const stat = await fs.stat(candidate)
        return stat.isDirectory() ? findFile(path.join(candidate, "index.html")) : candidate
    } catch (_) {
        return null
    }
}

const RegisterRendererProtocol = (directory) => {
    const root = path.resolve(app.getAppPath(), directory)
    protocol.registerSchemesAsPrivileged([{
        scheme: "app",
        // Renderer requests stay on this one origin, so cross-origin CORS
        // privilege is unnecessary. Service workers are deliberately omitted.
        privileges: {standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true},
    }])
    app.on("ready", () => {
        session.defaultSession.protocol.handle("app", async (request) => {
            const candidate = ResolveRendererPath(root, new URL(request.url).pathname)
            const file = candidate && await findFile(candidate)
            if (!file) {
                return new Response(null, {status: 404, statusText: "Not Found"})
            }
            return net.fetch(pathToFileURL(file).href)
        })
    })
}

module.exports = {RegisterRendererProtocol, ResolveRendererPath}
