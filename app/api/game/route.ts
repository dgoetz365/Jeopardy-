import { starterBank,fillStarterQuestions } from '@/lib/starter-bank';
import { env } from 'cloudflare:workers';
import { act,newGame,viewGame,type Game } from '@/lib/game';
import { digest,getSession,HttpError,issueSession,passwordValid,rateLimit,readAction,sessionCookie } from '@/lib/auth';
export const dynamic='force-dynamic';
function json(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
function storage(){if(!env.DB)throw new HttpError(503,'Game storage is unavailable.');return env.DB;}
function failure(error:unknown){
 if(error instanceof HttpError){const r=json({error:error.message},error.status);if(error.retryAfter)r.headers.set('Retry-After',String(error.retryAfter));return r;}
 // Database and runtime errors must not expose implementation details.
 console.error('Game request failed.');return json({error:'Game storage is temporarily unavailable. Please retry.'},503);
}
async function room(db:D1Database,code:string){
 if(!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(code))throw new HttpError(400,'Enter a six-character room code.');
 const row=await db.prepare('SELECT state,version FROM rooms WHERE code=?').bind(code).first<{state:string;version:number}>();
 if(!row)throw new HttpError(404,'Room not found. Check the code with your host.');return {game:JSON.parse(row.state) as Game,version:row.version};
}
function gameAction(game:Game,action:Parameters<typeof act>[1],id:string){try{return act(game,action,id);}catch(e){throw new HttpError(400,(e as Error).message);}}
const guestActions=new Set(['ready','buzz','wager','submitFinal']);
export async function GET(req:Request){try{
 const db=storage();const ip=await digest(req.headers.get('CF-Connecting-IP')||'local');await rateLimit(db,'read-ip:'+ip,3000,60);
 const session=await getSession(db,req);if(!session)throw new HttpError(401,'Your session has ended. Join a room or host a new game.');
 await rateLimit(db,'read:'+session.user_id,240,60);
 const {game,version}=await room(db,new URL(req.url).searchParams.get('code')||'');
 if(game.hostId!==session.user_id&&!game.players.some(p=>p.userId===session.user_id))throw new HttpError(403,'Join this room to view it.');
 return json({...viewGame(game,session.user_id),version});
}catch(e){return failure(e);}}
export async function POST(req:Request){try{
 const db=storage();const ip=await digest(req.headers.get('CF-Connecting-IP')||'local');await rateLimit(db,'write-ip:'+ip,1000,60);
 const action=await readAction(req);let session=await getSession(db,req);
 if(action.type==='logout'){
  if(session)await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(session.token_hash).run();
  const response=json({ok:true});response.headers.set('Set-Cookie',sessionCookie(req,'',0));return response;
 }
 if(action.type==='hostLogin'){
  await rateLimit(db,'host-attempt:'+ip,10,900);
  if(!await passwordValid(action.password,env.HOST_PASSWORD))throw new HttpError(403,'Invalid host password.');
  // Only rooms created before public one-click hosting used this shared host ID.
  const {game,version}=await room(db,String(action.code||'').toUpperCase());
  const legacyHostId='host:'+await digest(env.HOST_PASSWORD!);
  if(game.hostId!==legacyHostId)throw new HttpError(403,'This host cannot access that room.');
  const issued=await issueSession(db,'host');issued.session.user_id=legacyHostId;
  await db.prepare('UPDATE sessions SET user_id=? WHERE token_hash=?').bind(issued.session.user_id,issued.session.token_hash).run();
  if(session)await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(session.token_hash).run();
  const response=json({...viewGame(game,issued.session.user_id),version});response.headers.set('Set-Cookie',sessionCookie(req,issued.token,issued.maxAge));return response;
 }
 if(action.type==='create'){
  // Anyone can create a room; only the browser holding its opaque host session
  // can control it. Atomic limits prevent easy room-creation spam.
  await rateLimit(db,'room-create-burst:'+ip,3,600);
  await rateLimit(db,'room-create-day:'+ip,12,86400);
  const previousSession=session;
  const issued=session?.role==='host'?null:await issueSession(db,'host');
  const hostSession=issued?.session||session!;
  const letters='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for(let attempt=0;attempt<4;attempt++){
   const code=Array.from(crypto.getRandomValues(new Uint8Array(6)),n=>letters[n%letters.length]).join('');const game=newGame(code,hostSession.user_id,'Host');game.bank=starterBank();
   const result=await db.prepare('INSERT OR IGNORE INTO rooms (code,host_id,state,version,updated_at) VALUES (?,?,?,0,?)').bind(code,hostSession.user_id,JSON.stringify(game),Date.now()).run();
   if(result.meta.changes){
    if(previousSession&&issued)await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(previousSession.token_hash).run();
    const response=json({...viewGame(game,hostSession.user_id),version:0});
    if(issued)response.headers.set('Set-Cookie',sessionCookie(req,issued.token,issued.maxAge));
    return response;
   }
  }
  if(issued)await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(issued.session.token_hash).run();
  throw new HttpError(409,'Could not create a room. Try again.');
 }
 const code=String(action.code||'').toUpperCase();
 if(action.type==='join'){
  await rateLimit(db,'join:'+ip,30,60);
  if(session?.role==='host')throw new HttpError(400,'This browser is hosting a game. Join as a player from another browser or device.');
  // Reuse only a valid server-side guest session so refresh/rejoin cannot create
  // duplicate players and a caller-supplied cookie cannot fix an identity.
  const issued=session?.role==='guest'?null:await issueSession(db,'guest');session=issued?.session||session;
  if(!session)throw new HttpError(401,'Join the room again.');
  for(let retry=0;retry<32;retry++){
   const {game,version}=await room(db,code);const next=gameAction(game,action,session.user_id);
   const updated=await db.prepare('UPDATE rooms SET state=?,version=version+1,updated_at=? WHERE code=? AND version=?').bind(JSON.stringify(next),Date.now(),code,version).run();
   if(updated.meta.changes){const response=json({...viewGame(next,session.user_id),version:version+1});if(issued)response.headers.set('Set-Cookie',sessionCookie(req,issued.token,issued.maxAge));return response;}
  }throw new HttpError(409,'Room busy. Please try again.');
 }
 if(!session)throw new HttpError(401,'Your session has ended. Join a room or host a new game.');
 await rateLimit(db,'action:'+session.user_id,120,60);
 for(let retry=0;retry<32;retry++){
  const {game,version}=await room(db,code);
  const host=session.role==='host'&&session.user_id===game.hostId;
  if(!guestActions.has(action.type)&&!host)throw new HttpError(403,'Only the host can do that.');
  if(!host&&!game.players.some(p=>p.userId===session.user_id))throw new HttpError(403,'Join this room first.');
  if(host&&action.version!==version)throw new HttpError(409,'The room changed. Refresh and try that action again.');
  const effectiveAction=action.type==='fillStarter'?{type:'saveBank',bank:fillStarterQuestions(game.bank)}:action;
  const next=gameAction(game,effectiveAction,session.user_id);
  const updated=await db.prepare('UPDATE rooms SET state=?,version=version+1,updated_at=? WHERE code=? AND version=?').bind(JSON.stringify(next),Date.now(),code,version).run();
  if(updated.meta.changes)return json({...viewGame(next,session.user_id),version:version+1});
 }throw new HttpError(409,'The room is busy. Try again.');
}catch(e){return failure(e);}}
