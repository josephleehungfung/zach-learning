'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=null,mode='child',tab='tasks',busy=false,dirty=false,settingsRevision=null;
let authToken='';try{authToken=localStorage.getItem('zach-quest-session')||'';}catch{}
const api=(window.QUEST_API||'').replace(/\/$/,'');
function notify(message){$('notice').textContent=message;$('notice').hidden=!message;}
function saveToken(t){authToken=t;try{if(t)localStorage.setItem('zach-quest-session',t);else localStorage.removeItem('zach-quest-session');}catch{}}
async function request(path,body){
 const response=await fetch(api+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(authToken?{Authorization:'Bearer '+authToken}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
 const value=await response.json();if(!response.ok){if(response.status===401&&!['/login','/pair'].includes(path)){saveToken('');showAuth();}throw new Error(value.error||'暫時未能連接');}return value;
}
function showAuth(){$('auth').hidden=false;$('game').hidden=true;}
async function refresh(){if(!authToken)return;try{state=await request('/state');$('auth').hidden=true;$('game').hidden=false;render();$('connection').textContent='已同步 · '+new Date().toLocaleTimeString('zh-HK',{hour:'2-digit',minute:'2-digit'});}catch(e){$('connection').textContent='未能同步 · 請檢查網絡後重試';notify(e.message);}}
async function act(path,body){if(busy)return;busy=true;try{const r=await request(path,body);notify('已儲存');await refresh();return r;}catch(e){notify(e.message);}finally{busy=false;}}
function chooseTab(t){tab=t;for(const name of ['tasks','shop','history','parent'])$(name).hidden=name!==tab;document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));}
function render(){
 const parent=state.role==='parent';$('parentTab').hidden=!parent;if(!parent&&tab==='parent')chooseTab('tasks');
 $('coins').textContent=state.balance;$('date').textContent=state.today+' · 香港時間';
 const daily=state.submissions.filter(s=>s.day===state.today);const completed=daily.filter(s=>s.status==='approved');
 $('count').textContent=completed.length+' / 8';$('progress').value=completed.length;
 const pending=daily.filter(s=>s.status==='pending').length;
 $('encourage').textContent=completed.length?`Zach，今天你完成了「${completed[0].title}」${completed.length>1?'等 '+completed.length+' 項任務':''}。你的努力被看見了！${completed.length===8?'今天的八項任務都完成了，好好休息吧。':'下一步選一件做得到的事，慢慢完成。'}`:pending?'你的完成報告已送到家長那邊，等確認後就會亮起完成標記。':'選一個小任務開始吧。遇到困難，可以請家人幫忙。';
 $('taskGrid').innerHTML=state.tasks.map(t=>{
  const s=daily.find(s=>s.taskId===t.id),status=s?.status||'new';
  const label={new:'我完成了',pending:'等待家長確認',approved:'完成！',retry:'我再試好了，提交確認'}[status];
  return `<article class="card ${status}"><span class="number">${esc(t.id.padStart(2,'0'))}</span><div class="english">${esc(t.en)}</div><h3>${esc(t.title)}</h3><p>${esc(t.detail)}</p><span class="status">${t.points===null?'家長尚未設定金幣':esc(s?.points??t.points)+' 金幣'}${status==='retry'?' · 再試一次，你可以的':''}</span><button class="gold" data-action="submit" data-id="${esc(t.id)}" ${['pending','approved'].includes(status)||t.points===null?'disabled':''}>${label}</button></article>`;
 }).join('');
 $('rewardGrid').innerHTML=state.rewards.length?state.rewards.map(r=>`<article class="card"><span class="english">REWARD</span><h3>${esc(r.title)}</h3><p>${r.cost} 金幣</p><button data-action="redeem" data-id="${esc(r.id)}" ${state.balance<r.cost||state.redemptions.some(x=>x.rewardId===r.id&&x.status==='pending')?'disabled':''}>申請兌換</button></article>`).join(''):'<p>家長設定好獎勵後，就會在這裏出現。</p>';
 const names={pending:'等待家長確認',approved:'已確認兌換',declined:'這次未兌換，金幣仍然保留'};
 $('rewardRequests').innerHTML=state.redemptions.slice(-10).reverse().map(r=>`<div class="entry">${esc(r.title)} · ${names[r.status]}</div>`).join('');
 $('ledger').innerHTML=state.ledger.length?[...state.ledger].reverse().map(l=>`<div class="entry row"><span>${esc(l.title)}<br><small>${new Date(l.at).toLocaleString('zh-HK',{timeZone:'Asia/Hong_Kong'})}</small></span><strong>${l.amount>0?'+':''}${l.amount} 金幣</strong></div>`).join(''):'還未有金幣紀錄。第一個小任務，會是新的開始。';
 if(parent){
  $('reviews').innerHTML=state.submissions.filter(s=>s.status==='pending').map(s=>`<div class="review"><strong>${esc(s.title)} · ${s.points} 金幣</strong><br>${esc(s.day)}<div><button class="gold" data-action="approve" data-id="${esc(s.id)}">確認完成</button><button data-action="retry" data-id="${esc(s.id)}">需要再試</button></div></div>`).join('')||'<p>目前沒有待確認任務。</p>';
  $('redemptionReviews').innerHTML=state.redemptions.filter(r=>r.status==='pending').map(r=>`<div class="review"><strong>${esc(r.title)} · ${r.cost} 金幣</strong><div><button class="gold" data-action="reward-approve" data-id="${esc(r.id)}">確認兌換並扣金幣</button><button data-action="reward-decline" data-id="${esc(r.id)}">暫不兌換</button></div></div>`).join('')||'<p>目前沒有待確認兌換。</p>';
  if(!dirty){settingsRevision=state.revision;$('pointFields').innerHTML=state.tasks.map(t=>`<div class="settingRow"><label for="points${t.id}">${esc(t.title)}</label><input id="points${t.id}" type="number" min="0" max="10000" step="1" required value="${t.points??''}" aria-label="${esc(t.title)}的金幣"></div>`).join('');$('rewardFields').innerHTML='';state.rewards.forEach(addReward);}
 }
}
function addReward(r={}){const el=document.createElement('div');el.className='rewardRow';el.dataset.id=r.id||'';el.innerHTML=`<label>獎勵名稱<input class="rewardTitle" maxlength="50" required value="${esc(r.title||'')}"></label><label>所需金幣<input class="rewardCost" type="number" min="1" max="10000" step="1" required value="${r.cost||''}"></label><button type="button" class="removeReward text">移除此獎勵</button>`;$('rewardFields').append(el);}
document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.tab)chooseTab(b.dataset.tab);
 if(b.dataset.mode){mode=b.dataset.mode;$('credentialLabel').textContent=mode==='parent'?'家長密碼':'iPad 配對碼';$('credential').type=mode==='parent'?'password':'text';$('credential').autocomplete=mode==='parent'?'current-password':'off';$('credential').value='';$('setupFields').hidden=true;}
 if(b.classList.contains('removeReward')){b.closest('.rewardRow').remove();dirty=true;}
 const action=b.dataset.action,id=b.dataset.id;if(!action)return;
 const mapping={submit:['/submit',{taskId:id}],redeem:['/redeem',{rewardId:id}],approve:['/review',{id,decision:'approve'}],retry:['/review',{id,decision:'retry'}],'reward-approve':['/review-reward',{id,decision:'approve'}],'reward-decline':['/review-reward',{id,decision:'decline'}]};
 b.disabled=true;try{await act(...mapping[action]);}finally{if(b.isConnected)b.disabled=false;}
});
$('authForm').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;try{const password=$('credential').value;const r=await request(mode==='setup'?'/setup':mode==='parent'?'/login':'/pair',mode==='setup'?{password,setupKey:$('setupKey').value}:mode==='parent'?{password}:{code:password});saveToken(r.token);$('credential').value='';$('setupKey').value='';notify('');await refresh();}catch(e){notify(e.message);}finally{busy=false;}};
$('setupMode').onclick=()=>{mode='setup';$('credentialLabel').textContent='建立家長密碼（最少 12 個字元）';$('credential').type='password';$('credential').autocomplete='new-password';$('setupFields').hidden=false;};
$('settings').oninput=()=>dirty=true;
$('settings').onsubmit=async e=>{e.preventDefault();const points=state.tasks.map(t=>Number($('points'+t.id).value));const rewards=[...document.querySelectorAll('.rewardRow')].map(el=>({id:el.dataset.id,title:el.querySelector('.rewardTitle').value,cost:Number(el.querySelector('.rewardCost').value)}));const result=await act('/settings',{points,rewards,revision:settingsRevision});if(result){dirty=false;render();}};
$('addReward').onclick=()=>{if(document.querySelectorAll('.rewardRow').length>=12){notify('最多可設定 12 個獎勵');return;}dirty=true;addReward();};
$('pairCode').onclick=async()=>{const r=await act('/pair-code',{});if(r)$('code').textContent=r.code;};
$('revoke').onclick=async()=>{if(confirm('要取消所有已配對 iPad 的存取嗎？之後可以重新配對。'))await act('/revoke-child',{});};
$('refresh').onclick=()=>refresh();
$('logout').onclick=async()=>{const r=await act('/logout',{});if(r){saveToken('');state=null;dirty=false;$('coins').textContent='—';showAuth();}};
if(!api){$('offline').hidden=false;$('connection').textContent='雲端尚未啟用';}else if(!/^https:\/\//.test(api)&&!/^http:\/\/localhost[:/]/.test(api)){$('offline').hidden=false;$('connection').textContent='連接設定需要 HTTPS';}else if(authToken){refresh();}else{showAuth();$('connection').textContent='請登入或配對';}
setInterval(()=>{if(authToken&&!document.hidden&&!busy&&!dirty)refresh();},15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&authToken&&!busy&&!dirty)refresh();});
