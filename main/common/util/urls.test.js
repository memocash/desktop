const test = require("node:test");
const assert = require("node:assert");
const {IsSameOrigin, SafeExternalUrl} = require("./urls");

test("plain http and https urls are allowed", () => {
    assert.equal(SafeExternalUrl("https://memo.cash/"), "https://memo.cash/")
    assert.equal(SafeExternalUrl("http://memo.cash/post/abc"), "http://memo.cash/post/abc")
    assert.equal(SafeExternalUrl("https://i.imgur.com/abc.png"), "https://i.imgur.com/abc.png")
})

test("script-bearing schemes are rejected", () => {
    assert.equal(SafeExternalUrl("javascript:alert(document.domain)"), null)
    assert.equal(SafeExternalUrl("JaVaScRiPt:alert(1)"), null)
    assert.equal(SafeExternalUrl("data:text/html,<script>alert(1)</script>"), null)
    assert.equal(SafeExternalUrl("vbscript:msgbox(1)"), null)
})

// The url parser strips tabs and newlines, so these reach the browser as
// javascript: even though a naive prefix check on the raw string would miss it.
test("obfuscated javascript urls are rejected", () => {
    assert.equal(SafeExternalUrl("java\nscript:alert(1)"), null)
    assert.equal(SafeExternalUrl("java\tscript:alert(1)"), null)
    assert.equal(SafeExternalUrl("  javascript:alert(1)"), null)
})

test("schemes the OS would open or launch are rejected", () => {
    assert.equal(SafeExternalUrl("file:///etc/passwd"), null)
    assert.equal(SafeExternalUrl("ms-msdt:/id"), null)
    assert.equal(SafeExternalUrl("smb://host/share"), null)
    assert.equal(SafeExternalUrl("app://-/wallet"), null)
})

test("malformed and relative values are rejected", () => {
    assert.equal(SafeExternalUrl("not a url"), null)
    assert.equal(SafeExternalUrl("/wallet"), null)
    assert.equal(SafeExternalUrl("//evil.example/x"), null)
    assert.equal(SafeExternalUrl(""), null)
    assert.equal(SafeExternalUrl(undefined), null)
    assert.equal(SafeExternalUrl(null), null)
    assert.equal(SafeExternalUrl({}), null)
})

// Callers link to the returned value, not the string they passed in.
test("the returned url is normalized", () => {
    assert.equal(SafeExternalUrl("HTTPS://MEMO.CASH"), "https://memo.cash/")
    assert.equal(SafeExternalUrl("  https://memo.cash/a  "), "https://memo.cash/a")
})

test("app urls are same origin, everything else is not", () => {
    assert.equal(IsSameOrigin("app://-/tx?txHash=abc", "app://-/"), true)
    assert.equal(IsSameOrigin("app://-/", "app://-/"), true)
    assert.equal(IsSameOrigin("http://localhost:8000/wallet", "http://localhost:8000/"), true)
    assert.equal(IsSameOrigin("https://evil.example/", "app://-/"), false)
    assert.equal(IsSameOrigin("app://evil/", "app://-/"), false)
    assert.equal(IsSameOrigin("http://localhost:8001/", "http://localhost:8000/"), false)
    assert.equal(IsSameOrigin("https://localhost:8000/", "http://localhost:8000/"), false)
    assert.equal(IsSameOrigin("not a url", "app://-/"), false)
})
