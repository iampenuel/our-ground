import { runtimeDatabaseConfiguration } from './database-security.ts';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { UnavailableError } from './errors.ts';

type Query = (text: string, args?: unknown[]) => Promise<Array<Record<string, unknown>>>;
export class OrganizationStoreError extends Error {
  status: number;
  code: string;
  retryAfter?:number;
  constructor(status: number, code: string, message: string) { super(message); this.status=status; this.code=code; if(code==='RATE_LIMITED')this.retryAfter=60; }
}
const errors: Record<string,[number,string]> = {
  REQUEST_CONTEXT_REQUIRED:[401,'A verified request context is required.'], ACCOUNT_SUSPENDED:[403,'This account is suspended. Contact the project administrator.'],
  ACCESS_DENIED:[403,'Administrator access is required.'], NOT_FOUND:[404,'The requested organization record is not available to your account.'],
  CONFLICT:[409,'This request or listing changed. Refresh it before trying again.'], DUPLICATE_CLAIM:[409,'You already have a pending request for this organization and location.'],
  PENDING_REVISION:[409,'A change request for this listing is already awaiting review.'], RATE_LIMITED:[429,'Too many account actions. Please wait before trying again.'],
  VALIDATION_ERROR:[422,'Check the submitted information. Some fields are not supported or are invalid.'], SELF_REVIEW:[403,'You cannot review your own request. Another administrator must review it.'],
  ACCESS_REVOKED:[409,'The applicant no longer has access to this listing. Reject this revision or review a new access request.'], SESSION_EXPIRED:[401,'Your session has ended. Sign in again to continue.']
};

export type OrganizationRequestContext={requestId:string;sessionHash:string};
export interface OrganizationStore {
  command(actor: string, action: string, input?: Record<string, unknown>,context?:OrganizationRequestContext): Promise<unknown>;
  auditSecurityFailure(actor:string,action:string,targetId:string|null,context:OrganizationRequestContext):Promise<boolean>;
  consumeAccountLimit(keyHash: string, action: 'email'|'client'|'verify'): Promise<boolean>;
}
export class PostgresOrganizationStore implements OrganizationStore {
  private query: Query;
  private sql?: ReturnType<typeof postgres>;
  constructor(query?: Query) {
    let tail: Promise<unknown> = Promise.resolve();
    const run: Query = query ?? (async (text,args=[]) => {
      if (!process.env.DATABASE_URL) throw new UnavailableError('DATABASE_NOT_CONFIGURED','Organization accounts are not configured yet. Public search remains available.');
      const config=runtimeDatabaseConfiguration(process.env);
      this.sql ??= postgres(config.connection,{max:1,prepare:false,ssl:config.ssl,connect_timeout:10,idle_timeout:20,onnotice:()=>{}});
      const [role]=await this.sql.unsafe('select current_user as runtime_role');
      if(role?.runtime_role!=='our_ground_api')throw new UnavailableError('RUNTIME_ROLE_INVALID','The account database role is not safely configured.');
      return this.sql.unsafe(text,args as never[]) as unknown as Promise<Array<Record<string, unknown>>>;
    });
    this.query = (text,args=[]) => {
      const result=tail.then(()=>run(text,args)); tail=result.catch(()=>undefined); return result;
    };
  }
  private async execute(text: string,args: unknown[]) {
    try { return await this.query(text,args); }
    catch(error) {
      if(error instanceof UnavailableError || error instanceof OrganizationStoreError) throw error;
      const e=error as {message?:string;code?:string};
      const code=e.code==='P0001' ? /^OG_([A-Z_]+)$/.exec(e.message??'')?.[1] : undefined;
      if(code && errors[code]) throw new OrganizationStoreError(errors[code][0],code,errors[code][1]);
      // Driver messages may contain SQL/connection details. Fail closed and omit them.
      throw new UnavailableError('ACCOUNTS_UNAVAILABLE','Organization account information is temporarily unavailable. Please try again later.');
    }
  }
  async command(actor: string,action: string,input: Record<string,unknown>={},context?:OrganizationRequestContext) {
    const hash=context?.sessionHash ?? (action==='session.check'?input.session_hash:undefined);
    if(typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash))throw new OrganizationStoreError(401,'REQUEST_CONTEXT_REQUIRED',errors.REQUEST_CONTEXT_REQUIRED[1]);
    const requestId=context?.requestId??randomUUID();
    const rows=await this.execute('select app_private.organization_request($1::uuid,$2::text,$3::jsonb,$4::uuid,$5::text) as result',[actor,action,input,requestId,hash]);
    const result=rows[0]?.result;
    if(action==='session.check' && !(result as {active?:boolean})?.active) throw new OrganizationStoreError(401,'SESSION_EXPIRED',errors.SESSION_EXPIRED[1]);
    return result;
  }
  async auditSecurityFailure(actor:string,action:string,targetId:string|null,context:OrganizationRequestContext) {
    const rows=await this.execute('select app_private.security_audit_failure($1::uuid,$2::text,$3::uuid,$4::uuid,$5::text) as allowed',[actor,action,targetId,context.requestId,context.sessionHash]);
    return rows[0]?.allowed===true;
  }
  async consumeAccountLimit(keyHash: string,action: 'email'|'client'|'verify') {
    const rows=await this.execute('select app_private.account_rate_gate($1::text,$2::text) as allowed',[keyHash,action]);
    return rows[0]?.allowed===true;
  }
  async close() { await this.sql?.end(); this.sql=undefined; }
}
