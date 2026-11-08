import {next} from '@vercel/edge';
import {adultGate} from './backend/adult-access.ts';
export const config={runtime:'nodejs'};
export default async function middleware(request:Request){
  return await adultGate(request,{ADULT_SESSION_SECRET:process.env.ADULT_SESSION_SECRET})??next();
}
