import Modal from "../../modal/modal";
import seed from "../../modal/seed.module.css";
import {useEffect, useState} from "react";
import profile from "../../../styles/profile.module.css";
import {opcodes, script} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import bitcoin from "../../util/bitcoin";
import GetWallet from "../../util/wallet";
import {CreateTransaction} from "../snippets/create_tx";

const Profile = ({onClose, address, utxosRef}) => {
    const [profileInfo, setProfileInfo] = useState({
        name: "",
        profile: "",
        pic: "",
    })
    const [picData, setPicData] = useState(undefined)
    useEffect(async () => {
        const profileInfo = await window.electron.getProfileInfo([address])
        if (profileInfo === undefined) {
            return
        }
        setProfileInfo(profileInfo)
        if (profileInfo.pic !== undefined) {
            const picData = await window.electron.getPic(profileInfo.pic)
            setPicData(picData)
        }
    }, [address])
    const clickFollow = async (address) => {
        const followOpReturnOutput = script.compile([
            opcodes.OP_RETURN,
            Buffer.from(bitcoin.Prefix.Follow, "hex"),
            Buffer.from(bitcoin.GetPkHashFromAddress(address), "hex"),
        ])
        const wallet = await GetWallet()
        const recentFollow = await window.electron.getRecentFollow(wallet.addresses, address)
        let beatHash
        if (recentFollow && !recentFollow.block_hash) {
            beatHash = recentFollow.tx_hash
        }
        await CreateTransaction(wallet, utxosRef.current.value, followOpReturnOutput, 0, beatHash)
    }
    return (
        <Modal onClose={onClose}>
            <div className={profile.header_modal}>
                <div className={profile.pic}>
                    {picData ?
                        <img alt={"Profile image"} className={profile.img}
                             src={`data:image/png;base64,${Buffer.from(picData).toString("base64")}`}/>
                        : <img alt={"Profile image"} className={profile.img}
                               src={"/default-profile.jpg"}/>}
                </div>
                <div className={profile.info}>
                    <h2>{profileInfo.name ? profileInfo.name : "Name not set"}</h2>
                    <p>{profileInfo.profile ? profileInfo.profile : "Profile not set"}</p>
                    <p>Address: {address}</p>
                    <p>
                        <button onClick={() => clickFollow(address)}>Follow</button>
                    </p>
                </div>
            </div>
            <div className={seed.buttons}>
                <button onClick={onClose}>Close</button>
            </div>
        </Modal>
    )
}

export default Profile
