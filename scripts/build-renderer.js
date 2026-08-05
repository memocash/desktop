const fs = require("fs")
const path = require("path")
const {ContentSecurityPolicy} = require("../main/common/util")

const root = path.resolve(__dirname, "..")
const outDir = path.join(root, "renderer", "out")

// One bundle per window. The layout mirrors what the Next export produced,
// because main expects it: the app:// handler resolves an extensionless
// request like app://-/tx to tx/index.html, so each page keeps its own
// directory (see main/static_server.js).
const Pages = [
    {name: "index", title: "Memo", html: "index.html"},
    {name: "tx", title: "Transaction", html: path.join("tx", "index.html")},
    {name: "wallet", title: "Memo", html: path.join("wallet", "index.html")},
]

// The same CSP the app:// handler sends as a header, delivered as a meta tag
// so it also binds the document in development, where pages come from the
// local dev server instead (see main/common/util/csp.js).
const Html = ({name, title}) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${ContentSecurityPolicy()}">
<title>${title}</title>
<link rel="stylesheet" href="/assets/${name}.css">
</head>
<body>
<div id="root"></div>
<script src="/assets/${name}.js"></script>
</body>
</html>
`

const BuildOptions = {
    entryPoints: Pages.map(({name}) => path.join(root, "renderer", "entry", name + ".js")),
    outdir: path.join(outDir, "assets"),
    bundle: true,
    format: "iife",
    platform: "browser",
    // The components write JSX in plain .js files, without importing React -
    // both habits from the Next toolchain this build replaced.
    loader: {".js": "jsx"},
    jsx: "automatic",
    // Buffer is used as a global throughout the components (Next polyfilled
    // it); inject the same polyfill esbuild-style.
    inject: [path.join(__dirname, "buffer-shim.js")],
    // main/common/util's barrel reaches dir.js, which loads os/path for main's
    // benefit; the renderer needs only enough for the module to load.
    alias: {os: path.join(__dirname, "node-shim.js"), path: path.join(__dirname, "node-shim.js")},
    logLevel: "info",
}

// The static shell around the bundles: the html documents and the public
// files they reference. Shared with the dev server, which serves the same
// tree it would ship, and injectable for tests.
const WriteStatic = (dir = outDir) => {
    for (const page of Pages) {
        const file = path.join(dir, page.html)
        fs.mkdirSync(path.dirname(file), {recursive: true})
        fs.writeFileSync(file, Html(page))
    }
    const publicDir = path.join(root, "renderer", "public")
    for (const name of fs.readdirSync(publicDir)) {
        fs.copyFileSync(path.join(publicDir, name), path.join(dir, name))
    }
}

module.exports = {BuildOptions, Pages, WriteStatic, outDir}

if (require.main === module) {
    const esbuild = require("esbuild")
    fs.rmSync(outDir, {recursive: true, force: true})
    WriteStatic()
    esbuild.build({
        ...BuildOptions,
        minify: true,
        define: {"process.env.NODE_ENV": '"production"'},
    }).catch((e) => {
        console.error(e)
        process.exitCode = 1
    })
}
