const test = require("node:test")
const assert = require("node:assert")
const {ApproveModeOf, ApproveValues, ThresholdError, ThresholdInUse} = require("./settings_core")

test("stored settings read as the choice they amount to", () => {
    assert.equal(ApproveModeOf({}), "every")
    assert.equal(ApproveModeOf({PasswordThreshold: 0, ApproveSends: true}), "every")
    assert.equal(ApproveModeOf({PasswordThreshold: 5000}), "limit")
    assert.equal(ApproveModeOf({PasswordThreshold: 5000, ApproveSends: false}), "never")
    assert.equal(ApproveModeOf({PasswordThreshold: 0, ApproveSends: false}), "never")
})

// The regression: the threshold field stays on the page under every choice, and
// a field still enabled under a choice that ignores it is validated by the
// browser against its min of 1 - which the 0 those choices load with fails,
// refusing every save before the form's handler runs. The field is disabled
// exactly when it is not in use.
test("the threshold is in use, and so enabled, only for a running total", () => {
    assert.equal(ThresholdInUse("limit"), true)
    assert.equal(ThresholdInUse("every"), false)
    assert.equal(ThresholdInUse("never"), false)
})

test("only a running total is held to a valid threshold", () => {
    // Whatever was left in the field from an earlier choice, the others save.
    for (const mode of ["every", "never"]) {
        for (const left of ["0", "", "-5", "1.5", "abc"]) {
            assert.equal(ThresholdError(mode, left), undefined, mode + " refused " + JSON.stringify(left))
        }
    }
    for (const bad of ["0", "", "  ", "-5", "1.5", "abc", "1e309"]) {
        assert.notEqual(ThresholdError("limit", bad), undefined, "limit accepted " + JSON.stringify(bad))
    }
    assert.equal(ThresholdError("limit", "1"), undefined)
    assert.equal(ThresholdError("limit", "25000"), undefined)
})

test("a choice is stored without any threshold it doesn't use", () => {
    assert.deepEqual(ApproveValues("every", "500"), {PasswordThreshold: 0, ApproveSends: true})
    assert.deepEqual(ApproveValues("limit", "500"), {PasswordThreshold: 500, ApproveSends: true})
    assert.deepEqual(ApproveValues("never", "500"), {PasswordThreshold: 0, ApproveSends: false})
})
