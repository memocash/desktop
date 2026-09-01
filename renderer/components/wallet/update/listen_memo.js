// addresses widens the subscription beyond the wallet's own addresses (e.g.
// to include linked addresses); falls back to wallet.addresses when absent.
// Main stores each profile change before this hears of it, and sends it twice:
// once the rows are readable and again once the pic has been fetched.
const ListenNewMemos = ({wallet, addresses, setLastUpdate}) => {
    const handler = () => {
        setLastUpdate((new Date()).toISOString())
    }
    let exited = false
    const onclose = () => {
        if (exited) {
            return
        }
        setTimeout(() => {
            close = ListenNewMemos({wallet, addresses, setLastUpdate})
        }, 2000)
    }
    let close = window.electron.listenSync({
        kind: "profiles", variables: {addresses: addresses || wallet.addresses}, handler, onclose})
    return () => {
        exited = true
        close()
    }
}

export default ListenNewMemos
