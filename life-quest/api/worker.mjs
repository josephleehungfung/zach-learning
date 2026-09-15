const DAY = 86400000;
const initialTasks = [
  ['Morning ready', '準時起床、吃早餐及穿衣', '晨間準備'],
  ['Review time', '早上自主複習昨日所學', '早上複習'],
  ['Leave on time', '自己收拾書包，準時出門', '準時出門'],
  ['Stay calm', '在校遇到不滿先停下，用說話表達或找老師協助', '在校情緒管理'],
  ['Tell my story', '分享今天學校發生的事，以及自己的感受', '放學分享'],
  ['Homework done', '自主完成今天功課及作業', '自主功課'],
  ['Read 30 minutes', '自主閱讀半小時', '閱讀半小時'],
  ['Plan tomorrow', '安排預習內容及明天的計劃', '預習與計劃']
].map(([en, detail, title], i) => ({id: String(i+1), en, detail, title, points: null}));
const reply = (data, status=200) => Response.json(data, {status, headers:{'Cache-Control':'no-store'}});
const fail = (message, status=400) => {throw Object.assign(new Error(message), {status});};
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), n=>n.toString(16).padStart(2,'0')).join('');
const digest = async s => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))), n=>n.toString(16).padStart(2,'0')).join('');
async function passwordHash(password,salt){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},key,256);
  return Array.from(new Uint8Array(bits),n=>n.toString(16).padStart(2,'0')).join('');
}
const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const number = v => Number.isSafeInteger(v) && v>=0 && v<=10000;

export default {
  async fetch(req,env){
    const origin=req.headers.get('Origin');
    const allowed=env.ALLOWED_ORIGIN;
    if(origin && origin!==allowed) return reply({error:'此網址未獲允許'},403);
    const headers={'Access-Control-Allow-Origin':allowed || '', 'Access-Control-Allow-Methods':'GET, POST, OPTIONS', 'Access-Control-Allow-Headers':'Authorization, Content-Type', 'Vary':'Origin','Cache-Control':'no-store'};
    if(req.method==='OPTIONS') return new Response(null,{status:204,headers});
    const id=env.FAMILY.idFromName('zach-family-v1');
    const res=await env.FAMILY.get(id).fetch(req);
    const result=new Response(res.body,res);
    for(const [k,v] of Object.entries(headers)) result.headers.set(k,v);
    return result;
  }
};

export class Family {
  constructor(ctx,env){this.ctx=ctx;this.env=env;}
  async fetch(req){
    // One serialized transaction boundary for decisions, balances and sessions.
    return this.ctx.blockConcurrencyWhile(async()=>{
      try{return await this.handle(req);}catch(e){return reply({error:e.status?e.message:'暫時未能儲存，請稍後重試'},e.status||500);}
    });
  }
  async handle(req){
    const path=new URL(req.url).pathname;
    if(!['GET','POST'].includes(req.method)) fail('不支援此操作',405);
    if(req.method==='GET' && path!=='/state') fail('找不到頁面',404);
    let body={};
    if(req.method==='POST'){
      const raw=await req.text();if(raw.length>16000) fail('內容過長',413);
      try{body=JSON.parse(raw);}catch{fail('資料格式不正確');}
      if(!body||typeof body!=='object'||Array.isArray(body)) fail('資料格式不正確');
    }
    let data=await this.ctx.storage.get('family');
    const now=Date.now();
    // Persist auth failures separately so an unsuccessful request cannot erase them.
    if(['/setup','/login','/pair'].includes(path)){
      const gate=await this.ctx.storage.get('gate')||{count:0,start:now};
      if(now-gate.start>600000){gate.count=0;gate.start=now;}
      if(gate.count>=12) fail('嘗試次數較多，請十分鐘後再試',429);
      gate.count++;await this.ctx.storage.put('gate',gate);
    }
    const session=async role=>{
      const t=token();data.sessions[(await digest(t))]={role,expires:now+30*DAY};
      await this.ctx.storage.put('family',data);
      return reply({token:t,role});
    };
    if(path==='/setup'){
      if(data) fail('家長帳戶已建立，請登入',409);
      if(!this.env.SETUP_KEY || body.setupKey!==this.env.SETUP_KEY) fail('啟用碼不正確',403);
      if(typeof body.password!=='string'||body.password.length<12||body.password.length>200) fail('家長密碼需要 12–200 個字元');
      const salt=token();
      data={salt,password:await passwordHash(body.password,salt),sessions:{},tasks:initialTasks,rewards:[],submissions:{},redemptions:{},ledger:[],balance:0,revision:0};
      return session('parent');
    }
    if(!data) fail('請先由家長啟用遊戲',409);
    data.sessions=Object.fromEntries(Object.entries(data.sessions).filter(([,s])=>s.expires>now));
    if(path==='/login'){
      if(typeof body.password!=='string'||body.password.length>200||await passwordHash(body.password,data.salt)!==data.password) fail('密碼不正確',401);
      return session('parent');
    }
    if(path==='/pair'){
      if(!data.pair || data.pair.expires<now || typeof body.code!=='string'||await digest(body.code.toUpperCase().replace(/\s/g,''))!==data.pair.hash) fail('配對碼不正確或已過期',401);
      delete data.pair;return session('child');
    }
    const auth=await digest((req.headers.get('Authorization')||'').replace(/^Bearer /,''));
    const identity=data.sessions[auth];if(!identity) fail('請重新登入或配對',401);
    const parent=()=>{if(identity.role!=='parent') fail('需要家長確認',403);};
    if(path==='/state') return reply({role:identity.role,today:today(),tasks:data.tasks,rewards:data.rewards,submissions:Object.values(data.submissions),redemptions:Object.values(data.redemptions),balance:data.balance,ledger:data.ledger.slice(-100),revision:data.revision});
    if(req.method!=='POST') fail('請使用 POST',405);
    let extra={};
    if(path==='/logout'){delete data.sessions[auth];}
    else if(path==='/pair-code'){
      parent();const code=token().slice(0,12).toUpperCase();data.pair={hash:await digest(code),expires:now+600000};extra={code};
    }
    else if(path==='/revoke-child'){
      parent();data.sessions=Object.fromEntries(Object.entries(data.sessions).filter(([,s])=>s.role!=='child'));delete data.pair;
    }
    else if(path==='/settings'){
      parent();if(body.revision!==data.revision) fail('資料已更新，請重新整理後再設定',409);
      if(!Array.isArray(body.points)||body.points.length!==8||!body.points.every(number)) fail('每項分數須為 0–10000 的整數');
      if(!Array.isArray(body.rewards)||body.rewards.length>12) fail('最多可設定 12 個獎勵');
      const ids=new Set();
      const rewards=body.rewards.map(r=>{
        if(typeof r.title!=='string'||!r.title.trim()||r.title.length>50||!number(r.cost)||r.cost<1) fail('請填妥獎勵名稱及所需金幣');
        const id=typeof r.id==='string'&&data.rewards.some(x=>x.id===r.id)?r.id:crypto.randomUUID();
        if(ids.has(id)) fail('獎勵不能重複');ids.add(id);
        return {id,title:r.title.trim(),cost:r.cost};
      });
      data.tasks=data.tasks.map((t,i)=>({...t,points:body.points[i]}));data.rewards=rewards;
    }
    else if(path==='/submit'){
      const task=data.tasks.find(t=>t.id===body.taskId);if(!task) fail('找不到任務');
      if(task.points===null) fail('請先由家長設定獎勵規則');
      const id=today()+':'+task.id;const old=data.submissions[id];
      if(!old||old.status==='retry') data.submissions[id]={id,day:today(),taskId:task.id,title:task.title,points:old?old.points:task.points,status:'pending',submittedAt:now};
    }
    else if(path==='/review'){
      parent();const s=data.submissions[body.id];if(!s) fail('找不到提交紀錄');
      if(!['approve','retry'].includes(body.decision)) fail('無效的決定');
      if(s.status==='pending'){
        s.reviewedAt=now;s.status=body.decision==='approve'?'approved':'retry';
        if(s.status==='approved'){data.balance+=s.points;data.ledger.push({id:'task:'+s.id,at:now,amount:s.points,title:s.title,day:s.day});}
      }
    }
    else if(path==='/redeem'){
      const r=data.rewards.find(r=>r.id===body.rewardId);if(!r) fail('找不到獎勵');
      if(Object.values(data.redemptions).some(x=>x.rewardId===r.id&&x.status==='pending')) fail('這個獎勵已在等待家長確認');
      if(data.balance<r.cost) fail('金幣未足夠，繼續累積吧');
      const id=crypto.randomUUID();data.redemptions[id]={id,rewardId:r.id,title:r.title,cost:r.cost,status:'pending',at:now};
    }
    else if(path==='/review-reward'){
      parent();const r=data.redemptions[body.id];if(!r) fail('找不到兌換紀錄');
      if(!['approve','decline'].includes(body.decision)) fail('無效的決定');
      if(r.status==='pending'){
        if(body.decision==='approve'){
          if(data.balance<r.cost) fail('餘額不足，請先處理其他兌換',409);
          data.balance-=r.cost;data.ledger.push({id:'reward:'+r.id,at:now,amount:-r.cost,title:r.title});
        }
        r.status=body.decision==='approve'?'approved':'declined';r.reviewedAt=now;
      }
    }
    else fail('找不到此操作',404);
    data.revision++;await this.ctx.storage.put('family',data);return reply({ok:true,...extra});
  }
}
