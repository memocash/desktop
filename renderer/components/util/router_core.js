// The router shim's computable parts, in commonjs so node's test runner can
// require them directly - router.js itself is jsx that only the bundler
// loads. The bundle imports these through router.js.

// Next's router.query equivalent: the window's search string as a plain
// object. Repeated keys keep the last value; the pages never send any.
const ParseQuery = (search) => Object.fromEntries(new URLSearchParams(search))

// The export keeps each page in its own directory (wallet/index.html), so
// in-app navigation lands on the directory path.
const RouteTarget = (route) => route.endsWith("/") ? route : route + "/"

module.exports = {ParseQuery, RouteTarget}
