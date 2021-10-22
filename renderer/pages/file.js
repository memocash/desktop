import {useEffect, useState} from "react";

const File = () => {

    const [contents, setContents] = useState("")

    useEffect(() => {
        window.electron.getFile().then((con) => {
            setContents(con)
        })
    }, [])

    return (
        <div>
            <div>
                <a href="/">Home</a>
                <h1>File Contents</h1>
                <div>
                    {contents}
                </div>
            </div>
        </div>
    )
}

export default File
