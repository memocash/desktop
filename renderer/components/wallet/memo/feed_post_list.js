import profile from "../../../styles/profile.module.css";
import {useEffect, useRef, useState} from "react";
import GetWallet from "../../util/wallet";
import Post from "./post";
import {BackfillPosts, SyncProfileLinks, UpdateMemoHistory} from "../update/index";
import {Loading} from "../../util/loading";
import {EmptyState} from "../../util/empty";
import {useScopeActivity} from "../../util/activity";
import {Tabs} from "../../../../main/common/util";
import {BsExclamationTriangle, BsFiles} from "../../util/icons";

const addressKeyOf = (addresses) => [...(addresses || [])].sort().join("\0")

// onEmptyState reports whether the feed came out empty - true, false, or null
// while that has no answer - for callers that pick a view from it (the Memo tab
// starts an empty feed on Popular instead). Resolving the feed takes three
// passes: read the follows, sync their posts, read the posts back. `loading`
// only covers the middle one, so an answer taken between passes is the previous
// feed's answer - which on a fresh import is "empty" right up until the follows
// finish downloading. So the passes are counted instead: starting one clears the
// answer, and only the post read publishes a new one, only once nothing else is
// still in flight.
const FeedPostList = ({setModal, setChatRoom, lastUpdate, addresses, onEmptyState}) => {
    const [posts, setPosts] = useState([])
    const [feedUpdate, setFeedUpdate] = useState("")
    const [loading, setLoading] = useState(true)
    const [failed, setFailed] = useState(false)
    // The wallet sync downloads the follows this feed is built from, so it has
    // work in flight here before this component's own passes start.
    const activity = useScopeActivity(Tabs.Memo)
    const [feed, setFeed] = useState({followedAddresses: [], postAddresses: [], userAddresses: []})
    const addressKey = addressKeyOf(addresses)
    const followedAddressKey = addressKeyOf(feed.followedAddresses)
    const postAddressKey = addressKeyOf(feed.postAddresses)
    const userAddressKey = addressKeyOf(feed.userAddresses)
    const pendingRef = useRef(0)
    // Read at call time rather than closed over, so a pass that started before
    // the latest render still reports against current values.
    const emptyStateRef = useRef(onEmptyState)
    const failedRef = useRef(failed)
    emptyStateRef.current = onEmptyState
    failedRef.current = failed
    // Bumped by whichever pass turns the lights off, so the post read below
    // always gets the last word - without it a pass that ends after that read
    // leaves the answer unpublished.
    const [settleTick, setSettleTick] = useState(0)
    const mountedRef = useRef(true)
    const publish = (empty) => emptyStateRef.current && emptyStateRef.current(empty)
    const trackPass = async (pass) => {
        pendingRef.current++
        publish(null)
        try {
            await pass()
        } finally {
            pendingRef.current--
            // Whichever pass drains last schedules the read, current or not. A
            // superseded pass writes nothing itself - it returns early on its
            // stale `active` flag - but it still has to hand off, because the
            // pass that replaced it was suppressed by this very count and won't
            // come back on its own. Only being unmounted ends that duty.
            if (!pendingRef.current && mountedRef.current) {
                setSettleTick(tick => tick + 1)
            }
        }
    }

    useEffect(() => {
        mountedRef.current = true
        return () => { mountedRef.current = false }
    }, [])

    useEffect(() => {
        let active = true
        const refreshFollowing = async () => {
            if (!addresses || !addresses.length) {
                setFeed(current =>
                    addressKeyOf(current.followedAddresses) === "" &&
                    addressKeyOf(current.postAddresses) === "" &&
                    addressKeyOf(current.userAddresses) === ""
                        ? current
                        : {followedAddresses: [], postAddresses: [], userAddresses: []})
                setPosts(current => current.length ? [] : current)
                setFailed(false)
                setLoading(false)
                return
            }
            try {
                const wallet = await GetWallet()
                const following = await window.electron.getFollowing(addresses, {limit: null})
                const followedAddresses = [...new Set(following.map(follow => follow.follow_address))]
                if (!active) {
                    return
                }
                const nextFollowedAddressKey = addressKeyOf(followedAddresses)
                const nextUserAddressKey = addressKeyOf(wallet.addresses)
                setFeed(current =>
                    addressKeyOf(current.followedAddresses) === nextFollowedAddressKey &&
                    addressKeyOf(current.userAddresses) === nextUserAddressKey
                        ? current
                        : {followedAddresses, postAddresses: followedAddresses,
                            userAddresses: wallet.addresses})
                if (!followedAddresses.length) {
                    setFailed(false)
                    setLoading(false)
                }
            } catch (e) {
                console.log("FeedPostList: following read failed", e)
                if (active) {
                    setFailed(true)
                    setLoading(false)
                }
            }
        }
        trackPass(refreshFollowing).catch(e => console.log("FeedPostList: following refresh failed", e))
        return () => { active = false }
    }, [addressKey, lastUpdate])

    useEffect(() => {
        let active = true
        const syncFeed = async () => {
            if (!feed.followedAddresses.length) {
                return
            }
            setLoading(true)
            setFailed(false)
            const notifyUpdate = value => {
                if (active) {
                    setFeedUpdate(value)
                }
            }
            let postAddresses = feed.followedAddresses
            try {
                postAddresses = await SyncProfileLinks({addresses: feed.followedAddresses})
                if (active) {
                    setFeed(current => ({...current, postAddresses}))
                }
            } catch (e) {
                console.log("FeedPostList: link expansion failed, using followed addresses", e)
            }
            if (!active) {
                return
            }
            try {
                await UpdateMemoHistory({addresses: postAddresses, setLastUpdate: notifyUpdate})
                await BackfillPosts({addresses: postAddresses,
                    userAddresses: feed.userAddresses, setLastUpdate: notifyUpdate})
            } catch (e) {
                console.log("FeedPostList: feed sync failed", e)
                if (active) {
                    setFailed(true)
                }
            } finally {
                if (active) {
                    setLoading(false)
                }
            }
        }
        trackPass(syncFeed).catch(e => console.log("FeedPostList: feed sync pass failed", e))
        return () => { active = false }
    }, [followedAddressKey, userAddressKey])

    useEffect(() => {
        let active = true
        const loadPosts = async () => {
            const nextPosts = feed.postAddresses.length ? await window.electron.getPosts({
                addresses: feed.postAddresses,
                userAddresses: feed.userAddresses,
            }) : []
            if (!active) {
                return
            }
            setPosts(nextPosts)
            // No addresses yet is not an empty feed, it's a feed that hasn't
            // been asked about, and a failed sync leaves saved posts that may
            // not be the whole story - neither is an answer.
            if (!pendingRef.current && addresses && addresses.length) {
                publish(failedRef.current ? null : !nextPosts.length)
            }
        }
        loadPosts().catch(e => {
            console.log("FeedPostList: saved post read failed", e)
            // Same rule as the success path: a read that's been superseded says
            // nothing, or a late rejection would wipe the answer that replaced
            // it.
            if (active) {
                publish(null)
            }
        })
        return () => { active = false }
    }, [addressKey, postAddressKey, userAddressKey, lastUpdate, feedUpdate, settleTick])

    // `loading` covers this component's own sync pass, which is only reached
    // once there are follows to sync. Before that - no addresses resolved yet,
    // or the wallet sync still downloading the follows themselves - an empty
    // feed is a feed that hasn't been loaded, not one with nothing in it, and
    // it said so as fact. The same three states the empty answer is withheld
    // for above are the ones the screen has to keep quiet about.
    const waiting = loading || !addresses || !addresses.length || activity.busy

    return (
        <div className={profile.post_list}>
            {posts.map(post =>
                <Post key={post.tx_hash} post={post} setModal={setModal} setChatRoom={setChatRoom} isFeedRow/>
            )}
            {waiting && !posts.length && <Loading>Loading the latest posts...</Loading>}
            {!waiting && failed && posts.length > 0 && <div className={profile.noPosts}>
                Could not refresh feed, showing saved posts
            </div>}
            {!waiting && !posts.length && (failed ?
                <EmptyState icon={<BsExclamationTriangle/>} title={"Could not load your feed"}>
                    Check the connection indicator below and try again.
                </EmptyState> :
                <EmptyState icon={<BsFiles/>} title={"Your feed is empty"}>
                    Posts from people you follow land here. Follow someone from the Global feed to get started.
                </EmptyState>)}
        </div>
    )
}

export default FeedPostList
