import {opcodes, script} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import bitcoin from "../../util/bitcoin";
import GetWallet from "../../util/wallet";
import {CreateTransaction} from "./create_tx";

// Link scripts verified byte-for-byte against on-chain link txs (request
// 8553916d..., accept cb38deb2..., revoke 09cb74d4...): a request pushes the
// parent's pkhash, accept/revoke push the referenced tx hash in display
// order. A request can include an optional trailing UTF-8 message push.
// Accepts and revokes pass the wallet's side of the link as fromAddress - the protocol attributes
// them to the signing address, which must be the exact address the link names.

const MaxLinkMessageBytes = bitcoin.Fee.MaxOpReturn - 21

const SendLinkRequest = async ({parentAddress, message = "", setModal}) => {
    const chunks = [
        opcodes.OP_RETURN,
        Buffer.from(bitcoin.Prefix.LinkRequest, "hex"),
        Buffer.from(bitcoin.GetPkHashFromAddress(parentAddress), "hex"),
    ]
    if (message.length) {
        chunks.push(Buffer.from(message))
    }
    const requestOpReturnOutput = script.compile(chunks)
    if (requestOpReturnOutput.length > bitcoin.Fee.MaxOpReturn + 6) {
        await window.electron.showMessageDialog(
            "Link message is too long (max: " + MaxLinkMessageBytes + " bytes)")
        return
    }
    const wallet = await GetWallet()
    await CreateTransaction(wallet, [{script: requestOpReturnOutput}], setModal)
}

const SendLinkAccept = async ({requestTxHash, walletAddress, setModal}) => {
    const acceptOpReturnOutput = script.compile([
        opcodes.OP_RETURN,
        Buffer.from(bitcoin.Prefix.LinkAccept, "hex"),
        Buffer.from(requestTxHash, "hex"),
    ])
    const wallet = await GetWallet()
    await CreateTransaction(wallet, [{script: acceptOpReturnOutput}], setModal, null, "", false, walletAddress)
}

const SendLinkRevoke = async ({acceptTxHash, walletAddress, setModal}) => {
    const revokeOpReturnOutput = script.compile([
        opcodes.OP_RETURN,
        Buffer.from(bitcoin.Prefix.LinkRevoke, "hex"),
        Buffer.from(acceptTxHash, "hex"),
    ])
    const wallet = await GetWallet()
    await CreateTransaction(wallet, [{script: revokeOpReturnOutput}], setModal, null, "", false, walletAddress)
}

export {
    SendLinkRequest,
    SendLinkAccept,
    SendLinkRevoke,
}
