const test = require("node:test");
const assert = require("node:assert");
const {DatabaseSync} = require("node:sqlite");
const {Definitions, Indexes, Cleanups} = require("./schema");

// Same node:sqlite fixture as the table tests: swap the query helpers before
// the modules destructure them, so these run the production SQL against real
// rows.
const sqlite = require("./sqlite")
let db
sqlite.Select = async (conf, name, query, variables = []) =>
    db.prepare(query).all(...variables).map(row => ({...row}))
sqlite.Insert = async (conf, name, query, variables = []) => db.prepare(query).run(...variables)

const {GetPic, GetPicExists, SavePic} = require("./tables/memo")

const conf = {}

// Enough of each format for the cleanup's magic-byte checks to see; the bytes
// after the signature are never looked at.
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)])
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)])
const gif = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(16)])
const bmp = Buffer.concat([Buffer.from("BM"), Buffer.alloc(16)])
const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(16)])

// What a dead image host actually answers with, which is the case the cleanup
// exists for: a 200 and a page of markup, saved by an older build as the pic.
const html = Buffer.from("<!DOCTYPE html><html lang=\"en\"><body>Imgur</body></html>")

const savePic = (url, data) => db.prepare("INSERT INTO images (url, data) VALUES (?, ?)").run(url, data)

const cleanup = () => Cleanups.forEach(statement => db.exec(statement))

const urls = () => db.prepare("SELECT url FROM images ORDER BY url").all().map(row => row.url)

test.beforeEach(() => {
    db = new DatabaseSync(":memory:")
    for (const statement of Definitions.map(d => "CREATE TABLE IF NOT EXISTS " + d).concat(Indexes)) {
        db.exec(statement)
    }
})

test.afterEach(() => db.close())

test("a cached pic that is really a web page is dropped so it can be downloaded again", () => {
    savePic("https://i.imgur.com/as.jpg", html)
    cleanup()
    assert.deepStrictEqual(urls(), [])
})

test("a cached pic in any format an img can decode is kept", () => {
    savePic("png", png)
    savePic("jpeg", jpeg)
    savePic("gif", gif)
    savePic("bmp", bmp)
    savePic("webp", webp)
    cleanup()
    assert.deepStrictEqual(urls(), ["bmp", "gif", "jpeg", "png", "webp"])
})

// The tombstone the downloader writes for a URL that answered with something
// that isn't an image. Dropping it would send every launch back to the same
// dead host, which is the whole reason it's written empty rather than left out.
test("the empty tombstone of a url already known not to be an image is kept", () => {
    savePic("https://i.imgur.com/as.jpg", Buffer.alloc(0))
    cleanup()
    assert.deepStrictEqual(urls(), ["https://i.imgur.com/as.jpg"])
})

test("a second launch drops nothing once the pics are an image or a tombstone", () => {
    savePic("https://i.imgur.com/as.jpg", html)
    savePic("https://host/real.png", png)
    cleanup()
    savePic("https://i.imgur.com/as.jpg", Buffer.alloc(0))
    cleanup()
    assert.deepStrictEqual(urls(), ["https://host/real.png", "https://i.imgur.com/as.jpg"])
})

// RIFF is also the container for wav/avi, so the WEBP tag four bytes later is
// what separates a real webp from a sound file served under a .webp url.
test("a riff container that isn't a webp is dropped", () => {
    savePic("wav", Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE"), Buffer.alloc(16)]))
    cleanup()
    assert.deepStrictEqual(urls(), [])
})

// The property the whole tombstone scheme rests on, pinned here because it is a
// detail of how sqlite hands back an empty blob rather than anything the code
// states. A tombstone has to come back distinguishable from a pic that was
// never cached: the render sites tell the two apart by length (an empty blob is
// truthy, so a plain truthiness test shows a broken image - see
// modal/modals/profile/view.js), and FollowList's "incomplete" test treats a
// null pic_data as a profile still worth re-syncing. Were an empty blob to
// arrive as null, a tombstoned pic would look uncached and every pass over a
// follow list would re-request that profile forever.
test("a tombstoned pic reads back as an empty blob, not as an uncached one", async () => {
    await SavePic(conf, "https://i.imgur.com/as.jpg", Buffer.alloc(0))
    const data = await GetPic(conf, "https://i.imgur.com/as.jpg")
    assert.notStrictEqual(data, null)
    assert.notStrictEqual(data, undefined)
    assert.strictEqual(data.length, 0)
    assert.ok(data, "an empty blob is truthy, so render sites must test length")
    assert.strictEqual(await GetPic(conf, "https://host/never-cached.jpg"), undefined)
})

// What stops the downloader going back to a host already known to answer with
// something that isn't an image.
test("a tombstoned pic counts as already downloaded", async () => {
    await SavePic(conf, "https://i.imgur.com/as.jpg", Buffer.alloc(0))
    assert.ok(await GetPicExists(conf, "https://i.imgur.com/as.jpg"))
    assert.ok(!await GetPicExists(conf, "https://host/never-cached.jpg"))
})
