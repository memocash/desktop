import {useEffect, useState} from "react";

const File = () => {

    const [contents, setContents] = useState("")

    useEffect(() => {
        window.electron.getFile().then((con) => {
            setContents(con)
        })
    }, [])

    const buttonOnClick = (e) => {
        window.electron.openDialog()
    }

    return (
        <div>
            <div>
                <a href="/">Home</a>
                <h1>File Contents</h1>
                <div>
                    {contents}
                </div>
                <p>
                    <button onClick={buttonOnClick}>Open File</button>
                </p>
            </div>
        </div>
    )
}

export default File
