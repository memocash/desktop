const test = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const esbuild = require("esbuild")
const {BuildOptions, Pages, WriteStatic} = require("./build-renderer")
const {ContentSecurityPolicy} = require("../main/common/util")

// The contract main relies on and nothing else was checking: every window's
// shell at the directory path the app:// resolver expects, each carrying the
// one policy and pointing only at assets the build actually emits. A dropped
// shell, a renamed bundle, or a drifted policy fails here instead of at the
// first launched window.
test("the export carries every shell, the policy, and only assets the build emits", async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "memo-export-"))
    // Registered before anything can fail, so an assertion failure cleans up
    // the ~4MB of unminified bundles the same as a pass does.
    t.after(() => fs.rmSync(dir, {recursive: true, force: true}))
    WriteStatic(dir)
    await esbuild.build({...BuildOptions, outdir: path.join(dir, "assets"), logLevel: "silent"})

    assert.deepEqual(Pages.map(({name}) => name), ["index", "tx", "wallet"])
    for (const page of Pages) {
        const shell = fs.readFileSync(path.join(dir, page.html), "utf8")
        assert.ok(shell.includes(`content="${ContentSecurityPolicy()}"`),
            page.html + " must carry the same policy the app:// header sends")
        assert.ok(shell.includes(`<title>${page.title}</title>`), page.html + " title")
        for (const asset of [`/assets/${page.name}.js`, `/assets/${page.name}.css`]) {
            assert.ok(shell.includes(asset), page.html + " must reference " + asset)
            assert.ok(fs.existsSync(path.join(dir, asset)),
                asset + " must exist for " + page.html)
        }
    }
    // The wallet window loads /tx and /wallet extensionless; the resolvers
    // find them only as directories holding an index.html.
    assert.ok(fs.existsSync(path.join(dir, "tx", "index.html")))
    assert.ok(fs.existsSync(path.join(dir, "wallet", "index.html")))
    // The public files the components reference by absolute path.
    for (const name of ["default-profile.jpg", "memo-logo-large.png"]) {
        assert.ok(fs.existsSync(path.join(dir, name)), name + " must be copied")
    }
})
