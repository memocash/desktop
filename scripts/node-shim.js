// Just enough of node's os/path for main/common/util's barrel to load inside
// the renderer bundle: dir.js computes wallet paths with homedir() and
// path.sep at module load, but no renderer code ever reads them - the
// renderer touches files only through main.
module.exports = {
    homedir: () => "",
    sep: "/",
}
