import bitcoin, {ECPair} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import GetWallet from "../util/wallet";
import {mnemonicToSeedSync} from "bip39";
import {fromSeed} from "bip32";
import {Modals} from "../../../main/common/util"
import bscript from "@bitcoin-dot-com/bitcoincashjs2-lib/src/script";

const Prefix = {
    "6d01": "SetName",
    "6d02": "PostMemo",
    "6d03": "ReplyMemo",
    "6d04": "LikeMemo",
    "6d05": "SetProfile",
    "6d06": "Follow",
    "6d07": "Unfollow",
    "6d0a": "SetPic",
    "6d0c": "ChatPost",
    "6d0d": "ChatFollow",
    "6d0e": "ChatUnfollow",
}
const setTx = async (outer_transaction, setModal) => {
    const wallet = await GetWallet()
    if (!wallet.seed && !(wallet.keys && wallet.keys.length)) {
        window.electron.showMessageDialog("Watch only wallet does not have private key and cannot sign.")
        return
    }
    let getKey
    if (wallet.seed && wallet.keys.length == 0) {
        const seed = mnemonicToSeedSync(wallet.seed)
        const node = fromSeed(seed)
        getKey = (address) => {
            for (let i = 0; i < wallet.addresses.length; i++) {
                if (address === wallet.addresses[i]) {
                    const child = node.derivePath("m/44'/0'/0'/0/" + i)
                    return ECPair.fromWIF(child.toWIF())
                }
            }
        }
    } else {
        getKey = (address) => {
            for (let i = 0; i < wallet.keys.length; i++) {
                const key = ECPair.fromWIF(wallet.keys[i])
                if (address === key.getAddress()) {
                    return key
                }
            }
        }
    }
    const tx = bitcoin.Transaction.fromBuffer(outer_transaction.outer_txInfo.raw)
    let txb
    let txBuild
    for (let lockTime = 5e8; lockTime < 5e8 + 2 ^ 12; lockTime++) {
        txb = bitcoin.TransactionBuilder.fromTransaction(tx)
        for (let i = 0; i < outer_transaction.outer_txInfo.inputs.length; i++) {
            const input = outer_transaction.outer_txInfo.inputs[i]
            const key = getKey(input.output.address)
            if (key === undefined) {
                console.log("Unable to find key for input address: " + input.output.address)
                return
            }
            txb.sign(i, key, undefined, bitcoin.Transaction.SIGHASH_ALL, input.output.value)
        }
        txBuild = txb.build()
        if (!outer_transaction.outer_beatHash.current) {
            break
        }
        const txHash = txBuild.getId()
        if (txHash < outer_transaction.outer_beatHash.current) {
            break
        }
        tx.locktime = lockTime
    }
    const buf = txBuild.toBuffer()
    outer_transaction.outer_txInfo.raw = buf
    const size = buf.length
    outer_transaction.outer_size = size
    outer_transaction.outer_transactionIDEleRef.value = txBuild.getId()
    const feeRate = outer_transaction.outer_fee / size
    outer_transaction.outer_feeRate = feeRate.toFixed((4))
    if (setModal) {
        setModal(Modals.None)
    }
}
const pushTx = async (outer_txInfo) => {
    const query = `
    mutation ($raw: String!) {
        broadcast(raw: $raw)
    }
    `
    await window.electron.graphQL(query, {raw: outer_txInfo.raw.toString("hex")})
    console.log("Broadcast successful")
}

const setAndPushTx = async (outer_transaction, setModal, onDone) => {
    await setTx(outer_transaction, setModal)
    await pushTx(outer_transaction.outer_txInfo)
    if (typeof onDone == "function") {
        onDone()
    }
}
const DirectTx = async (inputs, outputs, beatHash, setModal, onDone, requirePassword) => {
    let outer_transaction = {
        outer_size: 0,
        outer_txInfo: {
            inputs: [],
            outputs: []
        },
        outer_fee: 0,
        outer_transactionIDEleRef: {
            value: 0
        },
        outer_beatHash: {
            current: ""
        },
        outer_feeRate: 0
    }
    if (!requirePassword) {
        let wallet = await GetWallet()
        requirePassword = !wallet.settings.SkipPassword
    }

    if (inputs && inputs.length && outputs && outputs.length) {
        const inputStrings = inputs
        const outputStrings = outputs
        let tx = {
            inputs: [],
            outputs: [],
        }
        let txb = new bitcoin.TransactionBuilder()
        const wallet = await GetWallet()
        const isHighlight = (address) => {
            for (let i = 0; i < wallet.addresses.length; i++) {
                if (address === wallet.addresses[i]) {
                    return true
                }
            }
            return false
        }
        let fee = 0
        for (let i = 0; i < inputStrings.length; i++) {
            const [inputPrevHash, inputPrevIndex, inputValue, inputAddress] = inputStrings[i].split(":")
            const valueInt = parseInt(inputValue)
            const prevIndex = parseInt(inputPrevIndex)
            tx.inputs.push({
                prev_hash: inputPrevHash,
                prev_index: prevIndex,
                highlight: isHighlight(inputAddress),
                output: {
                    value: valueInt,
                    address: inputAddress,
                },
            })
            fee += valueInt
            const outputScript = bitcoin.address.toOutputScript(inputAddress)
            txb.addInput(Buffer.from(inputPrevHash, 'hex').reverse(), prevIndex,
                bitcoin.Transaction.DEFAULT_SEQUENCE, outputScript)
        }
        for (let i = 0; i < outputStrings.length; i++) {
            const [outputScript, outputValue] = outputStrings[i].split(":")
            const scriptBuffer = Buffer.from(outputScript, "hex")
            const valueInt = parseInt(outputValue)
            let outputAddress
            try {
                outputAddress = bitcoin.address.fromOutputScript(scriptBuffer)
            } catch (e) {
                let outputString = bscript.toASM(scriptBuffer)
                if (outputString.startsWith("OP_RETURN ")) {
                    const outputPrefix = outputString.split(" ")[1]
                    const prefixAction = Prefix[outputPrefix]
                    outputAddress = "OP_RETURN: " + prefixAction
                } else {
                    outputAddress = "unknown: nonstandard"
                }
            }
            tx.outputs.push({
                address: outputAddress,
                value: valueInt,
                highlight: isHighlight(outputAddress),
            })
            txb.addOutput(scriptBuffer, valueInt)
            fee -= valueInt
        }
        const txBuild = txb.__build(true)
        const buf = txBuild.toBuffer()
        tx.raw = buf
        outer_transaction.outer_size = buf.length
        outer_transaction.outer_txInfo = tx
        outer_transaction.outer_fee = fee
        outer_transaction.outer_transactionIDEleRef.value = txBuild.getId()
        outer_transaction.outer_beatHash.current = beatHash
        const storedPassword = await window.electron.getPassword()
        if (!storedPassword || !storedPassword.length || !requirePassword) {
            await setAndPushTx(outer_transaction, setModal, onDone)
        } else {
            setModal(Modals.Password, {
                onCorrectPassword: async () => {
                    await setAndPushTx(outer_transaction, setModal, onDone)
                }
            })
        }
    }
}
export {DirectTx, setTx, pushTx}