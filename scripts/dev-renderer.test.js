const test = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const {Resolve} = require("./dev-renderer")

// The development twin of main/static_server.test.js's containment tests:
// the dev resolver serves files and directory indexes from inside the export
// and nothing from outside it, however the request spells the path.
test("the dev resolver serves the export and only the export", (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "memo-dev-"))
    t.after(() => fs.rmSync(dir, {recursive: true, force: true}))
    const root = path.join(dir, "out")
    fs.mkdirSync(path.join(root, "tx"), {recursive: true})
    fs.writeFileSync(path.join(root, "index.html"), "root")
    fs.writeFileSync(path.join(root, "tx", "index.html"), "tx")
    fs.writeFileSync(path.join(dir, "secret.txt"), "outside")
    // A sibling of the export whose name extends the export's own.
    fs.mkdirSync(path.join(dir, "outside"))
    fs.writeFileSync(path.join(dir, "outside", "index.html"), "sibling")

    assert.equal(Resolve(root, "/index.html"), path.join(root, "index.html"))
    assert.equal(Resolve(root, "/"), path.join(root, "index.html"))
    // Extensionless routes resolve through their directory index, the way
    // the wallet window loads /tx?txHash=...
    assert.equal(Resolve(root, "/tx"), path.join(root, "tx", "index.html"))
    assert.equal(Resolve(root, "/missing"), null)
    // Traversal: raw dotted segments normalize away or land outside and are
    // refused; encoded ones are never decoded, so they miss as literal names.
    assert.equal(Resolve(root, "/../secret.txt"), null)
    assert.equal(Resolve(root, "/%2e%2e/secret.txt"), null)
    // Sharing the root's prefix is not being inside the root.
    assert.equal(Resolve(root, "/../outside/index.html"), null)
})
