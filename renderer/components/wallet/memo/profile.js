import Modal from "../../modal/modal";
import seed from "../../modal/seed.module.css";

const Profile = ({onClose, address}) => {
    return (
        <Modal onClose={onClose}>
            <div className={seed.root}>
                Profile!
                <p>
                    Address: {address}
                </p>
            </div>
        </Modal>
    )
}

export default Profile
