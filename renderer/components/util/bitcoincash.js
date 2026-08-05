// The renderer's single doorway to @bitcoin-dot-com/bitcoincashjs2-lib, a
// library unmaintained since 2019 that is slated for replacement (audit D4).
// Every component imports these pieces from here rather than from the lib, so
// each capability - script building, address codecs, key handling, transaction
// assembly - can be swapped for a maintained implementation by changing this
// one file.
import bitcoin from "@bitcoin-dot-com/bitcoincashjs2-lib";

export const {address, script, opcodes, ECPair, Transaction, TransactionBuilder, networks} = bitcoin

export default bitcoin
