import { defineConfig, type Plugin } from 'vite';

// The page talks to itself, the explorer (deal and buy-in transactions) and the table relay.
const RELAY = process.env.VITE_RELAY ?? 'wss://ghosttown-relay-production.up.railway.app';
const csp = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data:",
  `connect-src 'self' https://api.blockchair.com ${RELAY}`,
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

const cspPlugin = (): Plugin => ({
  name: 'csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<meta name="referrer"', `<meta http-equiv="Content-Security-Policy" content="${csp}" />\n    <meta name="referrer"`),
});

export default defineConfig({
  plugins: [cspPlugin()],
  define: { __RELAY__: JSON.stringify(RELAY) },
  // chit-zcash loads its .wasm relative to its own module; pre-bundling would break that URL.
  optimizeDeps: { exclude: ['chit-zcash'] },
  build: { target: 'es2022', assetsInlineLimit: 0 },
});
