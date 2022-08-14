import {LikesQuery, PostFields, TxQuery} from "../../util/graphql";

const UpdateChat = async ({roomName, setLastUpdate}) => {
    const query = `
    query ($room: String!) {
        room(name: $room) {
            posts {
                tx_hash
                text
                ${TxQuery}
                ${LikesQuery}
                replies {
                    ${PostFields}
                }
            }
        }
    }
    `
    let data = await window.electron.graphQL(query, {
        room: roomName,
    })
    //await window.electron.saveChatRoom(data.data.room)
    setLastUpdate((new Date()).toISOString())
}

export default UpdateChat
