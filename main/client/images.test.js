const test = require("node:test")
const assert = require("node:assert")

// SaveImagesFromProfiles decides what a downloaded pic is stored as. The
// tables, the downloader, and the shrinker are recorded stand-ins so each test
// reads as the row a download produced.
const saved = []
const stub = (request, exports) => {
    const filename = require.resolve(request)
    require.cache[filename] = {id: filename, filename, loaded: true, exports}
}
stub("../data/tables", {
    GetPicExists: async () => false,
    SavePic: async (conf, url, data) => saved.push([url, data]),
})
let downloads = {}
stub("./external_image", {
    DownloadExternalImage: async (url) => {
        const result = downloads[url]
        if (result instanceof Error) {
            throw result
        }
        return result
    },
})
let shrunk
stub("./shrink_image", {
    MaxStoredBytes: 1000,
    ShrinkImage: () => shrunk,
})
const {SaveImagesFromProfiles} = require("./images")

const png = (size) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(size - 4)])
const gif = (size) => Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(size - 6)])
const profileWith = (url) => ({pic: {pic: url}})
const save = (url, body) => {
    downloads = {[url]: body}
    return SaveImagesFromProfiles({}, [profileWith(url)])
}

test.beforeEach(() => {
    saved.length = 0
    shrunk = undefined
})

test("a decodable image is stored shrunk", async () => {
    shrunk = Buffer.from("small")
    await save("https://pic/a.png", png(5000))
    assert.deepEqual(saved, [["https://pic/a.png", shrunk]])
})

test("a shrunk image over the stored cap is tombstoned", async () => {
    shrunk = Buffer.alloc(5000)
    await save("https://pic/a.png", png(50))
    assert.deepEqual(saved, [["https://pic/a.png", Buffer.alloc(0)]])
})

test("a source the shrinker refused is tombstoned", async () => {
    shrunk = Buffer.alloc(0)
    await save("https://pic/bomb.png", png(50))
    assert.deepEqual(saved, [["https://pic/bomb.png", Buffer.alloc(0)]])
})

test("an undecodable image within the stored cap is kept as downloaded", async () => {
    const body = gif(500)
    await save("https://pic/a.gif", body)
    assert.deepEqual(saved, [["https://pic/a.gif", body]])
})

test("an undecodable image over the stored cap is tombstoned", async () => {
    await save("https://pic/a.gif", gif(5000))
    assert.deepEqual(saved, [["https://pic/a.gif", Buffer.alloc(0)]])
})

test("a body that isn't an image is tombstoned", async () => {
    await save("https://pic/dead.png", Buffer.from("<html>"))
    assert.deepEqual(saved, [["https://pic/dead.png", Buffer.alloc(0)]])
})

test("a permanent download failure is tombstoned, a transient one is left to retry", async () => {
    const permanent = new Error("Profile image exceeds size limit")
    permanent.permanent = true
    await save("https://pic/big.png", permanent)
    await save("https://pic/down.png", new Error("ECONNRESET"))
    assert.deepEqual(saved, [["https://pic/big.png", Buffer.alloc(0)]])
})
