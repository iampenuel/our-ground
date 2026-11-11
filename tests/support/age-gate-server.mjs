import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { adultGate } from '../../backend/adult-access.ts';
import { previewPhotos } from '../../backend/age-page.ts';

const photos = new Map(Object.values(previewPhotos).map(path => [path, new URL('../../public' + path, import.meta.url)]));

// Tests and the presenter use this adapter outside the deployed application.
export async function startAgeGateServer({ app, onRequest, signInOnly = false }) {
  const config = {
    ADULT_SESSION_SECRET: randomBytes(32).toString('base64url'),
    ...(signInOnly ? {
      VERCEL_ENV: 'production', VERCEL_PROJECT_ID: 'prj_4li6QnqulPgPbJpxMW2L9hczDNrS',
      ACCOUNT_RELEASE_MODE: 'signin_only',
    } : {}),
  };
  let origin, host;
  const server = createServer({ requestTimeout: 10000 }, async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url, origin);
      if (incoming.headers.host !== host || url.origin !== origin || !incoming.url?.startsWith('/')) {
        outgoing.writeHead(403).end();
        return;
      }
      onRequest?.(incoming);
      const method = incoming.method;
      const request = new Request(url, {
        method, headers: incoming.headers,
        ...(method === 'GET' || method === 'HEAD' ? {} : { body: Readable.toWeb(incoming), duplex: 'half' }),
      });
      let response = await adultGate(request, config);
      if (!response) {
        const photo = photos.get(url.pathname);
        response = photo
          ? new Response(await readFile(photo), { headers: { 'Content-Type': 'image/webp' } })
          : await app(request);
      }
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
    } catch {
      if (outgoing.headersSent) outgoing.destroy();
      else outgoing.writeHead(500, { 'Cache-Control': 'no-store' }).end('Local age-gate server error');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  host = '127.0.0.1:' + server.address().port;
  origin = 'http://' + host;
  return {
    origin,
    close() {
      return new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
    },
  };
}
