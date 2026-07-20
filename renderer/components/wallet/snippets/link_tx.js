import {opcodes, script} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import bitcoin from "../../util/bitcoin";
import GetWallet from "../../util/wallet";
import {CreateTransaction} from "./create_tx";

// Link scripts verified byte-for-byte against on-chain link txs (request
// 8553916d..., accept cb38deb2..., revoke 09cb74d4...): a request pushes the
// parent's pkhash, accept/revoke push the referenced tx hash in display
// order. The optional trailing message push is omitted. Accepts and revokes
// pass the wallet's side of the link as fromAddress - the protocol attributes
// them to the signing address, which must be the exact address the link names.

const SendLinkRequest = async ({parentAddress, setModal}) => {
    const requestOpReturnOutput = script.compile([
        opcodes.OP_RETURN,
        Buffer.from(bitcoin.Prefix.LinkRequest, "hex"),
        Buffer.from(bitcoin.GetPkHashFromAddress(parentAddress), "hex"),
    ])
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
