const ListenNewTxs = ({wallet, setLastUpdate}) => {
    const query = `
        subscription($addresses: [Address!]) {
            addresses(addresses: $addresses) {
                hash
                seen
                raw
                inputs {
                    index
                    prev_hash
                    prev_index
                }
                outputs {
                    index
                    amount
                    script
                    lock {
                        address
                    }
                    slp {
                        amount
                        token_hash
                        genesis {
                            hash
                            token_type
                            decimals
                            ticker
                            name
                            doc_url
                        }
                    }
                    slp_baton {
                        token_hash
                        genesis {
                            hash
                            token_type
                            decimals
                            ticker
                            name
                            doc_url
                        }
                    }
                }
                blocks {
                    block {
                        hash
                        timestamp
                        height
                    }
                }
            }
        }
        `
    const handler = async (tx) => {
        await window.electron.saveTransactions([tx.addresses])
        await window.electron.generateHistory(wallet.addresses.concat(wallet.slpList || []))
        if (typeof setLastUpdate === "function") {
            setLastUpdate((new Date()).toISOString())
        }
    }
    let exited = false
    const onclose = () => {
        if (exited) {
            return
        }
        setTimeout(() => {
            close = ListenNewTxs({wallet, setLastUpdate})
        }, 2000)
    }
    let close = window.electron.listenGraphQL({
        query, variables: {addresses: wallet.addresses.concat(wallet.slpList || [])}, handler, onclose})
    return () => {
        exited = true
        close()
    }
}

export default ListenNewTxs
