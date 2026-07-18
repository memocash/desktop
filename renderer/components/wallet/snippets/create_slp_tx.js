import bitcoin from "../../util/bitcoin";
import {address} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import {FormatTokenAmount} from "../../util/slp";
import {DirectTx} from "../../tx/direct_tx";

// SLP OP_RETURN scripts are built with raw pushes because script.compile would
// minimal-encode 1-byte values as OP_1..OP_16, which SLP parsers reject. Empty
// fields must still be real pushes — a zero-length raw push would be OP_0 — so
// empties are encoded as PUSHDATA1 with length 0 per the SLP spec.
const slpPush = (buf) => {
    if (!buf.length) {
        return Buffer.from([0x4c, 0x00])
    }
    if (buf.length <= 0x4b) {
        return Buffer.concat([Buffer.from([buf.length]), buf])
    }
    return Buffer.concat([Buffer.from([0x4c, buf.length]), buf])
}
const slpAmountBuf = (amount) => Buffer.from(amount.toString(16).padStart(16, "0"), "hex")

// SLP SEND OP_RETURN per the SLP spec. Verified against an on-chain SEND: the
// token hash is pushed in display order (not reversed like prevouts) and
// amounts are 8-byte big-endian base units.
const BuildSlpSendScript = (tokenHash, tokenType, amounts) => {
    return Buffer.concat([
        Buffer.from([0x6a]),
        slpPush(Buffer.from("534c5000", "hex")),
        slpPush(Buffer.from([tokenType])),
        slpPush(Buffer.from("SEND", "ascii")),
        slpPush(Buffer.from(tokenHash, "hex")),
        ...amounts.map(amount => slpPush(slpAmountBuf(amount))),
    ])
}

// SLP GENESIS OP_RETURN. The document hash field is always empty. batonVout of
// 0 means no baton (the field is an empty push); otherwise it's the output
// index that carries the mint baton (must be >= 2).
const BuildSlpGenesisScript = ({ticker, name, docUrl, decimals, batonVout, amount}) => {
    return Buffer.concat([
        Buffer.from([0x6a]),
        slpPush(Buffer.from("534c5000", "hex")),
        slpPush(Buffer.from([1])),
        slpPush(Buffer.from("GENESIS", "ascii")),
        slpPush(Buffer.from(ticker || "", "utf8")),
        slpPush(Buffer.from(name || "", "utf8")),
        slpPush(Buffer.from(docUrl || "", "utf8")),
        slpPush(Buffer.alloc(0)),
        slpPush(Buffer.from([decimals])),
        slpPush(batonVout ? Buffer.from([batonVout]) : Buffer.alloc(0)),
        slpPush(slpAmountBuf(amount)),
    ])
}

// SLP MINT OP_RETURN. batonVout of 0 destroys the baton (empty push), ending
// further minting; otherwise the baton continues at that output index (>= 2).
const BuildSlpMintScript = (tokenHash, tokenType, batonVout, amount) => {
    return Buffer.concat([
        Buffer.from([0x6a]),
        slpPush(Buffer.from("534c5000", "hex")),
        slpPush(Buffer.from([tokenType])),
        slpPush(Buffer.from("MINT", "ascii")),
        slpPush(Buffer.from(tokenHash, "hex")),
        slpPush(batonVout ? Buffer.from([batonVout]) : Buffer.alloc(0)),
        slpPush(slpAmountBuf(amount)),
    ])
}

// Shared tail for SLP transactions: adds regular (non-token, non-dust) UTXOs
// to cover the BCH fee, appends BCH change to the wallet's first address, then
// either previews or signs+broadcasts. inputs/outputs arrive with the
// token-specific parts already in place.
const finishSlpTx = async ({wallet, utxos, inputs, totalInput, outputs, setModal, onDone, preview}) => {
    let requiredInput = bitcoin.Fee.Base + inputs.length * bitcoin.Fee.InputP2PKH
    for (let i = 0; i < outputs.length; i++) {
        const {script, value} = outputs[i]
        requiredInput += script.length + (value || 0) + bitcoin.Fee.OutputValueSize
    }
    const feeUtxos = utxos.filter(utxo => !utxo.slp_token_hash && !utxo.slp_baton_token_hash &&
        utxo.value !== bitcoin.Fee.DustLimit)
    feeUtxos.sort((a, b) => b.value - a.value)
    for (let i = 0; i < feeUtxos.length; i++) {
        if (totalInput === requiredInput ||
            totalInput > requiredInput + bitcoin.Fee.OutputP2PKH + bitcoin.Fee.DustLimit) {
            break
        }
        inputs.push([feeUtxos[i].hash, feeUtxos[i].index, feeUtxos[i].value, feeUtxos[i].address].join(":"))
        requiredInput += bitcoin.Fee.InputP2PKH
        totalInput += feeUtxos[i].value
    }
    if (totalInput < requiredInput) {
        window.electron.showMessageDialog("Not enough value in wallet to complete this transaction")
        return
    }
    const change = totalInput === requiredInput ? 0 : totalInput - requiredInput - bitcoin.Fee.OutputP2PKH
    let outputStrings = []
    for (let i = 0; i < outputs.length; i++) {
        const {script, value} = outputs[i]
        outputStrings.push(script.toString("hex") + ":" + (value ? value : 0).toString())
    }
    if (change > 0) {
        outputStrings.push(address.toOutputScript(wallet.addresses[0]).toString("hex") + ":" + change)
    }
    if (preview) {
        await window.electron.openPreviewSend({inputs, outputs: outputStrings, beatHash: ""})
    } else {
        await DirectTx(inputs, outputStrings, "", setModal, onDone, true)
    }
    return true
}

const getSlpAddress = (wallet) =>
    wallet.slpList && wallet.slpList.length ? wallet.slpList[0] : wallet.addresses[0]

// Builds and either previews or signs+broadcasts an SLP token send:
// - inputs: enough token UTXOs of this token to cover the amount, then
//   regular (non-token, non-dust) UTXOs to cover the BCH fee
// - outputs: SLP SEND OP_RETURN, dust to the recipient, token-change dust to
//   the wallet's first SLP address, and BCH change
// amount is a BigInt in base units.
const CreateSlpTransaction = async ({wallet, token, payTo, amount, setModal, onDone, preview}) => {
    const allAddresses = wallet.addresses.concat(wallet.changeList || [], wallet.slpList || [])
    const utxos = await window.electron.getUtxos(allAddresses)
    const tokenUtxos = utxos.filter(utxo => utxo.slp_token_hash === token.token_hash)
    tokenUtxos.sort((a, b) => b.slp_amount - a.slp_amount)
    let inputs = []
    let totalInput = 0
    let tokenInput = 0n
    for (let i = 0; i < tokenUtxos.length && tokenInput < amount; i++) {
        inputs.push([tokenUtxos[i].hash, tokenUtxos[i].index, tokenUtxos[i].value, tokenUtxos[i].address].join(":"))
        totalInput += tokenUtxos[i].value
        tokenInput += BigInt(tokenUtxos[i].slp_amount)
    }
    if (tokenInput < amount) {
        window.electron.showMessageDialog("Not enough " + (token.ticker || "tokens") + " in wallet " +
            "(have " + FormatTokenAmount(tokenInput, token.decimals) + ")")
        return
    }
    const tokenChange = tokenInput - amount
    const amounts = tokenChange > 0n ? [amount, tokenChange] : [amount]
    const slpScript = BuildSlpSendScript(token.token_hash, token.token_type || 1, amounts)
    let outputs = [
        {script: slpScript, value: 0},
        {script: address.toOutputScript(payTo), value: bitcoin.Fee.DustLimit},
    ]
    if (tokenChange > 0n) {
        outputs.push({script: address.toOutputScript(getSlpAddress(wallet)), value: bitcoin.Fee.DustLimit})
    }
    return finishSlpTx({wallet, utxos, inputs, totalInput, outputs, setModal, onDone, preview})
}

// Creates a new SLP token (GENESIS). The initial supply goes as dust to the
// wallet's first SLP address at output 1; if createBaton is set the mint baton
// goes as dust to the same address at output 2. The new token's hash is the
// genesis txid. amount is a BigInt in base units.
const CreateSlpGenesisTransaction = async ({wallet, ticker, name, docUrl, decimals, amount, createBaton,
                                               setModal, onDone, preview}) => {
    const allAddresses = wallet.addresses.concat(wallet.changeList || [], wallet.slpList || [])
    const utxos = await window.electron.getUtxos(allAddresses)
    const slpScript = BuildSlpGenesisScript({
        ticker, name, docUrl, decimals,
        batonVout: createBaton ? 2 : 0,
        amount,
    })
    if (slpScript.length > 223) {
        window.electron.showMessageDialog("Token details too long (OP_RETURN limit is 223 bytes, " +
            "this transaction needs " + slpScript.length + ")")
        return
    }
    const slpAddress = getSlpAddress(wallet)
    let outputs = [
        {script: slpScript, value: 0},
        {script: address.toOutputScript(slpAddress), value: bitcoin.Fee.DustLimit},
    ]
    if (createBaton) {
        outputs.push({script: address.toOutputScript(slpAddress), value: bitcoin.Fee.DustLimit})
    }
    return finishSlpTx({wallet, utxos, inputs: [], totalInput: 0, outputs, setModal, onDone, preview})
}

// Mints additional supply for a token the wallet holds a mint baton for. The
// baton UTXO is spent as the first input; minted tokens go as dust to the
// wallet's first SLP address at output 1. If keepBaton is set the baton
// continues at output 2, otherwise it is destroyed and no further minting is
// possible. amount is a BigInt in base units.
const CreateSlpMintTransaction = async ({wallet, token, amount, keepBaton, setModal, onDone, preview}) => {
    const allAddresses = wallet.addresses.concat(wallet.changeList || [], wallet.slpList || [])
    const utxos = await window.electron.getUtxos(allAddresses)
    const batonUtxo = utxos.find(utxo => utxo.slp_baton_token_hash === token.token_hash)
    if (!batonUtxo) {
        window.electron.showMessageDialog("No mint baton for " + (token.ticker || "this token") + " in wallet")
        return
    }
    let inputs = [[batonUtxo.hash, batonUtxo.index, batonUtxo.value, batonUtxo.address].join(":")]
    let totalInput = batonUtxo.value
    const slpScript = BuildSlpMintScript(token.token_hash, token.token_type || 1, keepBaton ? 2 : 0, amount)
    const slpAddress = getSlpAddress(wallet)
    let outputs = [
        {script: slpScript, value: 0},
        {script: address.toOutputScript(slpAddress), value: bitcoin.Fee.DustLimit},
    ]
    if (keepBaton) {
        outputs.push({script: address.toOutputScript(slpAddress), value: bitcoin.Fee.DustLimit})
    }
    return finishSlpTx({wallet, utxos, inputs, totalInput, outputs, setModal, onDone, preview})
}

export {
    BuildSlpSendScript,
    BuildSlpGenesisScript,
    BuildSlpMintScript,
    CreateSlpTransaction,
    CreateSlpGenesisTransaction,
    CreateSlpMintTransaction,
}
