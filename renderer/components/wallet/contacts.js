import {useEffect, useState} from "react";
import GetWallet from "../util/wallet";

const Contacts = ({lastUpdate}) => {
    const [profileInfo, setProfileInfo] = useState({
        mame: "memo",
        profile: "Verification: https://twitter.com/memobch/status/992033652765700097",
    })
    useEffect(async () => {
        const wallet = await GetWallet()
        const profileInfo = await window.electron.getProfileInfo(wallet.addresses)
        if (profileInfo !== undefined) {
            console.log(profileInfo)
            setProfileInfo(profileInfo)
        }
    }, [lastUpdate])
    return (
        <div>
            <p>
                Name: <b>{profileInfo.name}</b>
            </p>
            <p>
                Profile: <b>{profileInfo.profile}</b>
            </p>
        </div>
    )
}

export default Contacts
