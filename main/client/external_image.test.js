const test = require("node:test")
const assert = require("node:assert")
const {EventEmitter} = require("events")
const {PassThrough} = require("stream")
const http = require("http")
const {
    DownloadExternalImage, IsPublicAddress, MaxImageBytes, PermanentImageError, downloadUntil,
} = require("./external_image")

test("rejects local, private, reserved, and metadata addresses", () => {
    for (const address of ["127.0.0.1", "10.1.2.3", "100.64.0.1", "169.254.169.254",
        "172.16.0.1", "192.168.1.1", "::", "::1", "fd00::1", "fe80::1",
        "::ffff:127.0.0.1", "::ffff:7f00:1"]) {
        assert.equal(IsPublicAddress(address), false, address)
    }
})

test("accepts public addresses", () => {
    assert.equal(IsPublicAddress("8.8.8.8"), true)
    assert.equal(IsPublicAddress("2606:4700:4700::1111"), true)
})

test("policy rejections are marked permanent so callers can cache them", async () => {
    await assert.rejects(DownloadExternalImage("javascript:alert(1)"), PermanentImageError)
    await assert.rejects(DownloadExternalImage("http://127.0.0.1/image.png"), PermanentImageError)
})

const withFakeResponse = async (writeResponse, action) => {
    const originalGet = http.get
    http.get = (_url, _options, callback) => {
        const request = new EventEmitter()
        const response = new PassThrough()
        response.statusCode = 200
        response.headers = {}
        request.destroy = (error) => {
            response.destroy(error)
            request.emit("error", error)
        }
        process.nextTick(() => {
            callback(response)
            writeResponse(response)
        })
        return request
    }
    try {
        await action()
    } finally {
        http.get = originalGet
    }
}

test("rejects a body that exceeds the streaming cap", async () => {
    await withFakeResponse(
        (response) => response.end(Buffer.alloc(MaxImageBytes + 1)),
        () => assert.rejects(
            downloadUntil("http://8.8.8.8/image.png", 0, Date.now() + 1_000),
            /exceeds size limit/))
})

test("an overall deadline stops a host that keeps feeding bytes", async () => {
    let interval
    await withFakeResponse(
        (response) => {
            interval = setInterval(() => response.write("x"), 2)
            response.on("close", () => clearInterval(interval))
        },
        () => assert.rejects(
            downloadUntil("http://8.8.8.8/image.png", 0, Date.now() + 25),
            /timed out/))
    clearInterval(interval)
})
