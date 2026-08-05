// The renderer's single doorway to bitcoin primitives (audit D4). Script
// building, address codecs, and opcodes are internal modules over the
// vendored pushdata-bitcoin/bitcoincash-ops and bs58check, tested for parity
// in main/common/bitcoin. Key handling and transaction assembly still come
// from @bitcoin-dot-com/bitcoincashjs2-lib until the exit's final phase
// replaces them; components import from here either way, so that swap will
// also be confined to this file.
import bitcoin from "@bitcoin-dot-com/bitcoincashjs2-lib";
import addressModule from "../../../main/common/bitcoin/address";
import networksModule from "../../../main/common/bitcoin/networks";
import scriptModule from "../../../main/common/bitcoin/script";
import opcodesModule from "bitcoincash-ops";

export const address = addressModule
export const networks = networksModule
export const script = scriptModule
export const opcodes = opcodesModule
export const {ECPair, Transaction, TransactionBuilder} = bitcoin

export default {
    address: addressModule,
    networks: networksModule,
    script: scriptModule,
    opcodes: opcodesModule,
    ECPair: bitcoin.ECPair,
    Transaction: bitcoin.Transaction,
    TransactionBuilder: bitcoin.TransactionBuilder,
}
