import { Server } from 'node:http';
import { Socket } from 'node:net';

// This evidence is process-local and cannot be supplied by an HTTP header,
// URL, body, Origin, proxy or environment variable. Only dev.ts records it.
const localRequests = new WeakSet<Request>();
const loopback = (value: string | undefined) => value === '127.0.0.1' || value === '::1' || value === '::ffff:127.0.0.1';
const proxyHeaders = ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip', 'cf-connecting-ip', 'true-client-ip', 'x-original-host'];

/** Called only by the loopback development listener, with its actual Node
 * server and accepted socket. A localhost-looking Request alone is no proof.
 * Reject proxy metadata; never use it as evidence of the visitor's address.
 */
export function attestLocalDevelopmentRequest(request: Request, server: Server, socket: Socket): boolean {
  if (!(server instanceof Server) || !(socket instanceof Socket)) return false;
  const address = server.address();
  if (!server.listening || !address || typeof address === 'string' || !loopback(address.address)
    || !loopback(socket.remoteAddress) || !loopback(socket.localAddress)
    || socket.localPort !== address.port || proxyHeaders.some(name => request.headers.has(name))) return false;
  localRequests.add(request);
  return true;
}

export function isAttestedLocalDevelopmentRequest(request: Request): boolean {
  return localRequests.has(request);
}
