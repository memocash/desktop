import {useEffect, useState} from "react";

const File = () => {

    const [contents, setContents] = useState("")

    useEffect(async () => {
        try {
            const returnValue = await window.electron.getFile()
            setContents(returnValue)
        } catch (error) {
            console.log("error reading file, ", error)
        }
    }, [])

    const handleClickOpen = () => {
        window.electron.openDialog()
    }

    window.electron.on("channel2", (e, result) => {
        
    })

    const handleClickCreate = async () => {
        try {
            await window.electron.createFile()
            const wallet = await window.electron.getFile()
            setContents(wallet)
            console.log("file created")
        } catch (error) {
            console.log("error creating file, ", error)
        }
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
                    <button onClick={handleClickOpen}>Open File</button>
                </p>
                <p>
                    <button onClick={handleClickCreate}>Create File</button>
                </p>
            </div>
        </div>
    )
}

export default File
