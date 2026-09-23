const test = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const esbuild = require("esbuild")
const {AssetPrefix, BuildOptions, Pages, WriteStatic} = require("./build-renderer")
const {ContentSecurityPolicy, LoadContentSecurityPolicy} = require("../main/common/util")

// The contract main relies on and nothing else was checking: every window's
// shell at the directory path the app:// resolver expects - or, for the load
// page, the path main loads from disk - each carrying its policy and pointing
// only at assets the build actually emits, by a path that resolves from a
// file: document as well as from the app origin. A dropped shell, a renamed
// bundle, or a drifted policy fails here instead of at the first launched
// window.
test("the export carries every shell, the policy, and only assets the build emits", async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "memo-export-"))
    // Registered before anything can fail, so an assertion failure cleans up
    // the ~4MB of unminified bundles the same as a pass does.
    t.after(() => fs.rmSync(dir, {recursive: true, force: true}))
    WriteStatic(dir)
    await esbuild.build({...BuildOptions, outdir: path.join(dir, "assets"), logLevel: "silent"})

    assert.deepEqual(Pages.map(({name}) => name), ["load", "tx", "wallet"])
    for (const page of Pages) {
        const shell = fs.readFileSync(path.join(dir, page.html), "utf8")
        const policy = page.name === "load" ? LoadContentSecurityPolicy() : ContentSecurityPolicy()
        assert.ok(shell.includes(`content="${policy}"`), page.html + " must carry its policy")
        assert.ok(shell.includes(`<title>${page.title}</title>`), page.html + " title")
        for (const asset of [`assets/${page.name}.js`, `assets/${page.name}.css`]) {
            const reference = AssetPrefix(page.html) + asset
            assert.ok(shell.includes(`"${reference}"`), page.html + " must reference " + reference)
            assert.ok(!shell.includes(`"/${asset}"`), page.html + " must not reference " + asset + " from the root")
            assert.ok(fs.existsSync(path.resolve(path.dirname(path.join(dir, page.html)), reference)),
                reference + " must resolve from " + page.html)
        }
    }
    // Every shell sits in a directory of its own: the wallet window loads /tx
    // and /wallet extensionless, and the resolvers find them only as
    // directories holding an index.html; main loads load/index.html by path.
    assert.ok(fs.existsSync(path.join(dir, "load", "index.html")))
    assert.ok(fs.existsSync(path.join(dir, "tx", "index.html")))
    assert.ok(fs.existsSync(path.join(dir, "wallet", "index.html")))
    // The load page's own policy reaches nothing over the network.
    assert.ok(!LoadContentSecurityPolicy().includes("connect-src"))
    assert.ok(LoadContentSecurityPolicy().startsWith("default-src 'none'"))
    // The logo the load page shows by relative path, from inside load/.
    assert.ok(fs.existsSync(path.join(dir, "load", "..", "memo-logo-large.png")))
    // The public files the components reference by absolute path.
    for (const name of ["default-profile.jpg", "memo-logo-large.png"]) {
        assert.ok(fs.existsSync(path.join(dir, name)), name + " must be copied")
    }
})
