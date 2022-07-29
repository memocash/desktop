import Modal from "../../modal/modal";
import seed from "../../modal/seed.module.css";
import {useEffect, useState} from "react";
import profile from "../../../styles/profile.module.css";
import {opcodes, script} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import bitcoin from "../../util/bitcoin";
import GetWallet from "../../util/wallet";
import {CreateTransaction} from "../snippets/create_tx";
import {Modals} from "./index";

const Profile = ({onClose, address, utxosRef, lastUpdate, setModal}) => {
    const [profileInfo, setProfileInfo] = useState({
        name: "",
        profile: "",
        pic: "",
    })
    const [isFollowing, setIsFollowing] = useState(false)
    const [picData, setPicData] = useState(undefined)
    const [isSelf, setIsSelf] = useState(true)
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
        const wallet = await GetWallet()
        setIsSelf(false)
        for (const walletAddress of wallet.addresses) {
            if (walletAddress === address) {
                setIsSelf(true)
                break
            }
        }
        const recentFollow = await window.electron.getRecentFollow(wallet.addresses, address)
        setIsFollowing(recentFollow !== undefined && !recentFollow.unfollow)
    }, [address, lastUpdate])
    const clickFollow = async (address, unfollow) => {
        const followOpReturnOutput = script.compile([
            opcodes.OP_RETURN,
            Buffer.from(unfollow ? bitcoin.Prefix.Unfollow : bitcoin.Prefix.Follow, "hex"),
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
                        {!isSelf && <button onClick={() => clickFollow(address, isFollowing)}>
                        {isFollowing ? "Unfollow" : "Follow"}</button>}
                        <button onClick={() => setModal(Modals.Following)}>Following</button>
                        <button onClick={() => setModal(Modals.Followers)}>Followers</button>
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
