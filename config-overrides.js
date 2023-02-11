const webpack = require('webpack');
const {resolve} = require('path');

process.env.SASS_PATH =
  resolve(__dirname, './src') + ':' + resolve(__dirname, './node_modules');

module.exports = function override(config, env) {
  config.resolve.fallback = {
    url: false,
    fs: false,
    child_process: false,
    net: false,
    dns: false,
    zlib: false,
    tls: false,
    module: false,
    timers: false,
    dgram: false,
    http2: false,
    assert: require.resolve('assert'),
    crypto: require.resolve('crypto-browserify'),
    http: require.resolve('stream-http'),
    https: require.resolve('https-browserify'),
    os: require.resolve('os-browserify/browser'),
    buffer: require.resolve('buffer'),
    stream: require.resolve('stream-browserify'),
    path: require.resolve('path-browserify'),
  };
  config.plugins.push(
    new webpack.ProvidePlugin({
      process: 'process/browser.js',
      Buffer: ['buffer', 'Buffer'],
    }),
    new webpack.NormalModuleReplacementPlugin(/node:/, resource => {
      const mod = resource.request.replace(/^node:/, '');

      switch (mod) {
        case 'path':
          resource.request = 'path-browserify';
          break;
        case 'url':
          resource.request = 'url';
          break;
        default:
          throw new Error(`Not found ${mod}`);
      }
    })
  );

  config.experiments = {
    topLevelAwait: true,
  };

  return config;
};
