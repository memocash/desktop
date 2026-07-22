const TxQuery = `
    tx {
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
        }
        blocks {
            block {
                hash
                timestamp
                height
            }
        }
    }
    `
const TxTimeQuery = `
    tx {
        hash
        seen
        blocks {
            block {
                hash
                timestamp
                height
            }
        }
    }
    `
const ProfileFields = `
    name {
        name
        tx_hash
        ${TxTimeQuery}
    }
    profile {
        text
        tx_hash
        ${TxTimeQuery}
    }
    pic {
        pic
        tx_hash
        ${TxTimeQuery}
    }
    `
const LikesQuery = `
    likes {
        tx_hash
        tip
        lock {
            address
        }
        ${TxQuery}
    }
    `
const PostFields = `
    tx_hash
    text
    ${TxQuery}
    ${LikesQuery}
    lock {
        address
        profile {
            ${ProfileFields}
        }
    }
    `

export {
    PostFields,
    ProfileFields,
    LikesQuery,
    TxQuery,
    TxTimeQuery,
}
