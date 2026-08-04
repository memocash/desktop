const fs = require("fs/promises")
const path = require("path")
const {pathToFileURL} = require("url")
const {app, net, protocol, session} = require("electron")
const {ContentSecurityPolicyHeader} = require("./common/util")

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
            // The policy the page carries in its meta tag, delivered as a
            // header too: the header covers every asset served here, not only
            // documents that remembered their tag, and it is the only way
            // frame-ancestors is honored at all. A fetched Response's headers
            // are immutable, so the body travels on under a new envelope.
            const response = await net.fetch(pathToFileURL(file).href)
            const headers = new Headers(response.headers)
            headers.set("Content-Security-Policy", ContentSecurityPolicyHeader())
            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers,
            })
        })
    })
}

module.exports = {RegisterRendererProtocol, ResolveRendererPath}
