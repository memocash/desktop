const ListenNewTxs = ({wallet, setLastUpdate}) => {
    const query = `
        subscription($address: String!) {
            address(address: $address) {
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
                    lock {
                        address
                    }
                }
                blocks {
                    hash
                    timestamp
                    height
                }
            }
        }
        `
    const handler = async (tx) => {
        await window.electron.saveTransactions([tx.address])
        await window.electron.generateHistory(wallet.addresses)
        if (typeof setLastUpdate === "function") {
            setLastUpdate((new Date()).toISOString())
        }
    }
    let exited = false
    const onclose = () => {
        if (exited) {
            return
        }
        console.log("GraphQL new tx listener subscribe close, reconnecting in 2 seconds!")
        setTimeout(() => {
            close = ListenNewTxs({wallet, setLastUpdate})
        }, 2000)
    }
    let close = window.electron.listenGraphQL({query, variables: {address: wallet.addresses[0]}, handler, onclose})
    return () => {
        exited = true
        close()
    }
}

export default ListenNewTxs
