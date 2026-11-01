// @ts-nocheck
import postgres from 'npm:postgres@3.4.5';
import {AsyncLocalStorage} from 'node:async_hooks';
const sql=postgres(Deno.env.get('SUPABASE_DB_URL')!,{max:2,prepare:false,idle_timeout:20});
export const context=new AsyncLocalStorage();
export const currentUser=()=>context.getStore();
export function translate(input){let q=input.replace(/INSERT OR IGNORE INTO/gi,'INSERT INTO').replace(/json_extract\(data,'\$\.([a-z_]+)'\)/g,(_,key)=>key==='balance_deducted'?"(CASE WHEN data::jsonb->>'balance_deducted' IS NULL THEN NULL WHEN data::jsonb->>'balance_deducted' IN ('true','1') THEN 1 ELSE 0 END)":`(data::jsonb->>'${key}')`);let n=0,out='',quoted=false;for(let i=0;i<q.length;i++){const c=q[i];if(c==="'"){out+=c;if(quoted&&q[i+1]==="'"){out+=q[++i];continue;}quoted=!quoted;}else out+=c==='?'&&!quoted?'$'+(++n):c;}if(/INSERT OR IGNORE/i.test(input))out+=' ON CONFLICT DO NOTHING';return out;}
class Statement{constructor(q,args=[]){this.q=q;this.args=args;}bind(...args){return new Statement(this.q,args);}async all(){return (await DB.batch([this]))[0];}async first(){return (await this.all()).results[0]??null;}async run(){return this.all();}}
const DB={prepare:q=>new Statement(q),batch:async(stmts)=>sql.begin(async tx=>{await tx`select set_config('search_path','hr,pg_catalog',true)`;await tx`select pg_advisory_xact_lock(75839421)`;const results=[];for(const s of stmts){const r=await tx.unsafe(translate(s.q),s.args);const rows=Array.from(r).map(row=>{for(const col of r.columns||[])if(col.type===20&&row[col.name]!==null){const value=Number(row[col.name]);if(!Number.isSafeInteger(value))throw Error('Integer out of range');row[col.name]=value;}return row;});results.push({results:rows,meta:{changes:r.count}});}return results;})};
const BUCKET={async put(key,bytes){await sql`insert into hr.blobs(key,bytes) values(${key},${new Uint8Array(bytes)}) on conflict(key) do update set bytes=excluded.bytes`;},async get(key){const rows=await sql`select bytes from hr.blobs where key=${key}`;return rows.length?{body:new Uint8Array(rows[0].bytes)}:null;},async delete(key){await sql`delete from hr.blobs where key=${key}`;}};
export const env={DB,BUCKET};

export async function sessionActive(sid,uid){if(!sid)return false;return (await sql`select 1 from auth.sessions where id=${sid} and user_id=${uid} and (not_after is null or not_after>now())`).length>0;}
