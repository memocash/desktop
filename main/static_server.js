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

// ResolveRendererPath vets the name that was asked for; this vets the file the
// filesystem actually hands over for that name. A symlink planted inside the
// export - which takes write access to the packaged app, but that is exactly
// the kind of foothold layered checks exist to contain - would pass the name
// check and still point anywhere. Both sides are resolved to their real
// locations so a legitimately symlinked install root (tmpdirs and app mounts
// often are) still contains its own files.
const containedRealPath = async (root, file) => {
    try {
        const real = await fs.realpath(file)
        const relative = path.relative(await fs.realpath(root), real)
        return relative.startsWith("..") || path.isAbsolute(relative) ? null : real
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
            const real = file && await containedRealPath(root, file)
            if (!real) {
                return new Response(null, {status: 404, statusText: "Not Found"})
            }
            // The policy the page carries in its meta tag, delivered as a
            // header too: the header covers every asset served here, not only
            // documents that remembered their tag, and it is the only way
            // frame-ancestors is honored at all. A fetched Response's headers
            // are immutable, so the body travels on under a new envelope.
            const response = await net.fetch(pathToFileURL(real).href)
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
