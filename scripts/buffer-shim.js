// esbuild inject file: every free use of Buffer in the renderer bundles
// resolves to the browser polyfill package instead of the missing node global.
export {Buffer} from "buffer"
