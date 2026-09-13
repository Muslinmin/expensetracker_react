const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// pdf.js's own build output (assets/vendor/*.rawjs) is injected into a WebView
// as raw text, never executed by Metro/Hermes — it must be treated as an
// opaque asset, not parsed as a source module.
config.resolver.assetExts.push('rawjs');

module.exports = config;
