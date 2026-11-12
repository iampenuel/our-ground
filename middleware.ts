import {next} from '@vercel/edge';
import {adultGate} from './backend/adult-access.ts';
import {configuredHandoff, hasHandoffCookie} from './backend/adult-handoff.ts';
export const config={runtime:'nodejs'};
export default async function middleware(request:Request){
  const handoff = configuredHandoff(request, process.env);
  return await adultGate(request, process.env, handoff) ??
    next(handoff && hasHandoffCookie(request) ? {headers: {'Cache-Control': 'private, no-store'}} : undefined);
}
