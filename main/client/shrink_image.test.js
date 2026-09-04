const test = require("node:test")
const assert = require("node:assert")

// shrink_image decodes through Electron's nativeImage; stand it in with a
// recorder so each test reads as the decode-and-resize sequence it produced,
// and so a test can prove the decoder was never reached.
const calls = []
let decoded
const fakeImage = (width, height) => ({
    isEmpty: () => width === 0,
    getSize: () => ({width, height}),
    resize: (options) => {
        calls.push(["resize", options])
        return fakeImage(options.width || 0, options.height || 0)
    },
    toPNG: () => Buffer.from("png-out"),
    toJPEG: (quality) => Buffer.from("jpeg-out-" + quality),
})
const electronStub = {nativeImage: {createFromBuffer: (data) => {
    calls.push(["decode", data.length])
    return decoded
}}}
const electron = require.resolve("electron")
require.cache[electron] = {id: electron, filename: electron, loaded: true, exports: electronStub}
const {ImageDimensions, MaxPicPixels, MaxSourcePixels, MaxStoredBytes, ShrinkImage} = require("./shrink_image")

// A PNG signature and IHDR declaring the dimensions, padded to length.
const png = (width, height, length = 100) => {
    const data = Buffer.alloc(length)
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(data)
    data.writeUInt32BE(13, 8)
    data.write("IHDR", 12, "ascii")
    data.writeUInt32BE(width, 16)
    data.writeUInt32BE(height, 20)
    return data
}

// SOI, an APP0 segment to step over, then a SOF0 carrying the dimensions.
const jpeg = (width, height, length = 100) => {
    const data = Buffer.alloc(length)
    let offset = 0
    Buffer.from([0xff, 0xd8]).copy(data, offset)
    offset += 2
    Buffer.from([0xff, 0xe0, 0x00, 0x10]).copy(data, offset)
    offset += 2 + 16
    Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08]).copy(data, offset)
    data.writeUInt16BE(height, offset + 5)
    data.writeUInt16BE(width, offset + 7)
    return data
}

test.beforeEach(() => {
    calls.length = 0
    decoded = undefined
})

test("dimensions are read from the header of a png or jpeg, and nothing else", () => {
    assert.deepEqual(ImageDimensions(png(1920, 1080)), {width: 1920, height: 1080})
    assert.deepEqual(ImageDimensions(jpeg(640, 480)), {width: 640, height: 480})
    assert.equal(ImageDimensions(Buffer.from("GIF89a")), undefined)
    assert.equal(ImageDimensions(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])), undefined)
    assert.equal(ImageDimensions(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0])), undefined)
})

test("a format the decoder can't read is left to the caller", () => {
    assert.equal(ShrinkImage(Buffer.from("GIF89a")), undefined)
    assert.deepEqual(calls, [])
})

test("a source declaring too many pixels is refused without being decoded", () => {
    const side = Math.ceil(Math.sqrt(MaxSourcePixels)) + 1
    assert.equal(ShrinkImage(png(side, side)).length, 0)
    assert.equal(ShrinkImage(jpeg(65535, 65535)).length, 0)
    assert.deepEqual(calls, [])
})

test("an image within both bounds keeps its original bytes, undecoded", () => {
    const data = png(MaxPicPixels, 40)
    assert.equal(ShrinkImage(data), data)
    assert.deepEqual(calls, [])
})

test("an image within the pixel bounds but over the byte cap is re-encoded", () => {
    const data = png(100, 100, MaxStoredBytes + 1)
    decoded = fakeImage(100, 100)
    assert.equal(ShrinkImage(data).toString(), "png-out")
    assert.deepEqual(calls, [["decode", data.length], ["resize", {width: 100, quality: "best"}]])
})

test("a wide png is bounded by width and re-encoded as png", () => {
    decoded = fakeImage(1200, 600)
    assert.equal(ShrinkImage(png(1200, 600)).toString(), "png-out")
    assert.deepEqual(calls[1], ["resize", {width: MaxPicPixels, quality: "best"}])
})

test("a tall jpeg is bounded by height and re-encoded as jpeg", () => {
    decoded = fakeImage(600, 1200)
    assert.equal(ShrinkImage(jpeg(600, 1200)).toString(), "jpeg-out-85")
    assert.deepEqual(calls[1], ["resize", {height: MaxPicPixels, quality: "best"}])
})

test("a header the decoder then can't read is refused", () => {
    decoded = fakeImage(0, 0)
    assert.equal(ShrinkImage(png(1200, 600)).length, 0)
})
