const test = require("node:test")
const assert = require("node:assert")
const path = require("path")

// static_server imports Electron, so provide the minimum surface needed to test
// path containment without starting the runtime.
const electron = require.resolve("electron")
require.cache[electron] = {id: electron, filename: electron, loaded: true, exports: {
    app: {}, net: {}, protocol: {}, session: {},
}}
const {ResolveRendererPath} = require("./static_server")

test("renderer paths remain inside the static export", () => {
    const root = path.resolve("/app/renderer/out")
    assert.equal(ResolveRendererPath(root, "/wallet/index.html"), path.join(root, "wallet/index.html"))
    assert.equal(ResolveRendererPath(root, "/%2e%2e/%2e%2e/etc/passwd"), null)
    assert.equal(ResolveRendererPath(root, "/%E0%A4%A"), null)
})
