import test from 'node:test';
import assert from 'node:assert/strict';
import {Family} from './worker.mjs';

test('two devices, protected review, idempotent awards and redemption',async()=>{
 const disk=new Map();let queue=Promise.resolve();
 const ctx={storage:{get:async k=>structuredClone(disk.get(k)),put:async(k,v)=>disk.set(k,structuredClone(v))},blockConcurrencyWhile:fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;}};
 const family=new Family(ctx,{SETUP_KEY:'test-bootstrap-only'});
 const call=async(path,body,token)=>{const response=await family.fetch(new Request('https://test.invalid'+path,{method:body===undefined?'GET':'POST',headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}));return {status:response.status,...await response.json()};};
 const parent=await call('/setup',{setupKey:'test-bootstrap-only',password:'a-test-password-only'});assert.equal(parent.status,200);
 assert.equal((await call('/state')).status,401);
 let state=await call('/state',undefined,parent.token);
 assert.equal(state.tasks.length,8);assert.equal(state.tasks[0].points,null);
 assert.equal((await call('/submit',{taskId:'1'},parent.token)).status,400);
 await call('/settings',{revision:state.revision,points:Array(8).fill(5),rewards:[{title:'一起選一本故事書',cost:5}]},parent.token);
 const code=await call('/pair-code',{},parent.token);
 const child=await call('/pair',{code:code.code});assert.equal(child.role,'child');
 assert.equal((await call('/pair',{code:code.code})).status,401);
 assert.equal((await call('/settings',{points:Array(8).fill(100)},child.token)).status,403);
 await Promise.all([call('/submit',{taskId:'1'},child.token),call('/submit',{taskId:'1'},child.token)]);
 state=await call('/state',undefined,parent.token);assert.equal(state.submissions.length,1);
 const id=state.submissions[0].id;
 assert.equal((await call('/review',{id,decision:'approve'},child.token)).status,403);
 await Promise.all([call('/review',{id,decision:'approve'},parent.token),call('/review',{id,decision:'approve'},parent.token)]);
 state=await call('/state',undefined,child.token);assert.equal(state.balance,5);assert.equal(state.ledger.length,1);
 await call('/redeem',{rewardId:state.rewards[0].id},child.token);
 state=await call('/state',undefined,parent.token);assert.equal(state.balance,5);
 const rid=state.redemptions[0].id;
 assert.equal((await call('/review-reward',{id:rid,decision:'approve'},child.token)).status,403);
 await Promise.all([call('/review-reward',{id:rid,decision:'approve'},parent.token),call('/review-reward',{id:rid,decision:'approve'},parent.token)]);
 state=await call('/state',undefined,child.token);assert.equal(state.balance,0);assert.equal(state.ledger.length,2);
 assert.equal((await call('/redeem',{rewardId:state.rewards[0].id},child.token)).status,400);
 await call('/revoke-child',{},parent.token);assert.equal((await call('/state',undefined,child.token)).status,401);
});

test('submitted tasks retain agreed points when settings change',async()=>{
 const disk=new Map();const ctx={storage:{get:async k=>structuredClone(disk.get(k)),put:async(k,v)=>disk.set(k,structuredClone(v))},blockConcurrencyWhile:fn=>fn()};
 const f=new Family(ctx,{SETUP_KEY:'test'});
 const call=async(path,body,token)=>{const r=await f.fetch(new Request('https://test.invalid'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+(token||'')},...(body===undefined?{}:{body:JSON.stringify(body)})}));return r.json();};
 const p=await call('/setup',{setupKey:'test',password:'long-test-password'});
 let s=await call('/state',undefined,p.token);
 await call('/settings',{revision:s.revision,points:Array(8).fill(2),rewards:[]},p.token);
 await call('/submit',{taskId:'1'},p.token);s=await call('/state',undefined,p.token);
 await call('/settings',{revision:s.revision,points:Array(8).fill(8),rewards:[]},p.token);
 await call('/review',{id:s.submissions[0].id,decision:'approve'},p.token);
 s=await call('/state',undefined,p.token);assert.equal(s.balance,2);assert.equal(s.tasks[0].points,8);
});
