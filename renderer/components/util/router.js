import {ParseQuery, RouteTarget} from "./router_core"

// Stand-ins for the next/router and next/link surface the pages used, built
// on the platform directly: each window is its own document, loaded once with
// its parameters in the query string, so the router can be a constant - which
// also keeps it stable for the effects that list it as a dependency.
const router = {
    query: ParseQuery(window.location.search),
    push: (route) => {
        window.location.href = RouteTarget(route)
    },
}

export const useRouter = () => router

// Every Link in the app prevents its default and hands the click to main, so
// a plain anchor carries the href for hover/copy and nothing more.
export const Link = ({children, ...rest}) => <a {...rest}>{children}</a>
