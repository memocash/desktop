const path = require("path")
const esbuild = require("esbuild")

const root = path.resolve(__dirname, "..")

// The spend prompt is a window of its own with its own preload: it carries the
// password and nothing else, and shares no surface with the wallet page.
const bundles = [
    ["index.js", "preload.bundle.cjs"],
    ["spend_prompt.js", "preload.spend.bundle.cjs"],
]

Promise.all(bundles.map(([entry, out]) => esbuild.build({
    entryPoints: [path.join(root, "main", "preload", entry)],
    outfile: path.join(root, "main", out),
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron"],
    logLevel: "info",
}))).catch(() => {
    process.exitCode = 1
})
