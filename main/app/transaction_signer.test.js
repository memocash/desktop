const test = require("node:test")
const assert = require("node:assert")
const bitcoin = require("@bitcoin-dot-com/bitcoincashjs2-lib")
const {mnemonicToSeedSync} = require("bip39")
const {BIP32Factory} = require("bip32")
const ecc = require("tiny-secp256k1")
const {KeyFinder, MaxFeeRate, PreviewSpend, SignTransaction, WalletAddresses} = require("./transaction_signer")

const bip32 = BIP32Factory(ecc)
const key = bitcoin.ECPair.makeRandom({rng: () => Buffer.alloc(32, 7)})
const address = key.getAddress()
const prevHash = "11".repeat(32)
const slpPush = (buffer) => Buffer.concat([Buffer.from([buffer.length]), buffer])
const slpAmount = (amount) => Buffer.from(amount.toString(16).padStart(16, "0"), "hex")

const request = ({inputValue = 10000, outputValue = 9000} = {}) => {
    const txb = new bitcoin.TransactionBuilder()
    txb.addInput(Buffer.from(prevHash, "hex").reverse(), 1,
        bitcoin.Transaction.DEFAULT_SEQUENCE, bitcoin.address.toOutputScript(address))
    txb.addOutput(bitcoin.address.toOutputScript(address), outputValue)
    return {
        raw: txb.__build(true).toBuffer().toString("hex"),
        inputs: [{prev_hash: prevHash, prev_index: 1}],
        wallet: {keys: [key.toWIF()], addresses: [address]},
        getOutput: async () => ({
            hash: prevHash,
            index: 1,
            address,
            value: inputValue,
            script: bitcoin.address.toOutputScript(address).toString("hex"),
        }),
    }
}

test("signs using authoritative prevout metadata", async () => {
    const signed = await SignTransaction(request())
    const tx = bitcoin.Transaction.fromBuffer(Buffer.from(signed.raw, "hex"))
    assert.ok(tx.ins[0].script.length > 0)
    assert.equal(signed.fee, 1000)
    assert.equal(signed.txid, tx.getId())
    assert.deepEqual(signed.inputs, [{address, value: 10000}])
    assert.ok(signed.feeRate < MaxFeeRate)
    // Nothing left the wallet: the only output pays an address it can spend
    // from again, so the fee is the whole of it.
    assert.equal(signed.outgoing, signed.fee)
    assert.equal(signed.carriesTokens, false)
})

test("what leaves the wallet is the payment plus the fee", async () => {
    const signed = await SignTransaction({...payment(), confirmSpend: async () => true})
    assert.equal(signed.outgoing, 9000 + signed.fee)
    assert.equal(signed.fee, 1000)
    assert.equal(signed.carriesTokens, false)
})

test("derives a seed wallet change key only inside the signer", async () => {
    const seed = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
    const child = bip32.fromSeed(mnemonicToSeedSync(seed)).derivePath("m/44'/0'/0'/1/0")
    const changeAddress = bitcoin.ECPair.fromWIF(child.toWIF()).getAddress()
    const seeded = request()
    const txb = new bitcoin.TransactionBuilder()
    txb.addInput(Buffer.from(prevHash, "hex").reverse(), 1,
        bitcoin.Transaction.DEFAULT_SEQUENCE, bitcoin.address.toOutputScript(changeAddress))
    txb.addOutput(bitcoin.address.toOutputScript(changeAddress), 9000)
    seeded.raw = txb.__build(true).toBuffer().toString("hex")
    seeded.wallet = {seed, addresses: [], changeList: [changeAddress], slpList: []}
    seeded.getOutput = async () => ({
        address: changeAddress,
        value: 10000,
        script: bitcoin.address.toOutputScript(changeAddress).toString("hex"),
    })
    assert.ok((await SignTransaction(seeded)).raw)
})

test("a seed wallet still controls an address after an imported copy of its key goes", () => {
    const seed = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
    const root = bip32.fromSeed(mnemonicToSeedSync(seed))
    const derivedWif = root.derivePath("m/44'/0'/0'/0/0").toWIF()
    const derivedAddress = bitcoin.ECPair.fromWIF(derivedWif).getAddress()
    const importedOnly = bitcoin.ECPair.makeRandom({rng: () => Buffer.alloc(32, 17)})

    // Exporting a receive key and importing it back is enough to have both.
    const wallet = {
        seed,
        keys: [derivedWif, importedOnly.toWIF()],
        addresses: [derivedAddress, importedOnly.getAddress()],
    }
    assert.ok(KeyFinder(wallet)(derivedAddress))

    // With the imported copies gone, the seed still reaches its own address and
    // no longer reaches the one that was only ever an imported key.
    const emptied = {...wallet, keys: []}
    assert.ok(KeyFinder(emptied)(derivedAddress))
    assert.equal(KeyFinder(emptied)(importedOnly.getAddress()), undefined)
})

// Exporting and removing a key ask KeyFinder for the address's key and then use
// its WIF: the export hands it to the owner, and the removal matches it against
// the stored key list to establish the address is backed by an imported key. So
// the WIF it yields has to be the one on file, character for character, and an
// address the wallet only watches has to come back as no key rather than as an
// unknown address.
test("the key for an address round-trips to the stored WIF", () => {
    const seed = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
    const root = bip32.fromSeed(mnemonicToSeedSync(seed))
    const derivedWif = root.derivePath("m/44'/0'/0'/0/0").toWIF()
    const changeWif = root.derivePath("m/44'/0'/0'/1/0").toWIF()
    const slpWif = root.derivePath("m/44'/245'/0'/0/0").toWIF()
    const imported = bitcoin.ECPair.makeRandom({rng: () => Buffer.alloc(32, 23)})
    const watched = bitcoin.ECPair.makeRandom({rng: () => Buffer.alloc(32, 29)}).getAddress()
    const address = (wif) => bitcoin.ECPair.fromWIF(wif).getAddress()
    const wallet = {
        seed,
        keys: [imported.toWIF()],
        addresses: [address(derivedWif), imported.getAddress(), watched],
        changeList: [address(changeWif)],
        slpList: [address(slpWif)],
    }
    const find = KeyFinder(wallet)
    for (const wif of [derivedWif, changeWif, slpWif, imported.toWIF()]) {
        assert.equal(find(address(wif)).toWIF(), wif)
    }
    // Listed, so it is the wallet's to watch, but nothing derives or unlocks it.
    assert.equal(find(watched), undefined)
    assert.ok(WalletAddresses(wallet).includes(watched))
    assert.equal(WalletAddresses(wallet).includes(address(slpWif)), true)

    // An address the wallet has never heard of is neither: no key, and not in
    // any list, which is what tells an export to say so rather than answer
    // "watch only".
    const stranger = bitcoin.ECPair.makeRandom({rng: () => Buffer.alloc(32, 31)}).getAddress()
    assert.equal(find(stranger), undefined)
    assert.equal(WalletAddresses(wallet).includes(stranger), false)
})

test("refuses input metadata that does not match the raw transaction", async () => {
    const changedHash = request()
    changedHash.inputs[0].prev_hash = "22".repeat(32)
    await assert.rejects(SignTransaction(changedHash), {message: /does not match transaction/})

    const changedIndex = request()
    changedIndex.inputs[0].prev_index = 2
    await assert.rejects(SignTransaction(changedIndex), {message: /does not match transaction/})
})

test("refuses a prevout not established by the local database", async () => {
    await assert.rejects(SignTransaction({...request(), getOutput: async () => undefined}),
        {message: /not in the local database/})
})

test("refuses duplicate inputs", async () => {
    const tx = new bitcoin.Transaction()
    for (let i = 0; i < 2; i++) {
        tx.addInput(Buffer.from(prevHash, "hex").reverse(), 1)
    }
    tx.addOutput(bitcoin.address.toOutputScript(address), 18000)
    const duplicate = request()
    duplicate.raw = tx.toBuffer().toString("hex")
    duplicate.inputs = [
        {prev_hash: prevHash, prev_index: 1},
        {prev_hash: prevHash, prev_index: 1},
    ]
    await assert.rejects(SignTransaction(duplicate), {message: /duplicate input/})
})

test("refuses authoritative inputs outside the wallet", async () => {
    const other = bitcoin.ECPair.makeRandom({rng: () => Buffer.alloc(32, 9)}).getAddress()
    const malicious = request()
    malicious.getOutput = async () => ({address: other, value: 10000})
    await assert.rejects(SignTransaction(malicious), {message: /does not belong/})
})

test("refuses an address whose list position does not derive it", async () => {
    const seed = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
    const watched = bitcoin.ECPair.makeRandom({rng: () => Buffer.alloc(32, 11)}).getAddress()
    const watchOnly = request()
    const txb = new bitcoin.TransactionBuilder()
    txb.addInput(Buffer.from(prevHash, "hex").reverse(), 1,
        bitcoin.Transaction.DEFAULT_SEQUENCE, bitcoin.address.toOutputScript(watched))
    txb.addOutput(bitcoin.address.toOutputScript(watched), 9000)
    watchOnly.raw = txb.__build(true).toBuffer().toString("hex")
    // Occupies a list index the seed does derive, but not to this address.
    watchOnly.wallet = {seed, addresses: [...Array(20).keys()].map(String).concat([watched])}
    watchOnly.getOutput = async () => ({
        address: watched,
        value: 10000,
        script: bitcoin.address.toOutputScript(watched).toString("hex"),
    })
    await assert.rejects(SignTransaction(watchOnly), {message: /no private key/})
})

test("refuses a database script that disagrees with its address", async () => {
    const malicious = request()
    malicious.getOutput = async () => ({
        address,
        value: 10000,
        script: bitcoin.script.compile([bitcoin.opcodes.OP_TRUE]).toString("hex"),
    })
    await assert.rejects(SignTransaction(malicious), {message: /script does not match/})
})

test("refuses burning a token input in a non-SLP transaction", async () => {
    const burn = request()
    burn.getOutput = async () => ({
        address,
        value: 10000,
        script: bitcoin.address.toOutputScript(address).toString("hex"),
        slp_token_hash: "aa".repeat(32),
        slp_amount: "100",
    })
    await assert.rejects(SignTransaction(burn), {message: /valid SLP transaction/})
})

test("signs an SLP SEND only when it preserves the authoritative token amount", async () => {
    const tokenHash = "aa".repeat(32)
    const sendScript = Buffer.concat([
        Buffer.from([bitcoin.opcodes.OP_RETURN]),
        slpPush(Buffer.from("534c5000", "hex")),
        slpPush(Buffer.from([1])),
        slpPush(Buffer.from("SEND")),
        slpPush(Buffer.from(tokenHash, "hex")),
        slpPush(slpAmount(60n)),
        slpPush(slpAmount(40n)),
    ])
    const txb = new bitcoin.TransactionBuilder()
    txb.addInput(Buffer.from(prevHash, "hex").reverse(), 1,
        bitcoin.Transaction.DEFAULT_SEQUENCE, bitcoin.address.toOutputScript(address))
    txb.addOutput(sendScript, 0)
    txb.addOutput(bitcoin.address.toOutputScript(address), 546)
    txb.addOutput(bitcoin.address.toOutputScript(address), 546)
    const send = request()
    send.raw = txb.__build(true).toBuffer().toString("hex")
    send.getOutput = async () => ({
        address,
        value: 2000,
        script: bitcoin.address.toOutputScript(address).toString("hex"),
        slp_token_hash: tokenHash,
        slp_amount: "100",
    })
    assert.ok((await SignTransaction(send)).raw)

    const burn = {...send}
    burn.getOutput = async () => ({...(await send.getOutput()), slp_amount: "101"})
    await assert.rejects(SignTransaction(burn), {message: /does not preserve/})
})

// A transaction paying someone else, otherwise identical to the one above.
const outside = bitcoin.ECPair.makeRandom({rng: () => Buffer.alloc(32, 13)}).getAddress()

const payment = ({outputValue = 9000} = {}) => {
    const txb = new bitcoin.TransactionBuilder()
    txb.addInput(Buffer.from(prevHash, "hex").reverse(), 1,
        bitcoin.Transaction.DEFAULT_SEQUENCE, bitcoin.address.toOutputScript(address))
    txb.addOutput(bitcoin.address.toOutputScript(outside), outputValue)
    return {...request(), raw: txb.__build(true).toBuffer().toString("hex")}
}

test("a payment leaving the wallet is refused when there is no way to confirm it", async () => {
    await assert.rejects(SignTransaction(payment()), {message: /needs confirmation/})
})

test("listing an address the wallet has no key for does not make it change", async () => {
    // The address lists are public metadata a renderer rewrites without a
    // password, so appending a destination to them must not pass it off as
    // change and skip the confirmation.
    const listed = payment()
    listed.wallet = {...listed.wallet, addresses: [address, outside]}
    await assert.rejects(SignTransaction(listed), {message: /needs confirmation/})

    const changeList = payment()
    changeList.wallet = {...changeList.wallet, changeList: [outside]}
    await assert.rejects(SignTransaction(changeList), {message: /needs confirmation/})

    const slpList = payment()
    slpList.wallet = {...slpList.wallet, slpList: [outside]}
    await assert.rejects(SignTransaction(slpList), {message: /needs confirmation/})
})

test("confirmation names each outside destination, its amount, and the fee", async () => {
    const asked = []
    const signed = await SignTransaction({
        ...payment(),
        confirmSpend: async (request) => {
            asked.push(request)
            return true
        },
    })
    assert.ok(signed.raw)
    assert.equal(asked.length, 1)
    assert.deepEqual(asked[0].payments,
        [{address: outside, value: 9000, tokenAmount: undefined, baton: false}])
    assert.equal(asked[0].fee, 1000)
})

test("a declined confirmation signs nothing", async () => {
    let asked = 0
    await assert.rejects(SignTransaction({
        ...payment(),
        confirmSpend: async () => {
            asked++
            return false
        },
    }), {message: "spend-cancelled"})
    assert.equal(asked, 1)
})

test("change and data outputs are not a spend and need no confirmation", async () => {
    const txb = new bitcoin.TransactionBuilder()
    txb.addInput(Buffer.from(prevHash, "hex").reverse(), 1,
        bitcoin.Transaction.DEFAULT_SEQUENCE, bitcoin.address.toOutputScript(address))
    txb.addOutput(bitcoin.script.compile(
        [bitcoin.opcodes.OP_RETURN, Buffer.from("6d02", "hex"), Buffer.from("hello")]), 0)
    txb.addOutput(bitcoin.address.toOutputScript(address), 9000)
    const post = {...request(), raw: txb.__build(true).toBuffer().toString("hex")}
    assert.ok((await SignTransaction(post)).raw)
})

test("value attached to a data output is treated as leaving the wallet", async () => {
    const txb = new bitcoin.TransactionBuilder()
    txb.addInput(Buffer.from(prevHash, "hex").reverse(), 1,
        bitcoin.Transaction.DEFAULT_SEQUENCE, bitcoin.address.toOutputScript(address))
    txb.addOutput(bitcoin.script.compile(
        [bitcoin.opcodes.OP_RETURN, Buffer.from("burn")]), 9000)
    const burn = {...request(), raw: txb.__build(true).toBuffer().toString("hex")}
    await assert.rejects(SignTransaction(burn), {message: /needs confirmation/})
})

test("an output whose script names no address counts as leaving the wallet", async () => {
    const txb = new bitcoin.TransactionBuilder()
    txb.addInput(Buffer.from(prevHash, "hex").reverse(), 1,
        bitcoin.Transaction.DEFAULT_SEQUENCE, bitcoin.address.toOutputScript(address))
    txb.addOutput(bitcoin.script.compile([bitcoin.opcodes.OP_TRUE]), 9000)
    const odd = {...request(), raw: txb.__build(true).toBuffer().toString("hex")}
    let asked
    assert.ok((await SignTransaction({...odd, confirmSpend: async (request) => {
        asked = request
        return true
    }})).raw)
    assert.deepEqual(asked.payments,
        [{address: undefined, value: 9000, tokenAmount: undefined, baton: false}])
})

test("confirmation reports the token amount an outside output carries", async () => {
    const tokenHash = "aa".repeat(32)
    const sendScript = Buffer.concat([
        Buffer.from([bitcoin.opcodes.OP_RETURN]),
        slpPush(Buffer.from("534c5000", "hex")),
        slpPush(Buffer.from([1])),
        slpPush(Buffer.from("SEND")),
        slpPush(Buffer.from(tokenHash, "hex")),
        slpPush(slpAmount(60n)),
        slpPush(slpAmount(40n)),
    ])
    const txb = new bitcoin.TransactionBuilder()
    txb.addInput(Buffer.from(prevHash, "hex").reverse(), 1,
        bitcoin.Transaction.DEFAULT_SEQUENCE, bitcoin.address.toOutputScript(address))
    txb.addOutput(sendScript, 0)
    txb.addOutput(bitcoin.address.toOutputScript(outside), 546)
    txb.addOutput(bitcoin.address.toOutputScript(address), 546)
    const send = request()
    send.raw = txb.__build(true).toBuffer().toString("hex")
    send.getOutput = async () => ({
        address,
        value: 2000,
        script: bitcoin.address.toOutputScript(address).toString("hex"),
        slp_token_hash: tokenHash,
        slp_amount: "100",
    })
    let asked
    const signed = await SignTransaction({...send, confirmSpend: async (request) => {
        asked = request
        return true
    }})
    assert.ok(signed.raw)
    // Only the recipient's output is a spend; the second token output is change.
    assert.deepEqual(asked.payments,
        [{address: outside, value: 546, tokenAmount: "60", baton: false}])
    // Flagged so a satoshi budget never stands in for consent to move tokens.
    assert.equal(signed.carriesTokens, true)
})

// A MINT spending the wallet's baton. mintTo receives the new tokens at output
// 1, batonTo keeps the authority to mint more at output 2.
const mint = ({mintTo, batonTo, batonVout = Buffer.from([2])}) => {
    const tokenHash = "bb".repeat(32)
    const mintScript = Buffer.concat([
        Buffer.from([bitcoin.opcodes.OP_RETURN]),
        slpPush(Buffer.from("534c5000", "hex")),
        slpPush(Buffer.from([1])),
        slpPush(Buffer.from("MINT")),
        slpPush(Buffer.from(tokenHash, "hex")),
        slpPush(batonVout),
        slpPush(slpAmount(1000n)),
    ])
    const txb = new bitcoin.TransactionBuilder()
    txb.addInput(Buffer.from(prevHash, "hex").reverse(), 1,
        bitcoin.Transaction.DEFAULT_SEQUENCE, bitcoin.address.toOutputScript(address))
    txb.addOutput(mintScript, 0)
    txb.addOutput(bitcoin.address.toOutputScript(mintTo), 546)
    txb.addOutput(bitcoin.address.toOutputScript(batonTo), 546)
    return {
        ...request(),
        raw: txb.__build(true).toBuffer().toString("hex"),
        getOutput: async () => ({
            address,
            value: 2000,
            script: bitcoin.address.toOutputScript(address).toString("hex"),
            slp_baton_token_hash: tokenHash,
        }),
    }
}

test("confirmation reports minted tokens sent outside the wallet", async () => {
    let asked
    assert.ok((await SignTransaction({...mint({mintTo: outside, batonTo: address}),
        confirmSpend: async (request) => {
            asked = request
            return true
        }})).raw)
    assert.deepEqual(asked.payments,
        [{address: outside, value: 546, tokenAmount: "1000", baton: false}])
})

test("confirmation reports a mint baton leaving the wallet", async () => {
    let asked
    assert.ok((await SignTransaction({...mint({mintTo: address, batonTo: outside}),
        confirmSpend: async (request) => {
            asked = request
            return true
        }})).raw)
    // The minted tokens stay; the authority to mint more does not.
    assert.deepEqual(asked.payments,
        [{address: outside, value: 546, tokenAmount: undefined, baton: true}])
})

test("a mint keeping its tokens and baton needs no confirmation", async () => {
    assert.ok((await SignTransaction(mint({mintTo: address, batonTo: address}))).raw)
})

test("refuses a mint whose baton names an output the transaction lacks", async () => {
    await assert.rejects(
        SignTransaction(mint({mintTo: address, batonTo: address, batonVout: Buffer.from([7])})),
        {message: /baton names an output/})
    await assert.rejects(
        SignTransaction(mint({mintTo: address, batonTo: address, batonVout: Buffer.from([1])})),
        {message: /baton names an output/})
})

test("refuses negative fees and excessive fee rates", async () => {
    await assert.rejects(SignTransaction(request({inputValue: 8000, outputValue: 9000})),
        {message: /spends more than its inputs/})
    await assert.rejects(SignTransaction(request({inputValue: 1000000, outputValue: 0})),
        {message: /fee rate exceeds safety limit/})
})

test("refuses watch-only wallets", async () => {
    await assert.rejects(SignTransaction({...request(), wallet: {addresses: [address]}}),
        {message: /watch-only/})
})

test("the preview reads the address list where signing reads the keys", async () => {
    // An address the wallet cannot sign for, listed as if it were the wallet's
    // own: the preview has nothing but the list to go on and calls the output
    // change, while signing produces no key for it and calls it a payment. This
    // is the disagreement main/app/spend_match.js exists to catch.
    const foreign = bitcoin.ECPair.makeRandom({rng: () => Buffer.alloc(32, 3)}).getAddress()
    const txb = new bitcoin.TransactionBuilder()
    txb.addInput(Buffer.from(prevHash, "hex").reverse(), 1,
        bitcoin.Transaction.DEFAULT_SEQUENCE, bitcoin.address.toOutputScript(address))
    txb.addOutput(bitcoin.address.toOutputScript(foreign), 9000)
    const listed = {
        raw: txb.__build(true).toBuffer().toString("hex"),
        inputs: [{prev_hash: prevHash, prev_index: 1}],
        wallet: {keys: [key.toWIF()], addresses: [address, foreign]},
        getOutput: async () => ({
            hash: prevHash, index: 1, address, value: 10000,
            script: bitcoin.address.toOutputScript(address).toString("hex"),
        }),
    }
    const preview = await PreviewSpend(listed)
    assert.deepEqual(preview.payments, [])
    assert.equal(preview.fee, 1000)
    let confirmed
    await SignTransaction({...listed, confirmSpend: async (spend) => {
        confirmed = spend
        return true
    }})
    assert.equal(confirmed.payments.length, 1)
    assert.equal(confirmed.payments[0].address, foreign)
    assert.equal(confirmed.payments[0].value, 9000)
})
