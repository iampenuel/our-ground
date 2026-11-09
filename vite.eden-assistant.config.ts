import { defineConfig, mergeConfig } from 'vite';
import { resolve } from 'node:path';
import {applicationConfig} from './vite.config.ts';
import { edenLocalReviewHeaders } from './shared/security-headers.ts';
import {edenPublicPagePolicy} from './src/eden/public-page-policy.ts';

type ReviewContext = { command: string; mode: string; isPreview?: boolean };
/** This development-only exception does not alter hosted/build/preview policy. */
export function isEdenReviewPreviewRequest(context: ReviewContext, requestUrl: string, host: string | undefined): boolean {
  if (context.command !== 'serve' || context.isPreview || context.mode !== 'eden-review'
    || !edenPublicPagePolicy(requestUrl.split('?')[0]).assistant || !host) return false;
  try {
    const origin = new URL('http://' + host);
    return ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)
      && !origin.username && !origin.password && origin.host === host && origin.pathname === '/' && !origin.search && !origin.hash;
  } catch { return false; }
}
export default defineConfig(context => {
  const configure = (server: any) => {
    server.middlewares.use((request: any, response: any, next: () => void) => {
      if (isEdenReviewPreviewRequest(context, request.url ?? '/', request.headers.host)) {
        const original = response.writeHead;
        response.writeHead = function (...args: any[]) {
          for(const[name,value]of Object.entries(edenLocalReviewHeaders()))response.setHeader(name,value);
          return original.apply(response, args);
        };
      }
      next();
    });
  };
  return mergeConfig(applicationConfig(context,false), {
    plugins: [{ name: 'eden-local-agent-review', configureServer: configure }],
    build: { outDir: 'dist-eden-assistant', rollupOptions: { input: resolve('eden-assistant.html') } },
  });
});
