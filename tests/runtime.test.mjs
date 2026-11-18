import {Miniflare} from 'miniflare';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {newGame,practiceBank} from '../lib/game.ts';
const root=resolve('dist/server');
const paths=(await readdir(root,{recursive:true})).filter(p=>p.endsWith('.js')||p.endsWith('.mjs')).sort((a,b)=>a==='index.js'?-1:b==='index.js'?1:a.localeCompare(b));
const modules=await Promise.all(paths.map(async path=>({type:'ESModule',path:resolve(root,path),contents:await readFile(resolve(root,path),'utf8')})));
const password=randomBytes(32).toString('base64url'); // Ephemeral test-only credential.
const mf=new Miniflare({modules,modulesRoot:root,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'test-game'},bindings:{HOST_PASSWORD:password},cf:false});
const jars={};let groups=0;
function passed(label){groups++;console.log('PASS '+label);}
async function request(who,method,body,options={}){
 const headers={'Content-Type':'application/json',Origin:'https://game.test','CF-Connecting-IP':options.ip||'192.0.2.1',...(jars[who]?{Cookie:jars[who]}:{}),...options.headers};
 const r=await mf.dispatchFetch('https://game.test/api/game'+(method==='GET'?'?code='+body:''),{method,headers,...(method==='POST'?{body:options.raw??JSON.stringify(body)}:{})});
 const setCookie=r.headers.get('set-cookie');if(setCookie)jars[who]=setCookie.split(';')[0];
 return {status:r.status,body:await r.json(),cookie:setCookie,retryAfter:r.headers.get('retry-after')};
}
const post=(who,body,options)=>request(who,'POST',body,options);
const get=(who,code,options)=>request(who,'GET',code,options);
try{
 const db=await mf.getD1Database('DB');
 for(const file of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort()){
  for(const statement of (await readFile('drizzle/'+file,'utf8')).split(';').map(s=>s.replaceAll('--> statement-breakpoint','').trim()).filter(Boolean))await db.prepare(statement).run();
 }
 const legacyCode='LEGAC2',legacyId='host:'+createHash('sha256').update(password).digest('hex');
 await db.prepare('INSERT INTO rooms (code,host_id,state,version,updated_at) VALUES (?,?,?,0,?)').bind(legacyCode,legacyId,JSON.stringify(newGame(legacyCode,legacyId)),Date.now()).run();
 assert.equal((await post('forged',{type:'hostLogin',code:legacyCode},{headers:{'oai-authenticated-user-id':'test-host','oai-authenticated-user-email':'dgoetz@nymets.com'}})).status,403);
 assert.equal((await post('anonymous',{type:'hostLogin',code:legacyCode,password:'wrong'})).status,403);
 assert.equal((await post('anonymous',{type:'create'},{headers:{Origin:'https://evil.test'}})).status,403);
 assert.equal((await post('anonymous',{type:'create'},{headers:{Origin:''}})).status,403);
 assert.equal((await post('anonymous',{type:'create'},{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
 assert.equal((await post('anonymous',{type:'create'},{headers:{'Content-Type':'text/plain'}})).status,415);
 assert.equal((await post('anonymous',{}, {raw:'{'})).status,400);
 assert.equal((await post('anonymous',{}, {raw:'null'})).status,400);
 assert.equal((await post('anonymous',{}, {raw:'x'.repeat(150001)})).status,413);
 passed('forged identity headers cannot restore a legacy host; CSRF, content type and malformed bodies rejected');
 let r=await post('host',{type:'create'});assert.equal(r.status,200,JSON.stringify(r));const code=r.body.code;
 assert(r.cookie.includes('__Host-mets_session='));for(const flag of ['HttpOnly','SameSite=Strict','Path=/','Max-Age=28800','Secure'])assert(r.cookie.includes(flag));
 assert(r.body.isHost);assert.equal(r.body.bank.rounds.flat().filter(c=>c.question.trim()&&c.answer.trim()).length,60);
 assert.equal(new Set(r.body.bank.rounds.flat().map(c=>c.id)).size,60);
 assert.deepEqual(r.body.bank.rounds.map(round=>[...new Set(round.map(c=>c.category))]),[
  ['2026','Sound Check','Around the World','Mets Easter Eggs','Name the Year','The Missing Piece'],
  ['Behind the Brand','Double Takes','Flagged for Review','How Many?!','The Connection','Wrong Answers Only'],
 ]);
 assert.equal(r.body.bank.final.category,'AI Model Names');
 assert.match(r.body.bank.final.question,/Gemini 2\.5 Flash Image/);
 assert.equal(r.body.bank.final.answer,'Nano Banana');
 assert.equal((await get('anonymous',code)).status,401);
 jars.forged='__Host-mets_session='+'a'.repeat(64);assert.equal((await get('forged',code)).status,401);
 assert.equal((await post('host',{type:'join',code,name:'Oops'})).status,400);
 assert.equal((await get('host',code)).status,200);
 passed('one-click room creation, secure host cookie, all selected clues and opaque server sessions');
 const joined=await Promise.all(['kayla','hoa'].map(who=>post(who,{type:'join',code,name:who,avatar:2,userId:'host',isHost:true})));
 assert(joined.every(x=>x.status===200),JSON.stringify(joined));assert(joined.every(x=>!x.body.isHost&&x.body.bank===undefined));
 const kaylaId=joined[0].body.myId;const kaylaCookie=jars.kayla;
 r=await post('kayla',{type:'join',code,name:'kayla'});assert.equal(r.status,200);assert.equal(r.body.myId,kaylaId);assert.equal(jars.kayla,kaylaCookie);assert.equal(r.body.players.length,2);
 assert.equal((await post('duplicate',{type:'join',code,name:'KAYLA'})).status,400);
 passed('concurrent anonymous joins, server-assigned identities, duplicate-name rejection and session resumption');
 async function host(type,extra={}){const current=await get('host',code);const res=await post('host',{type,code,version:current.body.version,...extra});assert.equal(res.status,200,JSON.stringify(res));return res.body;}
 for(const type of ['fillStarter','saveBank','start','select','openBuzzers','score','reveal','board','nextRound','beginFinal','endFinal','judgeFinal','finish','undo','pause','resume','remove'])assert.equal((await post('kayla',{type,code,version:0,isHost:true,bank:practiceBank()})).status,403,type);
 const forged=await post('forged',{type:'create',isHost:true},{headers:{'oai-authenticated-user-id':'test-host'}});assert.equal(forged.status,200);assert.equal((await get('forged',code)).status,403);
 const other=await post('otherHost',{type:'create'});assert.equal(other.status,200);
 const hostCookie=jars.host;const secondRoom=await post('host',{type:'create'},{ip:'192.0.2.3'});assert.equal(secondRoom.status,200);assert.equal(secondRoom.cookie,null);assert.equal(jars.host,hostCookie);assert.equal((await get('host',code)).status,200);
 assert.equal((await get('kayla',other.body.code)).status,403);
 assert.equal((await post('kayla',{type:'ready',code:other.body.code})).status,403);
 passed('every host command denied to guests and cross-room access rejected');
 const legacy=structuredClone((await get('host',code)).body.bank);
 legacy.rounds.forEach(round=>round.forEach((clue,i)=>{if(i%5>=2)Object.assign(clue,{question:'',answer:'',source:''});}));
 legacy.rounds[0][0].question='My edited opening clue';legacy.rounds[0][0].answer='My answer';
 await host('saveBank',{bank:legacy});const expanded=await host('fillStarter');
 assert.equal(expanded.bank.rounds.flat().filter(c=>c.question.trim()&&c.answer.trim()).length,60);
 assert.equal(expanded.bank.rounds[0][0].question,'My edited opening clue');assert.equal(expanded.bank.rounds[0][0].answer,'My answer');
 assert.equal(new Set(expanded.bank.rounds.flat().map(c=>c.question)).size,60);
 assert(expanded.bank.final.question.trim()&&expanded.bank.final.answer.trim());
 for(const round of expanded.bank.rounds){const categories=new Map();for(const clue of round)categories.set(clue.category,(categories.get(clue.category)||0)+1);assert.equal(categories.size,6);assert([...categories.values()].every(count=>count===5));}
 passed('all 61 slots populated; existing 25-question rooms expanded without replacing host edits');
 await host('saveBank',{bank:practiceBank()});const retained=await host('fillStarter');assert.equal(retained.bank.rounds[0][0].question,'Question goes here');await host('start');
 assert.equal((await post('late',{type:'join',code,name:'late'})).status,400);
 await host('select',{clueId:'0-0-1'});
 let playerView=(await get('kayla',code)).body;assert.equal(playerView.clue.answer,null);assert.equal(playerView.bank,undefined);assert.equal(playerView.final.question,null);assert(!JSON.stringify(playerView).includes('userId'));
 assert.equal((await post('kayla',{type:'buzz',code})).status,400);
 await host('openBuzzers');
 const attempts=await Promise.all([post('kayla',{type:'buzz',code}),post('hoa',{type:'buzz',code})]);assert.deepEqual(attempts.map(x=>x.status).sort(),[200,400]);
 const before=(await get('host',code)).body;assert(before.buzz);const scoring={type:'score',correct:true,code,version:before.version};r=await post('host',scoring);assert.equal(r.status,200);assert.equal((await post('host',scoring)).status,409);assert.equal(r.body.players.reduce((s,p)=>s+p.score,0),400);
 const firstWinner=r.body.players.find(p=>p.score>0).name;const secondWinner=firstWinner==='kayla'?'hoa':'kayla';
 passed('hidden answers, closed buzzers, simultaneous buzzer winner, duplicate scoring and late-join rejection');
 await host('board');await host('nextRound');await host('select',{clueId:'1-0-1'});await host('openBuzzers');assert.equal((await post(secondWinner,{type:'buzz',code})).status,200);await host('score',{correct:true});await host('board');await host('nextRound');
 const finalState=(await get('host',code)).body;assert.equal(finalState.phase,'finalWager');assert.equal(finalState.round,2);
 for(const who of ['kayla','hoa'])assert.equal((await post(who,{type:'wager',code,amount:200})).status,200);
 assert.equal((await post('kayla',{type:'wager',code,amount:0})).status,400);
 assert((await get('host',code)).body.players.every(p=>p.wager===null));assert.equal((await get('kayla',code)).body.players.find(p=>p.name==='hoa').wager,null);
 await host('beginFinal');await host('pause');assert.equal((await post('kayla',{type:'submitFinal',code,response:'Too early'})).status,400);await host('resume');
 for(const who of ['kayla','hoa'])assert.equal((await post(who,{type:'submitFinal',code,response:'Private '+who})).status,200);
 assert.equal((await post('kayla',{type:'submitFinal',code,response:'Overwrite'})).status,400);
 assert((await get('host',code)).body.players.every(p=>p.response===null));assert.equal((await get('kayla',code)).body.players.find(p=>p.name==='hoa').response,null);
 await host('endFinal');
 for(const p of finalState.players)await host('judgeFinal',{playerId:p.id,correct:p.name===firstWinner});
 const results=await host('finish');assert.equal(results.phase,'results');assert.equal(results.players.find(p=>p.name===firstWinner).score,600);assert.equal(results.players.find(p=>p.name===secondWinner).score,600);
 assert.equal((await get('kayla',code)).body.phase,'results');
 passed('both playable rounds, private locked wagers and responses, timer pause, final grading and tied results');
 const staleCookie=jars.host;await post('host',{type:'logout'});assert.equal((await get('host',code)).status,401);jars.replay=staleCookie;assert.equal((await get('replay',code)).status,401);
 assert.equal((await post('host',{type:'hostLogin',code,password})).status,403,'The old shared password must not take over new rooms');
 r=await post('host',{type:'hostLogin',code:legacyCode,password});assert.equal(r.status,200);assert.notEqual(jars.host,staleCookie);assert(r.body.isHost);
 assert.equal((await get('host',code)).status,403);
 await db.prepare("UPDATE sessions SET expires_at=0 WHERE role='host'").run();assert.equal((await get('host',code)).status,401);
 assert.equal((await post('host',{type:'hostLogin',code:legacyCode,password})).status,200);
 passed('logout revocation, replay rejection, expiry, legacy host recovery and no shared-password access to new rooms');
 for(let i=0;i<10;i++)assert.equal((await post('attacker',{type:'hostLogin',code:legacyCode,password:'wrong'},{ip:'192.0.2.99'})).status,403);
 const limited=await post('attacker',{type:'hostLogin',code:legacyCode,password},{ip:'192.0.2.99'});assert.equal(limited.status,429);assert(Number(limited.retryAfter)>0);
 // Parallel requests cannot bypass the atomic database-backed limiter.
 const burst=await Promise.all(Array.from({length:15},()=>post('burst',{type:'hostLogin',code:legacyCode,password:'wrong'},{ip:'192.0.2.98'})));
 assert.equal(burst.filter(x=>x.status===403).length,10);assert.equal(burst.filter(x=>x.status===429).length,5);
 for(let i=0;i<3;i++)assert.equal((await post('creator',{type:'create'},{ip:'192.0.2.97'})).status,200);
 const createLimited=await post('creator',{type:'create'},{ip:'192.0.2.97'});assert.equal(createLimited.status,429);assert(Number(createLimited.retryAfter)>0);
 passed('legacy password brute-force and public room creation limits use atomic D1 counters');
 const fullRoom=await post('capacityHost',{type:'create'},{ip:'192.0.2.2'});assert.equal(fullRoom.status,200);
 const capacity=await Promise.all(Array.from({length:24},(_,i)=>post('player'+i,{type:'join',code:fullRoom.body.code,name:'Player '+i},{ip:'192.0.2.2'})));
 assert(capacity.every(x=>x.status===200),JSON.stringify(capacity.map(x=>({status:x.status,error:x.body.error}))));
 assert.equal((await get('capacityHost',fullRoom.body.code)).body.players.length,24);
 assert.equal((await post('overflow',{type:'join',code:fullRoom.body.code,name:'Overflow'},{ip:'192.0.2.2'})).status,400);
 passed('24 simultaneous players retained without lost updates; room capacity enforced');
 const clientFiles=(await readdir('dist/client',{recursive:true})).filter(p=>p.endsWith('.js'));for(const file of clientFiles){const js=await readFile('dist/client/'+file,'utf8');assert(!js.includes('Nano Banana'),'Final answer must not ship in public JavaScript');assert(!js.includes('The 2026 FIFA World Cup expanded'),'Board answers must not ship in public JavaScript');}
 const home=await mf.dispatchFetch('https://game.test/');assert.equal(home.status,200);assert.equal(home.headers.get('X-Frame-Options'),'DENY');
 const homeHtml=await home.text();assert(homeHtml.includes('METS'));assert(homeHtml.includes('Host a game'));assert(!homeHtml.includes('Host password'));assert(!homeHtml.includes('THU, NOV 19'));assert(!homeHtml.includes('Conference Room Hernandez'));
 const clientText=await Promise.all(clientFiles.map(file=>readFile('dist/client/'+file,'utf8')));
 assert(!clientText.some(js=>js.includes('Choose your icon')||js.includes('avatar-picker')),'Guest UI must not offer decorative player icons');
 for(const asset of ['citi-field.jpg','mr-and-mrs-met.jpg','mets-logo.svg'])assert((await readFile('dist/client/images/'+asset)).length>1000);
 passed('anonymous home rendering and both original real photo assets packaged');
 console.log(JSON.stringify({runtime:'production Cloudflare Worker + isolated D1',integrationGroups:groups,result:'passed'}));
}finally{await mf.dispose();}
