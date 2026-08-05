const test = require("node:test")
const assert = require("node:assert")
const {BuildTx, Fee} = require("./tx_build")

// Fixtures speak the builder's own units. One 10-byte OP_RETURN-style output
// with no value needs Base + 10 + OutputValueSize = 29 satoshis of fee, plus
// InputP2PKH per selected input - so a single-input send needs 177, and the
// no-dust-change band above it ends at 177 + OutputP2PKH + DustLimit = 757.
const opReturn = {script: Buffer.alloc(10, 0x6a), value: 0}
const singleInputRequired = Fee.Base + 10 + Fee.OutputValueSize + Fee.InputP2PKH
const changeScript = "76a914" + "ab".repeat(20) + "88ac"

const plain = (hash, value, address = "addr1") => ({hash, index: 0, value, address})
const coinOf = (utxo) => [utxo.hash, utxo.index, utxo.value, utxo.address].join(":")
const build = (utxos, overrides = {}) =>
    BuildTx({utxos, outputs: [opReturn], changeScript, ...overrides})

test("a named token, baton, or dust coin refuses the send instead of spending other funds", () => {
    const spendable = plain("other", 100000)
    const token = {...plain("tok", 5000), slp_token_hash: "t"}
    const baton = {...plain("bat", 5000), slp_baton_token_hash: "b"}
    const dust = plain("dst", Fee.DustLimit)
    for (const named of [token, baton, dust]) {
        // The named coin first: the coin branch only runs on the first utxo.
        assert.equal(build([named, spendable], {coin: coinOf(named)}), null)
    }
})

test("a named coin that cannot fund the outputs alone is refused, not padded", () => {
    const wealthy = plain("other", 100000)
    // Below what the transaction needs.
    const short = plain("short", 100)
    assert.equal(build([short, wealthy], {coin: coinOf(short)}), null)
    // In the band where it covers the outputs but the leftover would be dust:
    // nothing is selected, so the empty transaction must be refused even
    // though the coin's value was charged against the requirement.
    const band = plain("band", singleInputRequired + Fee.OutputP2PKH + Fee.DustLimit)
    assert.equal(build([band, wealthy], {coin: coinOf(band)}), null)
})

test("a named coin absent from the eligible UTXO set is refused", () => {
    // The reviewer's case: the string alone claims enough value, the wallet
    // holds plenty elsewhere, but the named coin itself does not exist.
    const built = BuildTx({
        utxos: [plain("other", 100000, "allowed-address")],
        outputs: [opReturn],
        coin: `missing:0:${singleInputRequired}:wrong-address`,
        fromAddress: "allowed-address",
        changeScript,
    })
    assert.equal(built, null)
})

test("a real wallet coin excluded by fromAddress is refused", () => {
    const theirs = plain("theirs", 100000, "addrA")
    const mine = plain("mine", 100000, "addrB")
    assert.equal(build([theirs, mine], {coin: coinOf(theirs), fromAddress: "addrB"}), null)
})

test("the utxo's value decides, not the coin string's", () => {
    // The string overstates a coin the wallet holds at a value too small to
    // fund the outputs; trusting the string would build an underfunded
    // transaction.
    const short = plain("short", 100)
    const lyingCoin = [short.hash, short.index, 100000, short.address].join(":")
    assert.equal(build([short], {coin: lyingCoin}), null)
})

test("a named coin funding the outputs exactly is the whole transaction, no change", () => {
    const exact = plain("exact", singleInputRequired)
    const built = build([exact, plain("other", 100000)], {coin: coinOf(exact)})
    assert.deepEqual(built, {
        inputs: [coinOf(exact)],
        outputs: [opReturn.script.toString("hex") + ":0"],
    })
})

test("a named coin's surplus lands on the change script", () => {
    const rich = plain("rich", 1000)
    const built = build([rich], {coin: coinOf(rich)})
    const change = 1000 - singleInputRequired - Fee.OutputP2PKH
    assert.deepEqual(built.inputs, [coinOf(rich)])
    assert.equal(built.outputs[1], changeScript + ":" + change)
})

test("fromAddress keeps selection inside that address", () => {
    const theirs = plain("theirs", 100000, "addrA")
    const mine = plain("mine", 1000, "addrB")
    const built = build([theirs, mine], {fromAddress: "addrB"})
    assert.deepEqual(built.inputs, [coinOf(mine)])
    // An address with no utxos cannot borrow from the rest of the wallet.
    assert.equal(build([theirs], {fromAddress: "addrB"}), null)
})

test("selection skips tokens and dust and stops once the outputs are covered", () => {
    const token = {...plain("tok", 100000), slp_token_hash: "t"}
    const dust = plain("dst", Fee.DustLimit)
    const first = plain("a", 400)
    const second = plain("b", 600)
    const spare = plain("c", 100000)
    const built = build([token, dust, first, second, spare])
    // 400 lands in the dust-change band so selection continues; 1000 clears
    // it; the spare is never touched.
    assert.deepEqual(built.inputs, [coinOf(first), coinOf(second)])
    const required = singleInputRequired + Fee.InputP2PKH
    assert.equal(built.outputs[1], changeScript + ":" + (1000 - required - Fee.OutputP2PKH))
})

test("exact multi-input funding adds no change output", () => {
    const required = singleInputRequired + Fee.InputP2PKH
    const first = plain("a", 200)
    const second = plain("b", required - 200)
    const built = build([first, second])
    assert.deepEqual(built.inputs, [coinOf(first), coinOf(second)])
    assert.deepEqual(built.outputs, [opReturn.script.toString("hex") + ":0"])
})

test("a wallet that cannot cover the outputs is refused", () => {
    assert.equal(build([plain("a", 100)]), null)
    assert.equal(build([]), null)
})

test("output values ride along and count toward the requirement", () => {
    const payment = {script: Buffer.alloc(25, 0x76), value: 5000}
    const required = Fee.Base + 25 + 5000 + Fee.OutputValueSize + Fee.InputP2PKH
    const utxo = plain("a", required)
    const built = BuildTx({utxos: [utxo], outputs: [payment], changeScript})
    assert.deepEqual(built.inputs, [coinOf(utxo)])
    assert.deepEqual(built.outputs, [payment.script.toString("hex") + ":5000"])
})
