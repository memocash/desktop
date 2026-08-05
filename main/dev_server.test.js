const test = require("node:test");
const assert = require("node:assert");
const net = require("node:net");
const {EventEmitter, once} = require("node:events");
const {PassThrough} = require("node:stream");
const {Reachable, StartDevServer, WaitForReady} = require("./dev_server");

// The shape WaitForReady consumes: an exit/error emitter with piped output.
const FakeChild = () => Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
})

// Swallows the tee so test output stays the test runner's.
const Sink = () => ({write: () => {}})

const Listener = async () => {
    const server = net.createServer()
    server.listen(0, "localhost")
    await once(server, "listening")
    return server
}

test("readiness is the child's own ready line, even split across chunks", async () => {
    const child = FakeChild()
    const ready = WaitForReady(child, Sink())
    child.stdout.write("   ▲ Next.js 15.5.21\n")
    child.stdout.write(" ✓ Starting...\n")
    child.stderr.write(" ○ some warning\n")
    child.stdout.write(" ✓ Rea")
    child.stdout.write("dy in 765ms\n")
    await ready
})

test("a child that dies before readiness rejects - the EADDRINUSE path", async () => {
    const child = FakeChild()
    const ready = WaitForReady(child, Sink())
    child.stderr.write(" ⨯ Failed to start server\n")
    child.stderr.write("Error: listen EADDRINUSE: address already in use 127.0.0.1:8000\n")
    child.emit("exit", 1)
    await assert.rejects(ready, {message: "next dev exited with code 1"})
})

// The finding under test: a listener that wins the port must not read as
// readiness. Nothing but the child's own output can resolve the wait, so a
// competing server on the port leaves the promise pending until the child's
// own failure settles it.
test("a foreign listener on the port is not readiness", async () => {
    const server = await Listener()
    try {
        const child = FakeChild()
        const ready = WaitForReady(child, Sink())
        child.stdout.write(" ✓ Starting...\n")
        const settled = await Promise.race([
            ready.then(() => "ready"),
            new Promise((resolve) => setTimeout(() => resolve("pending"), 100)),
        ])
        assert.equal(settled, "pending")
        child.emit("exit", 1)
        await assert.rejects(ready, {message: "next dev exited with code 1"})
    } finally {
        server.close()
    }
})

test("Reachable sees a listener and its absence", async () => {
    const server = await Listener()
    const port = server.address().port
    assert.equal(await Reachable(port), true)
    server.close()
    await once(server, "close")
    assert.equal(await Reachable(port), false)
})

test("an occupied port is refused before anything spawns", async () => {
    const server = await Listener()
    try {
        await assert.rejects(
            StartDevServer("renderer", new EventEmitter(), server.address().port),
            {message: /something is already listening on localhost:/})
    } finally {
        server.close()
    }
})

// The regression under test: cleanup has to be installed the moment the child
// exists, not once it is ready. This spawns the real child, quits as soon as
// the quit hook is registered, and takes the rejection - which can only come
// from the child's own exit event - as proof the child died.
test("quitting while readiness is pending kills the child", async () => {
    const server = await Listener()
    const port = server.address().port
    server.close()
    await once(server, "close")
    const app = new EventEmitter()
    const pending = StartDevServer("renderer", app, port)
    while (!app.listenerCount("before-quit")) {
        await new Promise((resolve) => setTimeout(resolve, 5))
    }
    app.emit("before-quit")
    await assert.rejects(pending, {message: /next dev exited with/})
})
