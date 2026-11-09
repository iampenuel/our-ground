import { defineConfig, mergeConfig } from 'vite';
import { resolve } from 'node:path';
import {applicationConfig} from './vite.config.ts';
import { resourcePolicy } from './shared/security-headers.ts';
// WebAssembly is allowed only on the isolated local character studio document.
// No application/production CSP, map, account, or server route is changed.
export default defineConfig(context => {
  const configure = (server: any) => { server.middlewares.use((request: any, response: any, next: () => void) => {
    if ((request.url ?? '').split('?')[0] === '/eden-preview.html') {
      const original = response.writeHead;
      response.writeHead = function (...args: any[]) {
        response.setHeader('Content-Security-Policy', resourcePolicy(undefined, context.command === 'serve' && !context.isPreview).replace("script-src 'self';", "script-src 'self' 'wasm-unsafe-eval';"));
        return original.apply(response, args);
      };
    }
    next();
  }); };
  return mergeConfig(applicationConfig(context,false), {
    plugins: [{ name: 'eden-local-preview-wasm', configureServer: configure, configurePreviewServer: configure }],
    build: { outDir: 'dist-eden', rollupOptions: { input: resolve('eden-preview.html') } },
  });
});
