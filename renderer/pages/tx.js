import {useRouter} from "next/router";
import {useEffect, useState} from "react";

const Tx = () => {
    const router = useRouter()
    const [inputPayTo, setInputPayTo] = useState()
    const [inputMessage, setInputMessage] = useState()
    const [inputAmount, setInputAmount] = useState()

    useEffect(() => {
        console.log(router.query)
        if (!router || !router.query || !router.query.payTo || !router.query.amount) {
            return
        }
        const {payTo, message, amount} = router.query
        setInputPayTo(payTo)
        setInputMessage(message)
        setInputAmount(amount)
    }, [router])
    return (
        <div>
            <h1>TX PREVIEW</h1>
            <p>PayTo: {inputPayTo}</p>
            <p>Message: {inputMessage}</p>
            <p>Amount: {inputAmount}</p>
        </div>
    )
}

export default Tx
