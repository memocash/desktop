const fs = require("fs")
const path = require("path")

// `next build` and `next dev` share renderer/.next, and they cannot both use
// what they find there: the dev server reuses the directory as it is, and a
// production build leaves a layout it cannot load. Starting the app in dev after
// a build fails on the first page it serves, with
//   Cannot find module './chunks/vendor-chunks/next.js'
// which says nothing about the actual cause.
//
// A production build is recognisable - only it writes BUILD_ID and the export
// marker - so clear the directory when that is what is sitting there, and leave
// an ordinary dev cache alone so starting up stays fast.

const buildDir = path.resolve(__dirname, "..", "renderer", ".next")
const productionMarkers = ["BUILD_ID", "export-marker.json"]

if (productionMarkers.every((name) => fs.existsSync(path.join(buildDir, name)))) {
    fs.rmSync(buildDir, {recursive: true, force: true})
    console.log("Removed renderer/.next left by a production build")
}
