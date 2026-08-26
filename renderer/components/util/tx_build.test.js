const test = require("node:test")
const assert = require("node:assert")
const {BuildTx, CoinStatus, CompleteTx, EstimateSend, Fee, MaxSendValue, ResolveCoinIn, Spendable} =
    require("./tx_build")

// Fixtures speak the builder's own units. One 10-byte OP_RETURN-style output
// with no value needs Base + 10 + OutputValueSize = 29 satoshis of fee, plus
// InputP2PKH per selected input - so a single-input send needs 177, and the
// no-dust-change band above it ends at 177 + OutputP2PKH + DustLimit = 757.
const opReturn = {script: Buffer.alloc(10, 0x6a), value: 0}
const singleInputRequired = Fee.Base + 10 + Fee.OutputValueSize + Fee.InputP2PKH
const changeScript = "76a914" + "ab".repeat(20) + "88ac"

// Fixtures carry the settled verdict a synced coin normally has; the
// validity tests below override it to exercise the fail-closed refusals.
const plain = (hash, value, address = "addr1") =>
    ({hash, index: 0, value, address, slp_validity: "NOT_SLP"})
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

test("an output whose SLP verdict is undecided never funds a send", () => {
    // Fail closed on the index's tx-level SLP verdict: PENDING and a coin
    // with no verdict at all - an unchecked tx, or a row from before
    // validity existed - could still turn out to carry tokens.
    for (const slp_validity of [undefined, null, "PENDING"]) {
        const unverified = {...plain("unv", 100000), slp_validity}
        // Skipped in ordinary selection, however much it holds.
        assert.equal(build([unverified]), null)
        // Refused as a named coin instead of spending it.
        assert.equal(build([unverified, plain("other", 100000)], {coin: coinOf(unverified)}), null)
        // Not counted toward the maximum a send can claim.
        assert.equal(MaxSendValue([unverified]) > 0, false)
        // Not taken as a fee coin when completing an SLP transaction.
        assert.equal(CompleteTx({utxos: [unverified], outputs: [opReturn],
            changeScript}), null)
        // The estimate refuses exactly where the builders do.
        assert.equal(EstimateSend([unverified], [opReturn]).enough, false)
    }
    // Every decided verdict spends a plain coin - INVALID included: an
    // invalid SLP transaction's plain outputs are ordinary coins, and its
    // token rows are still excluded by the token checks above.
    for (const slp_validity of ["NOT_SLP", "VALID", "INVALID"]) {
        const settled = {...plain("ok", 100000), slp_validity}
        assert.notEqual(build([settled]), null)
    }
})

test("a named coin whose verdict is undecided resolves as unverified, not ok", () => {
    const unverified = {...plain("unv", 100000), slp_validity: "PENDING"}
    const {status} = ResolveCoinIn([unverified], coinOf(unverified))
    assert.equal(status, CoinStatus.Unverified)
    // A decided INVALID plain coin is an ordinary coin.
    const invalid = {...plain("inv", 100000), slp_validity: "INVALID"}
    assert.equal(ResolveCoinIn([invalid], coinOf(invalid)).status, CoinStatus.Ok)
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

test("a leftover below a dust change output rides as fee, not as a sub-dust output", () => {
    // The eligible utxos run out inside the dust-change band: 400 covers the
    // 177 required, but the 189 left after the change output's own cost is
    // below the dust limit. An output that small is one no node relays, so the
    // transaction must absorb the leftover as fee rather than carry it.
    const only = plain("a", 400)
    const built = build([only])
    assert.deepEqual(built.inputs, [coinOf(only)])
    assert.deepEqual(built.outputs, [opReturn.script.toString("hex") + ":0"])
})

test("change exactly at the dust limit is still an output", () => {
    const utxo = plain("a", singleInputRequired + Fee.OutputP2PKH + Fee.DustLimit)
    const built = build([utxo])
    assert.equal(built.outputs[1], changeScript + ":" + Fee.DustLimit)
})

test("token, baton, and dust outputs are never spendable; a plain output is", () => {
    assert.equal(Spendable({...plain("t", 5000), slp_token_hash: "t"}), false)
    assert.equal(Spendable({...plain("b", 5000), slp_baton_token_hash: "b"}), false)
    assert.equal(Spendable(plain("d", Fee.DustLimit)), false)
    assert.equal(Spendable(plain("p", 5000)), true)
})

test("output values ride along and count toward the requirement", () => {
    const payment = {script: Buffer.alloc(25, 0x76), value: 5000}
    const required = Fee.Base + 25 + 5000 + Fee.OutputValueSize + Fee.InputP2PKH
    const utxo = plain("a", required)
    const built = BuildTx({utxos: [utxo], outputs: [payment], changeScript})
    assert.deepEqual(built.inputs, [coinOf(utxo)])
    assert.deepEqual(built.outputs, [payment.script.toString("hex") + ":5000"])
})

// The fee a built transaction actually pays: input values minus output values,
// read back from the strings BuildTx/CompleteTx assemble.
const builtFee = (built) =>
    built.inputs.reduce((sum, input) => sum + parseInt(input.split(":")[2]), 0) -
    built.outputs.reduce((sum, output) => sum + parseInt(output.split(":")[1]), 0)

test("the maximum send counts only coins the builders will select", () => {
    const spendables = [plain("a", 10000), plain("b", 5000)]
    const cluttered = [...spendables,
        {...plain("tok", 5000), slp_token_hash: "t"},
        {...plain("bat", 5000), slp_baton_token_hash: "b"},
        plain("dst", Fee.DustLimit)]
    const max = MaxSendValue(cluttered)
    // Token, baton, and dust coins neither add value nor charge an input fee.
    assert.equal(max, MaxSendValue(spendables))
    assert.equal(max, 15000 - 2 * Fee.InputP2PKH - Fee.Base - Fee.OutputP2PKH)
    // The advertised maximum is fundable: BuildTx takes exactly the spendable
    // coins against it, with nothing left over.
    const payment = {script: Buffer.alloc(25, 0x76), value: max}
    const built = BuildTx({utxos: cluttered, outputs: [payment], changeScript})
    assert.equal(built.inputs.length, 2)
    assert.deepEqual(built.outputs, [payment.script.toString("hex") + ":" + max])
})

test("a named coin's maximum is that coin's alone; an unusable one is costed normally", () => {
    const rich = plain("rich", 10000)
    const spare = plain("spare", 99999)
    assert.equal(MaxSendValue([rich, spare], coinOf(rich)),
        10000 - Fee.InputP2PKH - Fee.Base - Fee.OutputP2PKH)
    // A named token coin cannot be the input; the form blocks submitting it,
    // and the maximum falls back to the ordinary whole-wallet figure.
    const token = {...plain("tok", 5000), slp_token_hash: "t"}
    assert.equal(MaxSendValue([token, spare], coinOf(token)), MaxSendValue([spare]))
})

test("extra output scripts come off the maximum", () => {
    const utxos = [plain("a", 10000)]
    const extra = Buffer.alloc(20, 0x6a)
    assert.equal(MaxSendValue(utxos, "", [extra]),
        MaxSendValue(utxos) - 20 - Fee.OutputValueSize)
})

test("the estimate's fee is the fee of the transaction BuildTx assembles", () => {
    const cases = [
        [plain("a", singleInputRequired)],                                    // exact funding
        [plain("a", 400)],                                                    // sub-dust surplus rides as fee
        [plain("a", singleInputRequired + Fee.OutputP2PKH + Fee.DustLimit)],  // change exactly at dust
        [plain("a", 5000)],                                                   // ordinary change
        [plain("a", 400), plain("b", 600)],                                   // selection walks past the band
        [{...plain("tok", 100000), slp_token_hash: "t"}, plain("a", 5000)],   // tokens skipped by both
    ]
    for (const utxos of cases) {
        const estimate = EstimateSend(utxos, [opReturn])
        const built = build(utxos)
        assert.equal(estimate.enough, true)
        assert.equal(estimate.fee, builtFee(built), JSON.stringify(utxos))
        // The outputs carry no value, so the whole cost is the fee.
        assert.equal(estimate.total, estimate.fee)
    }
    const payment = {script: Buffer.alloc(25, 0x76), value: 5000}
    const estimate = EstimateSend([plain("a", 10000)], [payment])
    const built = BuildTx({utxos: [plain("a", 10000)], outputs: [payment], changeScript})
    assert.equal(estimate.fee, builtFee(built))
    assert.equal(estimate.total, 5000 + estimate.fee)
})

test("the estimate refuses exactly when BuildTx refuses", () => {
    const short = [plain("a", 100)]
    assert.equal(EstimateSend(short, [opReturn]).enough, false)
    assert.equal(build(short), null)
    // The named-coin dust-change band: unusable for the estimate, refused by
    // the builder.
    const band = plain("band", singleInputRequired + Fee.OutputP2PKH + Fee.DustLimit)
    assert.equal(EstimateSend([band], [opReturn], coinOf(band)).enough, false)
    assert.equal(build([band], {coin: coinOf(band)}), null)
})

// CompleteTx fixtures speak an SLP send's shape: a token input already in
// place carrying its dust, and outputs of a 30-byte OP_RETURN plus two dust
// carriers, needing Base + (30 + 9) + 2 * (25 + DustLimit + 9) + InputP2PKH
// per input satoshis of funding.
const slpOutputs = () => [
    {script: Buffer.alloc(30, 0x6a), value: 0},
    {script: Buffer.alloc(25, 0x76), value: Fee.DustLimit},
    {script: Buffer.alloc(25, 0x76), value: Fee.DustLimit},
]
const slpRequired = (inputCount) => Fee.Base + 30 + Fee.OutputValueSize +
    2 * (25 + Fee.DustLimit + Fee.OutputValueSize) + inputCount * Fee.InputP2PKH
const tokenInput = {...plain("tok", Fee.DustLimit), slp_token_hash: "t"}
const complete = (utxos) => CompleteTx({
    utxos,
    inputs: [coinOf(tokenInput)],
    totalInput: tokenInput.value,
    outputs: slpOutputs(),
    changeScript,
})

test("SLP completion pays the fee from spendable coins, largest first", () => {
    // The token input's own utxo is in the set and must never be taken again,
    // and the fee comes from the largest spendable coin, not the dust.
    const small = plain("small", 1000)
    const large = plain("large", 5000)
    const built = complete([tokenInput, plain("dst", Fee.DustLimit), small, large])
    assert.deepEqual(built.inputs, [coinOf(tokenInput), coinOf(large)])
    const change = tokenInput.value + 5000 - slpRequired(2) - Fee.OutputP2PKH
    assert.ok(change >= Fee.DustLimit)
    assert.equal(built.outputs.length, 4)
    assert.equal(built.outputs[3], changeScript + ":" + change)
})

test("SLP completion folds sub-dust change into the fee", () => {
    // The fee coin covers the requirement with less than a dust change output
    // to spare, so the transaction carries no change rather than an output no
    // node would relay.
    const fee = plain("fee", slpRequired(2) - tokenInput.value + 100)
    const built = complete([tokenInput, fee])
    assert.deepEqual(built.inputs, [coinOf(tokenInput), coinOf(fee)])
    assert.equal(built.outputs.length, 3)
    assert.equal(builtFee(built), 100 + slpRequired(2) - 2 * Fee.DustLimit)
})

test("SLP completion refuses a wallet whose only remaining coins are tokens or dust", () => {
    assert.equal(complete([tokenInput, plain("dst", Fee.DustLimit),
        {...plain("bat", 5000), slp_baton_token_hash: "b"}]), null)
    assert.equal(complete([tokenInput]), null)
})

test("inputs already covering the outputs need no fee coin at all", () => {
    // Checked before adding: a completion whose seeded inputs already fund the
    // outputs exactly takes nothing more.
    const outputs = [{script: Buffer.alloc(30, 0x6a), value: 0}]
    const required = Fee.Base + 30 + Fee.OutputValueSize + Fee.InputP2PKH
    const built = CompleteTx({
        utxos: [plain("spare", 100000)],
        inputs: [coinOf(plain("seed", required))],
        totalInput: required,
        outputs,
        changeScript,
    })
    assert.deepEqual(built.inputs, [coinOf(plain("seed", required))])
    assert.equal(built.outputs.length, 1)
})
