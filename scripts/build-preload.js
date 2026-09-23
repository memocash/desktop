const path = require("path")
const esbuild = require("esbuild")

const root = path.resolve(__dirname, "..")

// The spend prompt and the load page are windows of their own with preloads
// of their own: each carries a password and nothing the wallet page holds,
// and shares no surface with it.
const bundles = [
    ["index.js", "preload.bundle.cjs"],
    ["load.js", "preload.load.bundle.cjs"],
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
}))).catch((e) => {
    // esbuild reports its own build diagnostics at this log level, but a config
    // or IO failure only surfaces here - and silently failing a build step that
    // produces the preload is worse than noisy.
    console.error(e)
    process.exitCode = 1
})
