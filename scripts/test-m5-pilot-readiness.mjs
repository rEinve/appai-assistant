import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';

const execFile = promisify(execFileCallback);
const databaseUrl = process.env['DATABASE_URL'];
const secret = process.env['BETTER_AUTH_SECRET'];
if (!databaseUrl || !secret || secret.length < 32) throw new Error('Set local DATABASE_URL and BETTER_AUTH_SECRET for M5 PostgreSQL acceptance.');
const root = dirname(fileURLToPath(import.meta.url));
const pool = new Pool({ connectionString: databaseUrl, max: 8 });
const serverFile = join(root, '..', 'dist', 'api', 'apps', 'api', 'src', 'server.js');
const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const email = `m5pilot-${suffix}@example.test`;
const password = 'M5-acceptance-Fixture-Password-73!';
let apiChild; let workerChild; let baseURL; let cookie; let ownerId; let authUserId;

async function freePort() {
  const socket=createServer(); await new Promise((resolve,reject)=>socket.listen(0,'127.0.0.1',resolve).once('error',reject));
  const {port}=socket.address(); await new Promise((resolve,reject)=>socket.close((error)=>error?reject(error):resolve())); return port;
}
async function request(path,{method='GET',body,headers={}}={}) {
  const response=await fetch(`${baseURL}${path}`,{method,headers:{...(body!==undefined?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{}),origin:'http://localhost:4200',...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const text=await response.text(); let json; try{json=text?JSON.parse(text):null;}catch{json=text;}
  const cookies=response.headers.getSetCookie?.()??[]; const sessionCookie=cookies.map((item)=>item.split(';',1)[0]).filter((item)=>/session_token=/.test(item)).join('; ');
  if(sessionCookie)cookie=sessionCookie; return {response,json};
}
async function waitFor(check,label) { for(let i=0;i<120;i++){const result=await check();if(result)return result;await delay(100);}throw new Error(`Timed out waiting for ${label}.`); }
async function createPerfOperation(budgetId,index) {
  const instructionId=randomUUID(),obligationId=randomUUID(),operationId=randomUUID(),quoteId=randomUUID();
  const name=`m5-load-${suffix}-${index}`,quoteHash=createHash('sha256').update(`${name}-quote`).digest('hex'),termsHash=createHash('sha256').update(`${name}-terms`).digest('hex');
  const now=new Date();
  await pool.query(`INSERT INTO procurement_instructions(owner_id,id,kind,category,mode,state,structured_constraints,max_total_minor,currency,budget_id,valid_from,valid_until,timezone_snapshot,execution_environment,completion_limit)
    VALUES($1,$2,'ONE_TIME','PRODUCT','PRE_APPROVED','ACTIVE',$3::jsonb,1000,'USD',$4,$5,$6,'UTC','FIXTURE',1)`,[ownerId,instructionId,JSON.stringify({description:name,categoryDetails:{quantity:1}}),budgetId,new Date(now.getTime()-60000),new Date(now.getTime()+3600000)]);
  await pool.query(`INSERT INTO procurement_obligations(owner_id,id,instruction_id,obligation_key,category,fulfillment_slot) VALUES($1,$2,$3,$4,'PRODUCT',$5)`,[ownerId,obligationId,instructionId,`m5:${name}`,`slot:${name}`]);
  await pool.query(`INSERT INTO purchase_operations(owner_id,id,instruction_id,obligation_id,state,permission_version,execution_key) VALUES($1,$2,$3,$4,'READY',1,$5)`,[ownerId,operationId,instructionId,obligationId,`m5-operation:${operationId}`]);
  const adapter=await pool.query(`SELECT id,adapter_version FROM vendor_adapters WHERE adapter_key='local-fixture' AND environment='FIXTURE' LIMIT 1`);
  await pool.query(`INSERT INTO vendor_quotes(owner_id,id,operation_id,adapter_id,adapter_version,environment,merchant_ref,external_quote_ref,category,schema_version,typed_details,currency,subtotal_minor,tax_minor,fees_minor,shipping_minor,discount_minor,total_minor,quantity,terms_hash,content_hash,verified_at,expires_at)
    VALUES($1,$2,$3,$4,$5,'FIXTURE','M5 Local Seller',$6,'PRODUCT','m5-fixture-1.0',$7::jsonb,'USD',1000,0,0,0,0,1000,1,$8,$9,now(),now()+interval '1 hour')`,[ownerId,quoteId,operationId,adapter.rows[0].id,adapter.rows[0].adapter_version,`m5:${name}`,JSON.stringify({fixtureOnly:true,quantity:1}),termsHash,quoteHash]);
  await pool.query('UPDATE purchase_operations SET selected_quote_id=$3 WHERE owner_id=$1 AND id=$2',[ownerId,operationId,quoteId]);
  return operationId;
}
async function enroll() {
  const invite=randomUUID()+randomUUID(); const digest=createHash('sha256').update(invite).digest('hex');
  await pool.query("INSERT INTO member_invites(email,token_digest,expires_at) VALUES($1,$2,now()+interval '1 hour')",[email,digest]);
  const signup=await request('/api/auth/sign-up/email',{method:'POST',headers:{cookie:''},body:{name:'M5 Acceptance Operator',email,password,inviteCode:invite}});
  assert.equal(signup.response.status,200,`signup: ${JSON.stringify(signup.json)}`); assert.ok(cookie);
  const profile=await request('/api/v1/me'); assert.equal(profile.response.status,200,`profile: ${JSON.stringify(profile.json)}`);
  const auth=await pool.query('SELECT id FROM "user" WHERE email=$1',[email]); authUserId=auth.rows[0].id;
  const owner=await pool.query('SELECT id FROM users WHERE identity_provider_subject=$1',[authUserId]); ownerId=owner.rows[0].id;
  await pool.query("INSERT INTO user_settings(owner_id,timezone,enabled_currency,currency_scale) VALUES($1,'UTC','USD',2) ON CONFLICT(owner_id) DO NOTHING",[ownerId]);
}
async function backupRestoreRehearsal() {
  const dir=await mkdtemp(join(tmpdir(),'appai-m5-backup-')); const dump=join(dir,'checkpoint.dump'); const restoredDb=`appai_m5_restore_${suffix}`;
  const sourceDb=new URL(databaseUrl); const sourceName=decodeURIComponent(sourceDb.pathname.slice(1));
  const adminUrl=new URL(databaseUrl); adminUrl.pathname='/postgres';
  const pgArgs=['--no-owner','--no-acl','--format=custom','--file',dump,databaseUrl];
  let created=false;
  try {
    await execFile('pg_dump',pgArgs,{maxBuffer:1024*1024*8});
    await execFile('createdb',['--maintenance-db',adminUrl.toString(),restoredDb]); created=true;
    const restoreUrl=new URL(databaseUrl); restoreUrl.pathname=`/${restoredDb}`;
    await execFile('pg_restore',['--no-owner','--no-acl','--dbname',restoreUrl.toString(),dump],{maxBuffer:1024*1024*16});
    const clone=new Pool({connectionString:restoreUrl.toString(),max:2});
    try {
      const counts=await clone.query(`SELECT
        (SELECT count(*) FROM purchase_operations WHERE owner_id=$1)::int AS operations,
        (SELECT count(*) FROM budget_reservations WHERE owner_id=$1 AND status='ACTIVE')::int AS active_reservations,
        (SELECT count(*) FROM execution_attempts WHERE owner_id=$1)::int AS attempts,
        (SELECT count(*) FROM outbox_events WHERE owner_id=$1)::int AS outbox_events,
        (SELECT count(*) FROM api_idempotency WHERE actor_id=$1)::int AS idempotency`,[ownerId]);
      assert.ok(counts.rows[0]);
      const source=await pool.query(`SELECT (SELECT count(*) FROM purchase_operations WHERE owner_id=$1)::int AS operations,
        (SELECT count(*) FROM budget_reservations WHERE owner_id=$1 AND status='ACTIVE')::int AS active_reservations,
        (SELECT count(*) FROM execution_attempts WHERE owner_id=$1)::int AS attempts,
        (SELECT count(*) FROM outbox_events WHERE owner_id=$1)::int AS outbox_events,
        (SELECT count(*) FROM api_idempotency WHERE actor_id=$1)::int AS idempotency`,[ownerId]);
      assert.deepEqual(counts.rows[0],source.rows[0]);
    } finally { await clone.end(); }
    console.log(`M5 backup/restore rehearsal passed (${sourceName} -> ${restoredDb}); operation/reservation/attempt/outbox/idempotency counts preserved.`);
  } finally {
    if(created) await execFile('dropdb',['--maintenance-db',adminUrl.toString(),restoredDb]).catch(()=>{});
    await rm(dir,{recursive:true,force:true});
  }
}

try {
  const port=await freePort(); baseURL=`http://127.0.0.1:${port}`;
  apiChild=spawn(process.execPath,[serverFile],{cwd:join(root,'..'),env:{...process.env,APP_PORT:String(port),BETTER_AUTH_URL:baseURL,WEB_APP_ORIGIN:'http://localhost:4200',APPAI_OPERATOR_EMAILS:email,APPAI_REQUIRE_STEP_UP:'false',APPAI_EXECUTION_MODE:'local-sandbox'},stdio:'ignore'});
  await waitFor(async()=>{try{return (await fetch(`${baseURL}/health`)).ok;}catch{return false;}},'API startup');
  await enroll();

  const budget=(await pool.query(`INSERT INTO budgets(owner_id,name,currency,allocation_limit_minor) VALUES($1,$2,'USD',1000) RETURNING id`,[ownerId,`m5-immutability-${suffix}`])).rows[0].id;
  const instruction=(await pool.query(`INSERT INTO procurement_instructions(owner_id,kind,category,mode,state,structured_constraints,max_total_minor,currency,budget_id,timezone_snapshot)
    VALUES($1,'ONE_TIME','PRODUCT','NOTIFY_ONLY','DRAFT','{}'::jsonb,1000,'USD',$2,'UTC') RETURNING id`,[ownerId,budget])).rows[0].id;
  const obligation=(await pool.query(`INSERT INTO procurement_obligations(owner_id,instruction_id,obligation_key,category,fulfillment_slot)
    VALUES($1,$2,$3,'PRODUCT',$4) RETURNING id`,[ownerId,instruction,`m5-${suffix}`,suffix])).rows[0].id;
  const operation=(await pool.query(`INSERT INTO purchase_operations(owner_id,instruction_id,obligation_id,state,permission_version,execution_key)
    VALUES($1,$2,$3,'FIXTURE_COMPLETED',1,$4) RETURNING id`,[ownerId,instruction,obligation,`m5-${suffix}`])).rows[0].id;
  const ledger=(await pool.query(`INSERT INTO budget_entries(owner_id,budget_id,operation_id,kind,amount_minor,currency,external_event_key)
    VALUES($1,$2,$3,'SPEND',1,'USD',$4) RETURNING id`,[ownerId,budget,operation,`m5-ledger-${suffix}`])).rows[0];
  await pool.query(`UPDATE purchase_operations SET state='RECONCILING' WHERE id=$1`,[operation]);
  const protectedReservation=(await pool.query(`INSERT INTO budget_reservations(owner_id,operation_id,budget_id,currency,amount_minor,status) VALUES($1,$2,$3,'USD',1000,'ACTIVE') RETURNING id`,[ownerId,operation,budget])).rows[0].id;
  await pool.query(`INSERT INTO api_idempotency(actor_id,route_scope,key,request_hash,result_ref,state,retention_until) VALUES($1,$2,$3,'unresolved-hash',$4,'COMPLETED',now()-interval '2 days')`,[ownerId,`operation:${operation}`,`unresolved-${suffix}`,operation]);

  for(const table of ['audit_events','budget_entries']) {
    const row=table==='audit_events'
      ? await pool.query(`INSERT INTO audit_events(actor_type,actor_id,owner_id,action,new_state) VALUES('MEMBER',$1,$2,'M5_IMMUTABILITY_PROBE','CREATED') RETURNING id`,[authUserId,ownerId])
      : {rows:[ledger]};
    for(const statement of [`UPDATE ${table} SET ${table==='audit_events'?'action':'currency'}=${table==='audit_events'?"'MUTATED'":"'EUR'"} WHERE id=$1`,`DELETE FROM ${table} WHERE id=$1`]) {
      await assert.rejects(pool.query(statement,[row.rows[0].id]),(error)=>error.code==='55000');
    }
  }
  console.log('M5 append-only triggers passed for audit_events and budget_entries (UPDATE and DELETE rejected with 55000).');

  await pool.query(`INSERT INTO api_idempotency(actor_id,route_scope,key,request_hash,state,retention_until) VALUES($1,'m5-retention-probe',$2,'fixture-hash','COMPLETED',now()-interval '2 days')`,[ownerId,`expired-${suffix}`]);
  const missingStep=await request('/api/v1/budget-policies',{method:'PUT',headers:{'x-require-step-up':'true'},body:{currency:'USD',perOrderHardLimitMinor:'10000',dailyLimitMinor:'20000',timezone:'UTC'}});
  assert.equal(missingStep.response.status,403); assert.equal(missingStep.json.code,'STEP_UP_AUTH_REQUIRED');
  const step=await request('/api/v1/auth/step-up',{method:'POST',body:{password}}); assert.equal(step.response.status,200,`step-up: ${JSON.stringify(step.json)}`);
  const policy=await request('/api/v1/budget-policies',{method:'PUT',headers:{'x-require-step-up':'true'},body:{currency:'USD',perOrderHardLimitMinor:'10000',dailyLimitMinor:'20000',timezone:'UTC'}});
  assert.equal(policy.response.status,200,`policy after step-up: ${JSON.stringify(policy.json)}`);
  const prune=await request('/api/v1/operator/retention/run',{method:'POST'}); assert.equal(prune.response.status,200,`retention: ${JSON.stringify(prune.json)}`);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM api_idempotency WHERE actor_id=$1 AND route_scope=$2',[ownerId,'m5-retention-probe'])).rows[0].n,0);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM api_idempotency WHERE actor_id=$1 AND route_scope=$2',[ownerId,`operation:${operation}`])).rows[0].n,1,'Expired idempotency linked to RECONCILING work must be preserved.');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM data_retention_runs WHERE actor_id=$1 AND status=\'COMPLETED\'',[authUserId])).rows[0].n,1);
  const readiness=await request('/api/v1/operator/pilot-readiness'); assert.equal(readiness.response.status,200); assert.equal(readiness.json.liveExecutionEnabled,false); assert.equal(readiness.json.allLiveAdaptersDisabled,true); assert.ok(readiness.json.unsupported.includes('ESCROW'));
  console.log('M5 step-up, safe retention, and operator capability manifest passed.');

  await request('/api/v1/budget-policies',{method:'PUT',body:{currency:'USD',perOrderHardLimitMinor:'1000',dailyLimitMinor:'6000',timezone:'UTC'}});
  const perfBudget=(await pool.query(`INSERT INTO budgets(owner_id,name,currency,allocation_limit_minor,timezone_snapshot) VALUES($1,$2,'USD',5000,'UTC') RETURNING id`,[ownerId,`m5-load-${suffix}`])).rows[0].id;
  const operations=await Promise.all(Array.from({length:10},(_,index)=>createPerfOperation(perfBudget,index)));
  const apiTimes=[];
  const results=await Promise.all(operations.map(async(operationId)=>{const start=performance.now();const result=await request(`/api/v1/operations/${operationId}/reserve-and-dispatch`,{method:'POST',body:{faultMode:'NONE'}});apiTimes.push(performance.now()-start);return result;}));
  const reservationTimes=results.map((result)=>Number(result.json?.reservationLatencyMs));
  assert.ok(reservationTimes.every(Number.isFinite),'Each reservation response must expose reservationLatencyMs.');
  const percentile95=(values)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*0.95)-1];
  const reservationP95=percentile95(reservationTimes),apiP95=percentile95(apiTimes);
  const winners=results.filter((result)=>result.response.status===200).length;
  assert.equal(winners,5,`The shared budget must admit exactly five 1,000-unit operations. Results: ${JSON.stringify(results.map((result)=>({status:result.response.status,body:result.json})))}`);
  assert.ok(reservationP95<=200,`reservation p95 ${reservationP95.toFixed(2)}ms exceeded 200ms`);
  assert.ok(apiP95<=1000,`API acknowledgement p95 ${apiP95.toFixed(2)}ms exceeded 1,000ms`);
  const held=(await pool.query(`SELECT COALESCE(sum(amount_minor),0)::text AS total FROM budget_reservations WHERE owner_id=$1 AND budget_id=$2 AND status='ACTIVE'`,[ownerId,perfBudget])).rows[0].total;
  const spent=(await pool.query(`SELECT COALESCE(sum(amount_minor),0)::text AS total FROM budget_entries WHERE owner_id=$1 AND budget_id=$2 AND kind='SPEND'`,[ownerId,perfBudget])).rows[0].total;
  assert.equal(BigInt(held)+BigInt(spent),5000n,'Concurrent operations must conserve the exact shared budget.');
  const dueJob=(await pool.query(`INSERT INTO jobs(owner_id,job_type,dedupe_key,state,run_at,payload) VALUES($1,'NOTIFY',$2,'READY',now()-interval '1 second','{}'::jsonb) RETURNING id`,[ownerId,`m5-pickup-${suffix}`])).rows[0];
  workerChild=spawn(process.execPath,[join(root,'..','dist','worker','apps','worker','src','worker.js')],{cwd:join(root,'..'),env:{...process.env,WORKER_ID:`m5-${suffix}`,WORKER_POLL_MS:'100',WORKER_LEASE_MS:'5000'},stdio:'ignore'});
  const started=await waitFor(async()=>{const result=await pool.query('SELECT first_started_at,run_at FROM jobs WHERE id=$1',[dueJob.id]);return result.rows[0]?.first_started_at?result.rows[0]:null;},'due job first-start timestamp');
  const pickupLagMs=Date.parse(started.first_started_at)-Date.parse(started.run_at);
  assert.ok(pickupLagMs<=60_000,`due-job pickup lag ${pickupLagMs}ms exceeded 60,000ms`);
  workerChild.kill('SIGTERM'); await new Promise((resolve)=>workerChild.once('exit',resolve)); workerChild=null;
  console.log(`M5 SLAs passed: reservation p95=${reservationP95.toFixed(2)}ms, API p95=${apiP95.toFixed(2)}ms, due-job pickup=${pickupLagMs}ms; 10 concurrent operations, 5 winners, total=${BigInt(held)+BigInt(spent)} minor units.`);

  const auditCount=(await pool.query('SELECT count(*)::int AS n FROM audit_events WHERE owner_id=$1',[ownerId])).rows[0].n;
  const reconcileJob=(await pool.query(`INSERT INTO jobs(owner_id,instruction_id,obligation_id,job_type,dedupe_key,state,run_at) VALUES($1,$2,$3,'RECONCILE',$4,'READY',now()+interval '10 minutes') RETURNING id`,[ownerId,instruction,obligation,`m5-reconcile-${suffix}`])).rows[0].id;
  const futureJob=(await pool.query(`INSERT INTO jobs(owner_id,instruction_id,job_type,dedupe_key,state,run_at) VALUES($1,$2,'RUN_OCCURRENCE',$3,'READY',now()+interval '10 minutes') RETURNING id`,[ownerId,instruction,`m5-future-${suffix}`])).rows[0].id;
  await backupRestoreRehearsal();
  const deactivated=await request('/api/v1/me/deactivate-account',{method:'POST'}); assert.equal(deactivated.response.status,200,`deactivation: ${JSON.stringify(deactivated.json)}`);
  assert.equal((await pool.query('SELECT active FROM users WHERE id=$1',[ownerId])).rows[0].active,false);
  assert.ok((await pool.query('SELECT count(*)::int AS n FROM audit_events WHERE owner_id=$1',[ownerId])).rows[0].n>auditCount);
  assert.equal((await pool.query('SELECT status FROM budget_reservations WHERE id=$1',[protectedReservation])).rows[0].status,'ACTIVE');
  assert.equal((await pool.query('SELECT state FROM purchase_operations WHERE id=$1',[operation])).rows[0].state,'RECONCILING');
  assert.equal((await pool.query('SELECT state FROM jobs WHERE id=$1',[reconcileJob])).rows[0].state,'READY');
  assert.equal((await pool.query('SELECT state FROM jobs WHERE id=$1',[futureJob])).rows[0].state,'BLOCKED');
  assert.equal((await request('/api/v1/me')).response.status,401);
  console.log('M5 account deactivation passed; auth access revoked and audit history preserved.');
  console.log('M5 local PostgreSQL acceptance passed.');
} finally {
  if(apiChild&&apiChild.exitCode===null){apiChild.kill('SIGTERM');await new Promise((resolve)=>apiChild.once('exit',resolve));}
  if(workerChild&&workerChild.exitCode===null){workerChild.kill('SIGTERM');await new Promise((resolve)=>workerChild.once('exit',resolve));}
  await pool.end();
}
