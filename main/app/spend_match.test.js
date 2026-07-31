const test = require("node:test")
const assert = require("node:assert")
const {CoversSpend} = require("./spend_match")

const pay = (address, value, extra = {}) => ({address, value, ...extra})

test("the same payments and fee are covered", () => {
    const shown = {fee: 226, payments: [pay("A", 546)]}
    assert.equal(CoversSpend(shown, {fee: 226, payments: [pay("A", 546)]}), true)
})

test("a payment that was not shown is not covered", () => {
    // The dangerous direction: the address list called an output change, and the
    // keys say it pays someone else.
    const shown = {fee: 226, payments: []}
    assert.equal(CoversSpend(shown, {fee: 226, payments: [pay("attacker", 40000)]}), false)
})

test("being shown more than really leaves is covered", () => {
    // A list missing one of the wallet's own change addresses shows that change
    // as a payment. Less leaves than was approved, so the approval still holds.
    const shown = {fee: 226, payments: [pay("A", 546), pay("change", 39000)]}
    assert.equal(CoversSpend(shown, {fee: 226, payments: [pay("A", 546)]}), true)
})

test("a changed amount to a shown address is not covered", () => {
    const shown = {fee: 226, payments: [pay("A", 546)]}
    assert.equal(CoversSpend(shown, {fee: 226, payments: [pay("A", 40000)]}), false)
})

test("two payments alike are counted, not merged", () => {
    const shown = {fee: 226, payments: [pay("A", 546)]}
    assert.equal(CoversSpend(shown, {fee: 226, payments: [pay("A", 546), pay("A", 546)]}), false)
})

test("a different fee is not covered", () => {
    const shown = {fee: 226, payments: [pay("A", 546)]}
    assert.equal(CoversSpend(shown, {fee: 5000, payments: [pay("A", 546)]}), false)
})

test("tokens and batons are part of what was shown", () => {
    const shown = {fee: 226, payments: [pay("A", 546, {tokenAmount: "10"})]}
    assert.equal(CoversSpend(shown, {fee: 226, payments: [pay("A", 546, {tokenAmount: "10"})]}), true)
    assert.equal(CoversSpend(shown, {fee: 226, payments: [pay("A", 546, {tokenAmount: "99"})]}), false)
    assert.equal(CoversSpend(shown, {fee: 226, payments: [pay("A", 546, {baton: true})]}), false)
})

test("an output with no address is compared by what it carries", () => {
    const shown = {fee: 226, payments: [pay(undefined, 1000)]}
    assert.equal(CoversSpend(shown, {fee: 226, payments: [pay(undefined, 1000)]}), true)
    assert.equal(CoversSpend(shown, {fee: 226, payments: [pay("A", 1000)]}), false)
})

test("nothing shown covers nothing paid", () => {
    assert.equal(CoversSpend({fee: 226, payments: []}, {fee: 226, payments: []}), true)
    assert.equal(CoversSpend(undefined, {fee: 226, payments: []}), false)
})
