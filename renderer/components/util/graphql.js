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
            hash
            timestamp
            height
        }
    }
    `
const ProfileFields = `
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
}
