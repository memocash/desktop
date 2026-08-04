const test = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("path")

// static_server imports Electron, so provide the minimum surface needed to test
// path containment and the protocol handler without starting the runtime.
const electronStub = {app: {}, net: {}, protocol: {}, session: {}}
const electron = require.resolve("electron")
require.cache[electron] = {id: electron, filename: electron, loaded: true, exports: electronStub}
const {RegisterRendererProtocol, ResolveRendererPath} = require("./static_server")

test("renderer paths remain inside the static export", () => {
    const root = path.resolve("/app/renderer/out")
    assert.equal(ResolveRendererPath(root, "/wallet/index.html"), path.join(root, "wallet/index.html"))
    assert.equal(ResolveRendererPath(root, "/%2e%2e/%2e%2e/etc/passwd"), null)
    assert.equal(ResolveRendererPath(root, "/%E0%A4%A"), null)
})

// The handler as registration wires it up, driven with a real file on disk and
// net.fetch stubbed to answer the way Electron's does - a Response whose
// headers are already set.
test("everything the app protocol serves carries the security policy header", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "memo-static-"))
    await fs.mkdir(path.join(dir, "renderer", "out"), {recursive: true})
    await fs.writeFile(path.join(dir, "renderer", "out", "index.html"), "<!doctype html>")
    electronStub.app.getAppPath = () => dir
    electronStub.protocol.registerSchemesAsPrivileged = () => {}
    let onReady
    electronStub.app.on = (_event, listener) => onReady = listener
    let handle
    electronStub.session.defaultSession = {protocol: {handle: (_scheme, fn) => handle = fn}}
    electronStub.net.fetch = async () => new Response("<!doctype html>", {
        status: 200, statusText: "OK", headers: {"Content-Type": "text/html"},
    })
    RegisterRendererProtocol(path.join("renderer", "out"))
    onReady()

    const served = await handle({url: "app://-/index.html"})
    const policy = served.headers.get("Content-Security-Policy")
    // The production policy with the header-only directive on it, and no
    // development allowance: only the packaged build serves app://.
    assert.match(policy, /default-src 'self'/)
    assert.match(policy, /frame-ancestors 'none'/)
    assert.ok(!policy.includes("unsafe-eval"))
    // The new envelope carries the fetched response's own headers with it.
    assert.equal(served.headers.get("Content-Type"), "text/html")
    assert.equal(served.status, 200)
    assert.equal(await served.text(), "<!doctype html>")

    assert.equal((await handle({url: "app://-/not_here.html"})).status, 404)
})

// The traversal check vets the requested name; a symlink is the filesystem
// answering that name with a different location. Both are on trial here.
test("a symlink inside the export cannot serve what lies outside it", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "memo-static-"))
    const root = path.join(dir, "renderer", "out")
    await fs.mkdir(root, {recursive: true})
    await fs.writeFile(path.join(dir, "outside.txt"), "not for serving")
    await fs.symlink(path.join(dir, "outside.txt"), path.join(root, "leak.html"))
    await fs.writeFile(path.join(root, "index.html"), "<!doctype html>")
    electronStub.app.getAppPath = () => dir
    electronStub.protocol.registerSchemesAsPrivileged = () => {}
    let onReady
    electronStub.app.on = (_event, listener) => onReady = listener
    let handle
    electronStub.session.defaultSession = {protocol: {handle: (_scheme, fn) => handle = fn}}
    const fetched = []
    electronStub.net.fetch = async (href) => {
        fetched.push(href)
        return new Response("<!doctype html>", {status: 200, statusText: "OK"})
    }
    RegisterRendererProtocol(path.join("renderer", "out"))
    onReady()

    assert.equal((await handle({url: "app://-/leak.html"})).status, 404)
    assert.equal(fetched.length, 0, "the linked-to file must never be fetched")
    assert.equal((await handle({url: "app://-/index.html"})).status, 200)
    assert.equal(fetched.length, 1)
})
