const test = require("node:test")
const assert = require("node:assert")
const {ContentSecurityPolicy, ContentSecurityPolicyHeader} = require("./csp")

test("nothing may eval, and only the header speaks to framing", () => {
    // esbuild serves plain script files in development too, so no build gets
    // an eval allowance.
    assert.ok(!ContentSecurityPolicy().includes("'unsafe-eval'"))
    // frame-ancestors is ignored in a meta policy, so the page form leaves it
    // out and the header form must never lose it.
    assert.ok(!ContentSecurityPolicy().includes("frame-ancestors"))
    assert.match(ContentSecurityPolicyHeader(), /; frame-ancestors 'none'$/)
    // One policy, two deliveries: the header is the page policy word for word,
    // plus what only a header can say.
    assert.ok(ContentSecurityPolicyHeader().startsWith(ContentSecurityPolicy()))
})
