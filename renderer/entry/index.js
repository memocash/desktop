import {createRoot} from "react-dom/client"
import "../public/style.css"
import Page from "../pages/index"

// Each window has an entry of its own: the page module, the global stylesheet,
// and a mount. What _app.js did under Next - the title and the CSP meta tag -
// lives in the html shells scripts/build-renderer.js writes.
createRoot(document.getElementById("root")).render(<Page/>)
