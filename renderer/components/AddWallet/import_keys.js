import {useRef} from "react"


const ImportKeys = ({onSetKeys, onBack}) => {
    const privateKeyList = useRef()

    const handleClickNext = () => {
        onSetKeys(privateKeyList.current.value)
    }

    return (
        <div>
            <h2>Import Bitcoin Keys</h2>
            <div>
                <div>Enter a list of Bitcoin private keys.</div>
                <textarea ref={privateKeyList}/>
                <p>
                    <button onClick={handleClickNext}>Next</button>
                </p>
                <p>
                    <button onClick={onBack}>Back</button>
                </p>
            </div>
        </div>
    )
}

export default ImportKeys
