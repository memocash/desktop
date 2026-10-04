const test = require("node:test")
const assert = require("node:assert")
const {IsLoadPagePath} = require("./load_page")

// Both servers refuse the load page by this one rule, so it is tried here on
// its own, against every spelling a filesystem might fold onto the page: the
// name in any case, with trailing dots or spaces Windows drops when it opens a
// name, and with either separator. A name that merely shares the prefix is
// not the load page.
test("the load page is recognised under every spelling a filesystem would open it by", () => {
    for (const relative of ["load", "load/index.html", "Load/index.html", "LOAD", "load.", "load. /index.html",
        "load /index.html", "load\\index.html", "assets/load.js", "assets/load.css", "assets\\LOAD.js",
        "assets /load.js", "assets./load.js.map"]) {
        assert.equal(IsLoadPagePath(relative), true, relative)
    }
    for (const relative of ["", "index.html", "wallet/index.html", "loader/index.html", "loads", "assets",
        "assets/wallet.js", "assets/loader.js", "assets/tx.js", "memo-logo-large.png", "wallet/load/index.html"]) {
        assert.equal(IsLoadPagePath(relative), false, relative)
    }
})
