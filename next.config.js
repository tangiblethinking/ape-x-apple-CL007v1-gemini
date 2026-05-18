/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        buffer: require.resolve('buffer/'),
      };
    }
    if (isServer) {
      // Do not bundle pdfjs-dist — let Node.js require() it at runtime
      // This preserves the relative './pdf.worker.js' path resolution
      const existingExternals = config.externals || [];
      config.externals = [
        ...(Array.isArray(existingExternals) ? existingExternals : [existingExternals]),
        ({ request }, callback) => {
          if (request && request.startsWith('pdfjs-dist')) {
            return callback(null, 'commonjs ' + request);
          }
          callback();
        },
      ];
    }
    return config;
  },
};

module.exports = nextConfig;
