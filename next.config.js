module.exports = {
    reactStrictMode: true,
    webpack: function (config, options) {
        config.experiments = {asyncWebAssembly: true};
        return config;
    }
}
