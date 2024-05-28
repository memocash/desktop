const ListenNewMemos = ({wallet, setLastUpdate}) => {
    const query = `
        subscription($addresses: [Address!]) {
            profiles(addresses: $addresses) {
                lock {
                    address
                }
                name {
                    name
                    tx_hash
                }
                profile {
                    text
                    tx_hash
                }
                pic {
                    pic
                    tx_hash
                }
                following {
                    tx_hash
                    unfollow
                    follow_lock {
                        address
                        profile {
                            name {
                                name
                                tx_hash
                            }
                            pic {
                                pic
                                tx_hash
                            }
                        }
                    }
                }
                followers {
                    tx_hash
                    unfollow
                    lock {
                        address
                        profile {
                            name {
                                name
                                tx_hash
                            }
                            pic {
                                pic
                                tx_hash
                            }
                        }
                    }
                }
            }
        }
        `
    const handler = async (profile) => {
        await window.electron.saveMemoProfiles([profile.profiles])
        setLastUpdate((new Date()).toISOString())
        await window.electron.saveMemoProfileImages([profile.profiles])
        setLastUpdate((new Date()).toISOString())
    }
    let exited = false
    const onclose = () => {
        if (exited) {
            return
        }
        setTimeout(() => {
            close = ListenNewMemos({wallet, setLastUpdate})
        }, 2000)
    }
    let close = window.electron.listenGraphQL({query, variables: {addresses: wallet.addresses}, handler, onclose})
    return () => {
        exited = true
        close()
    }
}

export default ListenNewMemos
