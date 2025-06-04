import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // Enable more comprehensive polyfills
      protocolImports: true,
      globals: {
        Buffer: true,
        process: true,
      },
    }),
  ],
  base: "/metri-inviter-team/",
  define: {
    // Don't set process.env to an empty object
    global: "globalThis",
  },
  resolve: {
    alias: {
      process: "process/browser",
      stream: "stream-browserify",
      zlib: "browserify-zlib",
      util: "util",
    },
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});
