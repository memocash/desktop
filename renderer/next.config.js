module.exports = {
    // Static export so the renderer can be packaged as plain files and served
    // to the windows over a custom app:// protocol by the Electron main process
    // (see main/index.js) - there is no Next server in a shipped build. Replaces
    // the old `next export` command, which Next 15 removed.
    output: "export",
    // Emit each route as <route>/index.html rather than <route>.html. electron-serve
    // resolves an extensionless request like app://-/tx by looking for a directory
    // with an index.html; without this it would fall back to the root index.html and
    // the tx window (loaded directly by URL, not client-side routing) would be wrong.
    trailingSlash: true,
    // No Next server means no on-the-fly image optimization; the app only uses
    // plain <img> tags, so mark images unoptimized to keep the export happy.
    images: {unoptimized: true},
    webpack: (config) => {
        config.experiments = {...config.experiments, asyncWebAssembly: true}
        return config
    },
}
