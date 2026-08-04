const test = require("node:test")
const assert = require("node:assert")
const {ContentSecurityPolicy, ContentSecurityPolicyHeader} = require("./csp")

test("only development may eval, and only the header speaks to framing", () => {
    assert.ok(ContentSecurityPolicy(true).includes("'unsafe-eval'"))
    assert.ok(!ContentSecurityPolicy(false).includes("'unsafe-eval'"))
    // frame-ancestors is ignored in a meta policy, so the page form leaves it
    // out and the header form must never lose it.
    assert.ok(!ContentSecurityPolicy(true).includes("frame-ancestors"))
    assert.ok(!ContentSecurityPolicy(false).includes("frame-ancestors"))
    assert.match(ContentSecurityPolicyHeader(), /; frame-ancestors 'none'$/)
    // One policy, two deliveries: the header is the page policy word for word,
    // plus what only a header can say.
    assert.ok(ContentSecurityPolicyHeader().startsWith(ContentSecurityPolicy(false)))
})
