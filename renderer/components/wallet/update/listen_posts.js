// Main stores each pushed post (a new like or reply on it) before this hears
// of it; the re-render and the reconnect loop are what's left here.
const ListenPosts = ({txHashes, setLastUpdate}) => {
    const handler = () => {
        setLastUpdate((new Date()).toISOString())
    }
    let exited = false
    const onclose = () => {
        if (exited) {
            return
        }
        setTimeout(() => {
            close = ListenPosts({txHashes, setLastUpdate})
        }, 2000)
    }
    let close = window.electron.listenSync({kind: "posts", variables: {txHashes}, handler, onclose})
    return () => {
        exited = true
        close()
    }
}

export default ListenPosts
