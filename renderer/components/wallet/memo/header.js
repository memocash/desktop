import profile from "../../../styles/profile.module.css";
import {BsPencil} from "react-icons/bs";

const Header = ({}) => {
    return (
        <div className={profile.header}>
            <div className={profile.pic} onClick={clickEditPic}>
                {picData ?
                    <img alt={"Profile image"} className={profile.img}
                         src={`data:image/png;base64,${Buffer.from(picData).toString("base64")}`}/>
                    : <img alt={"Profile image"} className={profile.img}
                           src={"/default-profile.jpg"}/>}
                <a className={profile.editLink}><BsPencil/></a>
            </div>
            <div>
                <h2 onClick={clickEditName}>
                    {profileInfo.name ? profileInfo.name : "Name not set"}
                    <a className={profile.editLink}><BsPencil/></a>
                </h2>
                <p onClick={clickEditProfile}>
                    {profileInfo.profile ? profileInfo.profile : "Profile not set"}
                    <a className={profile.editLink}><BsPencil/></a>
                </p>
            </div>
        </div>
    )
}

export default Header
