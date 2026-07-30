const test = require("node:test")
const assert = require("node:assert")
const {QueuedNames, Serialize} = require("./serial")

const later = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test("operations under one name never overlap", async () => {
    const order = []
    // The shape of the spend budget: read a value, wait for something slow -
    // a confirmation dialog - and only then write the value back.
    let total = 0
    const spend = (amount, wait) => Serialize("wallet", async () => {
        const seen = total
        order.push("check " + amount)
        await later(wait)
        order.push("charge " + amount)
        total = seen + amount
    })
    await Promise.all([spend(10, 20), spend(5, 1), spend(1, 1)])
    assert.equal(total, 16, "each operation saw what the one before it wrote")
    assert.deepEqual(order,
        ["check 10", "charge 10", "check 5", "charge 5", "check 1", "charge 1"])
})

test("different names don't wait for each other", async () => {
    const finished = []
    const slow = Serialize("one", async () => {
        await later(30)
        finished.push("slow")
    })
    const quick = Serialize("two", async () => {
        finished.push("quick")
    })
    await Promise.all([slow, quick])
    assert.deepEqual(finished, ["quick", "slow"])
})

test("a name is let go once nothing is left to run under it", async () => {
    // A wallet that has been closed, or a window that has, should not be kept
    // alive by the queue that once served it. The release is its own turn of the
    // loop, so the check waits for one rather than assuming it has happened.
    await Serialize("wallet:/gone", async () => {})
    await later(0)
    assert.equal(QueuedNames().includes("wallet:/gone"), false)

    await assert.rejects(Serialize("wallet:/failed", async () => {
        throw new Error("no")
    }), {message: "no"})
    await later(0)
    assert.equal(QueuedNames().includes("wallet:/failed"), false)
})

test("letting a name go doesn't let the next operation start alongside one", async () => {
    // The release has to lose to anything queued behind it, or two operations
    // under one name could run at once - which is the whole point of the queue.
    const order = []
    const held = Serialize("busy", async () => {
        order.push("first in")
        await later(20)
        order.push("first out")
    })
    const behind = Serialize("busy", async () => {
        order.push("second in")
        order.push("second out")
    })
    assert.equal(QueuedNames().includes("busy"), true, "held while work remains")
    await Promise.all([held, behind])
    await later(0)
    assert.deepEqual(order, ["first in", "first out", "second in", "second out"])
    assert.equal(QueuedNames().includes("busy"), false, "released once both are done")

    // And the name still works after being released.
    await Serialize("busy", async () => order.push("third"))
    assert.deepEqual(order.slice(-1), ["third"])
})

test("a failed operation doesn't wedge the ones behind it", async () => {
    const failing = Serialize("wallet", async () => {
        throw new Error("no")
    })
    await assert.rejects(failing, {message: "no"})
    assert.equal(await Serialize("wallet", async () => "still running"), "still running")
})
