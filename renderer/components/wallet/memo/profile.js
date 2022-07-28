import Modal from "../../modal/modal";
import seed from "../../modal/seed.module.css";

const Profile = ({onClose}) => {
    return (
        <Modal onClose={onClose}>
            <div className={seed.root}>
                Profile!
            </div>
        </Modal>
    )
}

export default Profile
