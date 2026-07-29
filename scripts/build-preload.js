const path = require("path")
const esbuild = require("esbuild")

const root = path.resolve(__dirname, "..")

esbuild.build({
    entryPoints: [path.join(root, "main", "preload", "index.js")],
    outfile: path.join(root, "main", "preload.bundle.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron"],
    logLevel: "info",
}).catch(() => {
    process.exitCode = 1
})
