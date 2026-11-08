import { next } from '@vercel/edge';
import { adultGate } from './backend/adult-access';
export const config = { runtime: 'nodejs' };
export default async function middleware(request:Request) {
  const response=await adultGate(request,{
    ADULT_SESSION_SECRET:process.env.ADULT_SESSION_SECRET,
    UPSTASH_REDIS_REST_URL:process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN:process.env.UPSTASH_REDIS_REST_TOKEN
  });
  return response??next();
}
