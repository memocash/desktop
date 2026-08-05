const test = require("node:test");
const assert = require("node:assert");
const {GetImgurImage, LinkSegments} = require("./linkify");

const reassemble = (segments) => segments.map(s => s.text).join("")
const anchors = (segments) => segments.filter(s => s.url)

test("text without links is a single plain segment", () => {
    const text = "just words here, nothing to click on."
    assert.deepStrictEqual(LinkSegments(text), [{text: text}])
    assert.deepStrictEqual(LinkSegments(""), [])
})

test("a url keeps its surrounding text intact", () => {
    const text = "see https://memo.cash/post/abc for more"
    const segments = LinkSegments(text)
    assert.equal(reassemble(segments), text)
    assert.deepStrictEqual(segments, [
        {text: "see "},
        {text: "https://memo.cash/post/abc", url: "https://memo.cash/post/abc"},
        {text: " for more"},
    ])
})

// The matcher runs with the full IANA tld list; the small built-in default
// would let the app's own domain go unlinked.
test("bare domains match and normalize to an explicit scheme", () => {
    const segments = LinkSegments("posted on memo.cash today")
    assert.deepStrictEqual(anchors(segments), [{text: "memo.cash", url: "http://memo.cash/"}])
    assert.equal(anchors(LinkSegments("try example.pizza sometime")).length, 1)
})

test("multiple links segment in order and reassemble exactly", () => {
    const text = "memo.cash mirrors https://memo.cash/protocol - see i.imgur.com and https://example.com/x?a=1&b=2 (end)"
    const segments = LinkSegments(text)
    assert.equal(reassemble(segments), text)
    assert.deepStrictEqual(anchors(segments).map(s => s.url), [
        "http://memo.cash/",
        "https://memo.cash/protocol",
        "http://i.imgur.com/",
        "https://example.com/x?a=1&b=2",
    ])
})

// Text the matcher recognizes but SafeExternalUrl vetoes stays plain: the
// component renders any url-less segment as bare text, so nothing here is
// clickable.
test("matches outside http and https never become anchors", () => {
    const email = LinkSegments("mail me@example.com about it")
    assert.equal(anchors(email).length, 0)
    assert.equal(reassemble(email), "mail me@example.com about it")
    const ftp = LinkSegments("grab ftp://example.com/file.bin here")
    assert.equal(anchors(ftp).length, 0)
    assert.equal(reassemble(ftp), "grab ftp://example.com/file.bin here")
})

test("non-ascii text around links reassembles exactly", () => {
    const text = "🎉 memo.cash está en línea 🎉"
    const segments = LinkSegments(text)
    assert.equal(reassemble(segments), text)
    assert.equal(anchors(segments).length, 1)
})

test("direct imgur image links carry a preview source", () => {
    const segments = LinkSegments("look https://i.imgur.com/abc123.png wow")
    assert.deepStrictEqual(anchors(segments), [{
        text: "https://i.imgur.com/abc123.png",
        url: "https://i.imgur.com/abc123.png",
        imgurSrc: "https://i.imgur.com/abc123.png",
    }])
})

// The preview points at i.imgur.com regardless of how the link was written,
// so an http match never produces a mixed-content image request.
test("http imgur links preview over https", () => {
    const [anchor] = anchors(LinkSegments("http://i.imgur.com/abc.jpg"))
    assert.equal(anchor.imgurSrc, "https://i.imgur.com/abc.jpg")
})

test("imgur lookalikes and non-image paths get no preview", () => {
    assert.equal(GetImgurImage("https://i.imgur.com.evil.example/abc.png"), null)
    assert.equal(GetImgurImage("https://evil.example/i.imgur.com/abc.png"), null)
    assert.equal(GetImgurImage("https://imgur.com/abc.png"), null)
    assert.equal(GetImgurImage("https://i.imgur.com/a/b.png"), null)
    assert.equal(GetImgurImage("https://i.imgur.com/abc.svg"), null)
    assert.equal(GetImgurImage("https://i.imgur.com/"), null)
    assert.equal(GetImgurImage("not a url"), null)
    const segments = LinkSegments("https://i.imgur.com.evil.com/abc.png")
    assert.equal(segments.filter(s => s.imgurSrc).length, 0)
    assert.equal(anchors(segments).length, 1)
})
