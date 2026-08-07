const test = require("node:test")
const assert = require("node:assert")
const {ECPair} = require("../common/bitcoin/ecpair")
const {Transaction} = require("../common/bitcoin/transaction")
const baddress = require("../common/bitcoin/address")
const bscript = require("../common/bitcoin/script")
const opcodes = require("../common/bitcoin/opcodes.json")
const {mnemonicToSeedSync} = require("bip39")
const bip32 = require("../common/bitcoin/bip32")
const {KeyFinder, MaxFeeRate, PreviewSpend, SignTransaction, WalletAddresses} = require("./transaction_signer")

const key = ECPair.fromPrivateKey(Buffer.alloc(32, 7))
const address = key.getAddress()
const prevHash = "11".repeat(32)
const slpPush = (buffer) => Buffer.concat([Buffer.from([buffer.length]), buffer])
const slpAmount = (amount) => Buffer.from(amount.toString(16).padStart(16, "0"), "hex")

const request = ({inputValue = 10000, outputValue = 9000} = {}) => {
    const txb = new Transaction()
    txb.addInput(Buffer.from(prevHash, "hex").reverse(), 1)
    txb.addOutput(baddress.toOutputScript(address), outputValue)
    return {
        raw: txb.toBuffer().toString("hex"),
        inputs: [{prev_hash: prevHash, prev_index: 1}],
        wallet: {keys: [key.toWIF()], addresses: [address]},
        getOutput: async () => ({
            hash: prevHash,
            index: 1,
            address,
            value: inputValue,
            script: baddress.toOutputScript(address).toString("hex"),
        }),
    }
}

test("signs using authoritative prevout metadata", async () => {
    const signed = await SignTransaction(request())
    const tx = Transaction.fromBuffer(Buffer.from(signed.raw, "hex"))
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
    const changeAddress = ECPair.fromWIF(child.toWIF()).getAddress()
    const seeded = request()
    const txb = new Transaction()
    txb.addInput(Buffer.from(prevHash, "hex").reverse(), 1)
    txb.addOutput(baddress.toOutputScript(changeAddress), 9000)
    seeded.raw = txb.toBuffer().toString("hex")
    seeded.wallet = {seed, addresses: [], changeList: [changeAddress], slpList: []}
    seeded.getOutput = async () => ({
        address: changeAddress,
        value: 10000,
        script: baddress.toOutputScript(changeAddress).toString("hex"),
    })
    assert.ok((await SignTransaction(seeded)).raw)
})

test("a seed wallet still controls an address after an imported copy of its key goes", () => {
    const seed = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
    const root = bip32.fromSeed(mnemonicToSeedSync(seed))
    const derivedWif = root.derivePath("m/44'/0'/0'/0/0").toWIF()
    const derivedAddress = ECPair.fromWIF(derivedWif).getAddress()
    const importedOnly = ECPair.fromPrivateKey(Buffer.alloc(32, 17))

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
    const imported = ECPair.fromPrivateKey(Buffer.alloc(32, 23))
    const watched = ECPair.fromPrivateKey(Buffer.alloc(32, 29)).getAddress()
    const address = (wif) => ECPair.fromWIF(wif).getAddress()
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
    const stranger = ECPair.fromPrivateKey(Buffer.alloc(32, 31)).getAddress()
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
    const tx = new Transaction()
    for (let i = 0; i < 2; i++) {
        tx.addInput(Buffer.from(prevHash, "hex").reverse(), 1)
    }
    tx.addOutput(baddress.toOutputScript(address), 18000)
    const duplicate = request()
    duplicate.raw = tx.toBuffer().toString("hex")
    duplicate.inputs = [
        {prev_hash: prevHash, prev_index: 1},
        {prev_hash: prevHash, prev_index: 1},
    ]
    await assert.rejects(SignTransaction(duplicate), {message: /duplicate input/})
})

test("refuses authoritative inputs outside the wallet", async () => {
    const other = ECPair.fromPrivateKey(Buffer.alloc(32, 9)).getAddress()
    const malicious = request()
    malicious.getOutput = async () => ({address: other, value: 10000})
    await assert.rejects(SignTransaction(malicious), {message: /does not belong/})
})

test("refuses an address whose list position does not derive it", async () => {
    const seed = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
    const watched = ECPair.fromPrivateKey(Buffer.alloc(32, 11)).getAddress()
    const watchOnly = request()
    const txb = new Transaction()
    txb.addInput(Buffer.from(prevHash, "hex").reverse(), 1)
    txb.addOutput(baddress.toOutputScript(watched), 9000)
    watchOnly.raw = txb.toBuffer().toString("hex")
    // Occupies a list index the seed does derive, but not to this address.
    watchOnly.wallet = {seed, addresses: [...Array(20).keys()].map(String).concat([watched])}
    watchOnly.getOutput = async () => ({
        address: watched,
        value: 10000,
        script: baddress.toOutputScript(watched).toString("hex"),
    })
    await assert.rejects(SignTransaction(watchOnly), {message: /no private key/})
})

test("refuses a database script that disagrees with its address", async () => {
    const malicious = request()
    malicious.getOutput = async () => ({
        address,
        value: 10000,
        script: bscript.compile([opcodes.OP_TRUE]).toString("hex"),
    })
    await assert.rejects(SignTransaction(malicious), {message: /script does not match/})
})

test("refuses burning a token input in a non-SLP transaction", async () => {
    const burn = request()
    burn.getOutput = async () => ({
        address,
        value: 10000,
        script: baddress.toOutputScript(address).toString("hex"),
        slp_token_hash: "aa".repeat(32),
        slp_amount: "100",
    })
    await assert.rejects(SignTransaction(burn), {message: /valid SLP transaction/})
})

test("signs an SLP SEND only when it preserves the authoritative token amount", async () => {
    const tokenHash = "aa".repeat(32)
    const sendScript = Buffer.concat([
        Buffer.from([opcodes.OP_RETURN]),
        slpPush(Buffer.from("534c5000", "hex")),
        slpPush(Buffer.from([1])),
        slpPush(Buffer.from("SEND")),
        slpPush(Buffer.from(tokenHash, "hex")),
        slpPush(slpAmount(60n)),
        slpPush(slpAmount(40n)),
    ])
    const txb = new Transaction()
    txb.addInput(Buffer.from(prevHash, "hex").reverse(), 1)
    txb.addOutput(sendScript, 0)
    txb.addOutput(baddress.toOutputScript(address), 546)
    txb.addOutput(baddress.toOutputScript(address), 546)
    const send = request()
    send.raw = txb.toBuffer().toString("hex")
    send.getOutput = async () => ({
        address,
        value: 2000,
        script: baddress.toOutputScript(address).toString("hex"),
        slp_token_hash: tokenHash,
        slp_amount: "100",
        slp_token_type: 1,
    })
    assert.ok((await SignTransaction(send)).raw)

    const burn = {...send}
    burn.getOutput = async () => ({...(await send.getOutput()), slp_amount: "101"})
    await assert.rejects(SignTransaction(burn), {message: /does not preserve/})
})

test("a full uint64 token amount arrives as a BigInt and signs exactly", async () => {
    // What GetOutput now hands the signer for an oversized amount: the exact
    // BigInt, not a float's approximation.
    const tokenHash = "aa".repeat(32)
    const max = 18446744073709551615n
    const sendScript = Buffer.concat([
        Buffer.from([opcodes.OP_RETURN]),
        slpPush(Buffer.from("534c5000", "hex")),
        slpPush(Buffer.from([1])),
        slpPush(Buffer.from("SEND")),
        slpPush(Buffer.from(tokenHash, "hex")),
        slpPush(slpAmount(max)),
    ])
    const txb = new Transaction()
    txb.addInput(Buffer.from(prevHash, "hex").reverse(), 1)
    txb.addOutput(sendScript, 0)
    txb.addOutput(baddress.toOutputScript(address), 546)
    const send = request()
    send.raw = txb.toBuffer().toString("hex")
    send.getOutput = async () => ({
        address,
        value: 2000,
        script: baddress.toOutputScript(address).toString("hex"),
        slp_token_hash: tokenHash,
        slp_amount: max,
        slp_token_type: 1,
    })
    assert.ok((await SignTransaction(send)).raw)
})

test("refuses a token amount the database can only hold approximately", async () => {
    // A uint64-scale amount reaches the database as the nearest float, not the
    // on-chain amount. A SEND balanced against that float claims tokens the
    // inputs do not exactly carry - claiming more is SLP-invalid on chain and
    // burns every token input - so it is refused outright, even though the
    // OP_RETURN agrees with the stored figure, as it does here.
    const tokenHash = "aa".repeat(32)
    const stored = 9223372036854775808 // 2^63: exactly representable, not safe
    const sendScript = Buffer.concat([
        Buffer.from([opcodes.OP_RETURN]),
        slpPush(Buffer.from("534c5000", "hex")),
        slpPush(Buffer.from([1])),
        slpPush(Buffer.from("SEND")),
        slpPush(Buffer.from(tokenHash, "hex")),
        slpPush(slpAmount(BigInt(stored))),
    ])
    const txb = new Transaction()
    txb.addInput(Buffer.from(prevHash, "hex").reverse(), 1)
    txb.addOutput(sendScript, 0)
    txb.addOutput(baddress.toOutputScript(address), 546)
    const send = request()
    send.raw = txb.toBuffer().toString("hex")
    send.getOutput = async () => ({
        address,
        value: 2000,
        script: baddress.toOutputScript(address).toString("hex"),
        slp_token_hash: tokenHash,
        slp_amount: stored,
        slp_token_type: 1,
    })
    await assert.rejects(SignTransaction(send), {message: /too large to represent/})
})

// A self-contained SEND for the type agreement checks: the declared type rides
// in the script's 1-2 byte type field, the genesis type in the fixture, and
// everything else - hash, amounts, destination - is in order.
const typedSend = (declared, genesisType) => {
    const tokenHash = "aa".repeat(32)
    const sendScript = Buffer.concat([
        Buffer.from([opcodes.OP_RETURN]),
        slpPush(Buffer.from("534c5000", "hex")),
        slpPush(Buffer.from(declared)),
        slpPush(Buffer.from("SEND")),
        slpPush(Buffer.from(tokenHash, "hex")),
        slpPush(slpAmount(100n)),
    ])
    const txb = new Transaction()
    txb.addInput(Buffer.from(prevHash, "hex").reverse(), 1)
    txb.addOutput(sendScript, 0)
    txb.addOutput(baddress.toOutputScript(address), 546)
    const send = request()
    send.raw = txb.toBuffer().toString("hex")
    send.getOutput = async () => ({
        address,
        value: 2000,
        script: baddress.toOutputScript(address).toString("hex"),
        slp_token_hash: tokenHash,
        slp_amount: "100",
        slp_token_type: genesisType,
    })
    return send
}

test("a declared type that disagrees with the genesis is refused, not signed into a burn", async () => {
    // NFT1-child inputs (0x41) framed as a type-1 SEND - or the reverse - is
    // a transfer consensus validators reject, which burns the inputs.
    await assert.rejects(SignTransaction(typedSend([1], 0x41)),
        {message: /token type does not match/})
    await assert.rejects(SignTransaction(typedSend([0x41], 1)),
        {message: /token type does not match/})
})

test("a genesis type the database does not record refuses the spend outright", async () => {
    await assert.rejects(SignTransaction(typedSend([1], undefined)),
        {message: /type is not known/})
})

test("non-type-1 tokens sign when the declared type agrees, in every encoding", async () => {
    // 0x41 rides as a plain one-byte push; a lone 0x81 byte is re-minimalized
    // to OP_1NEGATE by decompile and must still read as the NFT1 group type;
    // the 2-byte form of the field names the same type.
    assert.ok((await SignTransaction(typedSend([0x41], 0x41))).raw)
    assert.ok((await SignTransaction(typedSend([0x81], 0x81))).raw)
    assert.ok((await SignTransaction(typedSend([0, 0x41], 0x41))).raw)
})

// A transaction paying someone else, otherwise identical to the one above.
const outside = ECPair.fromPrivateKey(Buffer.alloc(32, 13)).getAddress()

const payment = ({outputValue = 9000} = {}) => {
    const txb = new Transaction()
    txb.addInput(Buffer.from(prevHash, "hex").reverse(), 1)
    txb.addOutput(baddress.toOutputScript(outside), outputValue)
    return {...request(), raw: txb.toBuffer().toString("hex")}
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
    const txb = new Transaction()
    txb.addInput(Buffer.from(prevHash, "hex").reverse(), 1)
    txb.addOutput(bscript.compile(
        [opcodes.OP_RETURN, Buffer.from("6d02", "hex"), Buffer.from("hello")]), 0)
    txb.addOutput(baddress.toOutputScript(address), 9000)
    const post = {...request(), raw: txb.toBuffer().toString("hex")}
    assert.ok((await SignTransaction(post)).raw)
})

test("value attached to a data output is treated as leaving the wallet", async () => {
    const txb = new Transaction()
    txb.addInput(Buffer.from(prevHash, "hex").reverse(), 1)
    txb.addOutput(bscript.compile(
        [opcodes.OP_RETURN, Buffer.from("burn")]), 9000)
    const burn = {...request(), raw: txb.toBuffer().toString("hex")}
    await assert.rejects(SignTransaction(burn), {message: /needs confirmation/})
})

test("an output whose script names no address counts as leaving the wallet", async () => {
    const txb = new Transaction()
    txb.addInput(Buffer.from(prevHash, "hex").reverse(), 1)
    txb.addOutput(bscript.compile([opcodes.OP_TRUE]), 9000)
    const odd = {...request(), raw: txb.toBuffer().toString("hex")}
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
        Buffer.from([opcodes.OP_RETURN]),
        slpPush(Buffer.from("534c5000", "hex")),
        slpPush(Buffer.from([1])),
        slpPush(Buffer.from("SEND")),
        slpPush(Buffer.from(tokenHash, "hex")),
        slpPush(slpAmount(60n)),
        slpPush(slpAmount(40n)),
    ])
    const txb = new Transaction()
    txb.addInput(Buffer.from(prevHash, "hex").reverse(), 1)
    txb.addOutput(sendScript, 0)
    txb.addOutput(baddress.toOutputScript(outside), 546)
    txb.addOutput(baddress.toOutputScript(address), 546)
    const send = request()
    send.raw = txb.toBuffer().toString("hex")
    send.getOutput = async () => ({
        address,
        value: 2000,
        script: baddress.toOutputScript(address).toString("hex"),
        slp_token_hash: tokenHash,
        slp_amount: "100",
        slp_token_type: 1,
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
        Buffer.from([opcodes.OP_RETURN]),
        slpPush(Buffer.from("534c5000", "hex")),
        slpPush(Buffer.from([1])),
        slpPush(Buffer.from("MINT")),
        slpPush(Buffer.from(tokenHash, "hex")),
        slpPush(batonVout),
        slpPush(slpAmount(1000n)),
    ])
    const txb = new Transaction()
    txb.addInput(Buffer.from(prevHash, "hex").reverse(), 1)
    txb.addOutput(mintScript, 0)
    txb.addOutput(baddress.toOutputScript(mintTo), 546)
    txb.addOutput(baddress.toOutputScript(batonTo), 546)
    return {
        ...request(),
        raw: txb.toBuffer().toString("hex"),
        getOutput: async () => ({
            address,
            value: 2000,
            script: baddress.toOutputScript(address).toString("hex"),
            slp_baton_token_hash: tokenHash,
            slp_token_type: 1,
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

test("a mint whose declared type disagrees with the baton's genesis is refused", async () => {
    const disagreeing = mint({mintTo: address, batonTo: address})
    const output = await disagreeing.getOutput()
    disagreeing.getOutput = async () => ({...output, slp_token_type: 0x41})
    await assert.rejects(SignTransaction(disagreeing), {message: /token type does not match/})
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
    const foreign = ECPair.fromPrivateKey(Buffer.alloc(32, 3)).getAddress()
    const txb = new Transaction()
    txb.addInput(Buffer.from(prevHash, "hex").reverse(), 1)
    txb.addOutput(baddress.toOutputScript(foreign), 9000)
    const listed = {
        raw: txb.toBuffer().toString("hex"),
        inputs: [{prev_hash: prevHash, prev_index: 1}],
        wallet: {keys: [key.toWIF()], addresses: [address, foreign]},
        getOutput: async () => ({
            hash: prevHash, index: 1, address, value: 10000,
            script: baddress.toOutputScript(address).toString("hex"),
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

// The ordering constraint is renderer-supplied and compared as a string against
// the lowercase hex txid. A shape that can never be beaten must be refused up
// front rather than running the synchronous re-signing loop to exhaustion on
// the main process's thread.
test("a beat hash must be 64 lowercase hex characters", async () => {
    for (const beatHash of ["zz", "F".repeat(64), "f".repeat(63), "f".repeat(65)]) {
        await assert.rejects(SignTransaction({...request(), beatHash}),
            {message: /ordering constraint/})
    }
    // Every txid beats all zeros, so the loop settles on the first attempt.
    const signed = await SignTransaction({...request(), beatHash: "0".repeat(64)})
    assert.ok(signed.txid > "0".repeat(64))
})

test("an unbeatable beat hash fails after the bounded attempts rather than hanging", async () => {
    await assert.rejects(SignTransaction({...request(), beatHash: "f".repeat(64)}),
        {message: /unable to satisfy transaction ordering constraint/})
})
