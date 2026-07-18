import bitcoin from "../../util/bitcoin";
import {address} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import {FormatTokenAmount} from "../../util/slp";
import {DirectTx} from "../../tx/direct_tx";

// SLP SEND OP_RETURN per the SLP spec. Built with raw pushes because
// script.compile would minimal-encode the 1-byte token type as OP_1, which SLP
// parsers reject. All pushes are under 76 bytes so single-byte lengths work.
// Verified against an on-chain SEND: the token hash is pushed in display order
// (not reversed like prevouts) and amounts are 8-byte big-endian base units.
const BuildSlpSendScript = (tokenHash, tokenType, amounts) => {
    const push = (buf) => Buffer.concat([Buffer.from([buf.length]), buf])
    const amountBuf = (amount) => Buffer.from(amount.toString(16).padStart(16, "0"), "hex")
    return Buffer.concat([
        Buffer.from([0x6a]),
        push(Buffer.from("534c5000", "hex")),
        push(Buffer.from([tokenType])),
        push(Buffer.from("SEND", "ascii")),
        push(Buffer.from(tokenHash, "hex")),
        ...amounts.map(amount => push(amountBuf(amount))),
    ])
}

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
    const slpChangeAddress = wallet.slpList && wallet.slpList.length ? wallet.slpList[0] : wallet.addresses[0]
    let outputs = [
        {script: slpScript, value: 0},
        {script: address.toOutputScript(payTo), value: bitcoin.Fee.DustLimit},
    ]
    if (tokenChange > 0n) {
        outputs.push({script: address.toOutputScript(slpChangeAddress), value: bitcoin.Fee.DustLimit})
    }
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

export {
    BuildSlpSendScript,
    CreateSlpTransaction,
}
