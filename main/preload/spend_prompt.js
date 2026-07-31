const {ipcRenderer} = require("electron");
const {Handlers, Listeners} = require("../common/util/handlers");

// The window main opens to authorise a spend: where the transaction pays, and
// the password, together. It is driven entirely from here rather than from a
// script on the page, so the page can keep script-src 'none' - there is nothing
// running in it to read the password box or redraw what is being approved.
//
// The password goes straight from this input to main. It is never handed to the
// wallet page, which is the whole reason this window exists: that page builds
// the transaction, so it is the one thing that must not be trusted with the
// means to sign a different one.
//
// The destinations shown first are read from the wallet's public address lists,
// which is all main can do before it has the password. Once it has one, it reads
// them again from the keys, and if that disagrees this window says so and asks
// again - see main/app/spend_match.js.

const el = (id) => document.getElementById(id)
const show = (node, visible) => node.classList.toggle("hidden", !visible)
const satoshis = (value) => Number(value).toLocaleString("en-US") + " satoshis"

const reply = (message) => ipcRenderer.send(Handlers.SpendPromptReply, message)

// A token amount and a mint baton both move value the satoshis say nothing
// about, so they are named ahead of the dust that carries them.
const carried = ({value, tokenAmount, baton}) => {
    const parts = []
    if (tokenAmount) {
        parts.push(tokenAmount + " tokens")
    }
    if (baton) {
        parts.push("the mint baton, the authority to mint more of this token")
    }
    parts.push(satoshis(value))
    return parts.join(" plus ")
}

window.addEventListener("DOMContentLoaded", () => {
    const password = el("password")
    const wrong = el("wrong")
    const passwordStep = el("password-step")
    const ok = el("ok")
    let asking = "password"

    const submit = () => {
        if (asking === "confirm") {
            reply({confirmed: true})
            return
        }
        // An empty box is not an answer: leave the window as it is rather than
        // spending a wrong-password attempt on it.
        if (password.value.length) {
            reply({password: password.value})
            password.value = ""
            ok.disabled = true
        }
    }
    ok.addEventListener("click", submit)
    el("cancel").addEventListener("click", () => reply({cancelled: true}))
    password.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            submit()
        }
    })
    password.addEventListener("input", () => show(wrong, false))

    ipcRenderer.on(Listeners.SpendPromptStep, (e, step) => {
        asking = step.name
        ok.disabled = false
        const confirming = step.name === "confirm"
        show(el("mismatch"), confirming)
        show(passwordStep, !confirming)
        show(wrong, !confirming && step.wrong === true)
        const total = step.payments.reduce((sum, {value}) => sum + value, 0)
        const tokens = step.payments.some(({tokenAmount, baton}) => tokenAmount || baton)
        el("heading").textContent = confirming ? "This pays somewhere else" :
            (step.payments.length ? "Send out of this wallet?" : "Sign this transaction?")
        el("summary").textContent = !step.payments.length ?
            "Nothing leaves this wallet except the network fee." :
            (tokens ? "This pays tokens and " : "This pays ") + satoshis(total) + " to " +
            (step.payments.length === 1 ? "one destination:" : step.payments.length + " destinations:")
        show(el("payments"), step.payments.length > 0)
        el("payments").replaceChildren(...step.payments.map((payment) => {
            const row = document.createElement("div")
            row.className = "payment"
            const amount = document.createElement("div")
            amount.className = "amount"
            amount.textContent = carried(payment)
            const address = document.createElement("div")
            address.className = "address"
            address.textContent = payment.address || "an unrecognized script"
            row.append(amount, address)
            return row
        }))
        el("fee").textContent = "Network fee: " + satoshis(step.fee)
        ok.textContent = confirming ? "Send anyway" : (step.payments.length ? "Send" : "Sign")
        if (!confirming) {
            password.focus()
        }
    })
    reply({ready: true})
})
