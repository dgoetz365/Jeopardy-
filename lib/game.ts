export type Clue={id:string;category:string;value:number;question:string;answer:string;source:string};
export type Bank={rounds:Clue[][];final:{category:string;question:string;answer:string;source:string}};
export type Player={id:string;userId:string;name:string;avatar:number;score:number;ready:boolean;wager:number|null;response:string|null;judgment:boolean|null;before:number};
export type Phase='lobby'|'board'|'clue'|'answer'|'finalWager'|'finalClue'|'finalReveal'|'results';
export type Game={code:string;hostId:string;hostName:string;players:Player[];bank:Bank;phase:Phase;round:number;used:string[];active:string|null;buzz:string|null;attempted:string[];buzzOpen:boolean;endsAt:number|null;pausedMs:number|null;history:any[];createdAt:number};
export type Action={type:string;[key:string]:any};
export const AVATARS=['⚾','🧢','🏟️','⭐','🎧','🎬','🌍','🎯'];
export function blankBank():Bank{
 const names=[['2026','Sound Check','Around the World','Mets Easter Eggs','Name the Year','The Missing Piece'],['Behind the Brand','Double Takes','Flagged for Review','How Many?!','The Connection','Wrong Answers Only']];
 return {rounds:names.map((cats,r)=>cats.flatMap((category,c)=>Array.from({length:5},(_,v)=>({id:r+'-'+c+'-'+v,category,value:(v+1)*(r?400:200),question:'',answer:'',source:''})))),final:{category:'2026',question:'',answer:'',source:''}};
}
export function practiceBank():Bank{const b=blankBank();b.rounds.forEach(r=>r.forEach(c=>{c.question='Question goes here';c.answer='Correct response goes here';}));b.final.question='Final clue goes here';b.final.answer='Correct response goes here';return b;}
export function validateBank(input:any):Bank{
 if(!input||!Array.isArray(input.rounds)||input.rounds.length!==2||!input.final)throw new Error('Use a question file containing two rounds and one final.');
 const text=(v:any,max:number)=>{if(typeof v!=='string'||v.length>max)throw new Error('Question text is missing or too long.');return v.trim();};
 const rounds=input.rounds.map((round:any,r:number)=>{
  if(!Array.isArray(round)||round.length!==30)throw new Error('Each round needs six categories with five clue slots.');
  return round.map((c:any,i:number)=>({id:r+'-'+Math.floor(i/5)+'-'+i%5,category:text(c.category,50),value:(i%5+1)*(r?400:200),question:text(c.question,1200),answer:text(c.answer,600),source:text(c.source||'',500)}));
 });
 for(const round of rounds)for(let c=0;c<6;c++){const name=round[c*5].category;if(!name||round.slice(c*5,c*5+5).some((x:Clue)=>x.category!==name))throw new Error('Each category needs one consistent name.');}
 return {rounds,final:{category:text(input.final.category,50),question:text(input.final.question,1200),answer:text(input.final.answer,600),source:text(input.final.source||'',500)}};
}
export const completeClue=(c:{question:string;answer:string})=>!!(c.question.trim()&&c.answer.trim());
export function newGame(code:string,userId:string,hostName='Daniel',now=Date.now()):Game{return {code,hostId:userId,hostName,players:[],bank:blankBank(),phase:'lobby',round:0,used:[],active:null,buzz:null,attempted:[],buzzOpen:false,endsAt:null,pausedMs:null,history:[],createdAt:now};}
export function activeClue(g:Game){return g.bank.rounds[g.round]?.find(c=>c.id===g.active);}
function fail(message:string):never{throw new Error(message);}
function snapshot(g:Game){g.history.push({players:g.players.map(p=>({id:p.id,score:p.score,judgment:p.judgment})),phase:g.phase,used:[...g.used],buzz:g.buzz,attempted:[...g.attempted],buzzOpen:g.buzzOpen,endsAt:g.endsAt,pausedMs:g.pausedMs});if(g.history.length>12)g.history.shift();}
export function act(original:Game,action:Action,userId:string,now=Date.now()):Game{
 const g:Game=structuredClone(original);const isHost=userId===g.hostId;const me=g.players.find(p=>p.userId===userId);
 const host=()=>{if(!isHost)fail('Only the host can do that.');};
 switch(action.type){
 case 'join':{
  if(isHost)fail('The host uses the host controls.');if(me)return g;
  if(g.phase!=='lobby')fail('This game has started. Ask the host to create another room.');if(g.players.length>=24)fail('This room is full.');
  const name=String(action.name||'').trim();if(name.length<1||name.length>32)fail('Enter a name up to 32 characters.');
  if(g.players.some(p=>p.name.toLowerCase()===name.toLowerCase()))fail('That name is taken. Add an initial.');
  g.players.push({id:crypto.randomUUID(),userId,name,avatar:Math.max(0,Math.min(7,Math.floor(Number(action.avatar)||0))),score:0,ready:false,wager:null,response:null,judgment:null,before:0});break;
 }
 case 'ready':if(!me||g.phase!=='lobby')fail('Join the lobby first.');me.ready=!me.ready;break;
 case 'saveBank':host();if(g.phase!=='lobby')fail('Questions can only change before the game starts.');g.bank=validateBank(action.bank);break;
 case 'remove':host();if(g.phase!=='lobby')fail('Players can only be removed in the lobby.');g.players=g.players.filter(p=>p.id!==action.playerId);break;
 case 'start':host();if(g.phase!=='lobby')fail('The game has already started.');if(!g.players.length)fail('Wait for at least one player.');if(g.bank.rounds.some(r=>!r.some(completeClue))||!completeClue(g.bank.final))fail('Add at least one clue and answer to each round, plus Final Jeopardy.');g.phase='board';break;
 case 'select':host();if(g.phase!=='board')fail('Return to the board first.');if(g.used.includes(action.clueId))fail('That clue has already been played.');{
  const c=g.bank.rounds[g.round]?.find(c=>c.id===action.clueId);if(!c||!completeClue(c))fail('Add a question and answer for this clue.');g.active=c.id;g.phase='clue';g.buzz=null;g.attempted=[];g.buzzOpen=false;g.endsAt=null;g.pausedMs=null;g.history=[];break;}
 case 'openBuzzers':host();if(g.phase!=='clue'||g.buzz)fail('Finish the current response first.');g.buzzOpen=true;g.endsAt=now+20000;g.pausedMs=null;break;
 case 'buzz':if(!me||g.phase!=='clue'||!g.buzzOpen||g.buzz||!g.endsAt||now>=g.endsAt||g.attempted.includes(me.id))fail('The buzzer is closed.');g.buzz=me.id;g.buzzOpen=false;g.pausedMs=Math.max(0,g.endsAt-now);g.endsAt=null;break;
 case 'pause':host();if(!['clue','finalClue'].includes(g.phase)||!g.endsAt)fail('No timer is running.');g.pausedMs=Math.max(0,g.endsAt-now);g.endsAt=null;g.buzzOpen=false;break;
 case 'resume':host();if(!['clue','finalClue'].includes(g.phase)||g.pausedMs===null||g.buzz)fail('No timer can be resumed.');g.endsAt=now+g.pausedMs;g.pausedMs=null;g.buzzOpen=g.phase==='clue';break;
 case 'score':host();if(g.phase!=='clue'||!g.buzz)fail('Wait for a player to buzz in.');{
  const p=g.players.find(p=>p.id===g.buzz)!;const c=activeClue(g)!;snapshot(g);p.score+=action.correct?c.value:-c.value;g.attempted.push(p.id);g.buzz=null;
  if(action.correct){g.phase='answer';g.used.push(c.id);g.buzzOpen=false;g.endsAt=null;g.pausedMs=null;}
  else{g.buzzOpen=true;g.endsAt=now+Math.max(5000,g.pausedMs||0);g.pausedMs=null;}break;}
 case 'reveal':host();if(g.phase!=='clue')fail('Select a clue first.');g.phase='answer';if(g.active&&!g.used.includes(g.active))g.used.push(g.active);g.buzz=null;g.buzzOpen=false;g.endsAt=null;g.pausedMs=null;break;
 case 'board':host();if(g.phase!=='answer')fail('Reveal the answer before returning to the board.');g.phase='board';g.active=null;g.history=[];break;
 case 'nextRound':host();if(g.phase!=='board')fail('Return to the board first.');g.history=[];g.active=null;if(g.round===0)g.round=1;else{g.round=2;g.phase='finalWager';g.players.forEach(p=>{p.before=p.score;p.wager=p.score>0?null:0;p.response=null;p.judgment=p.score>0?null:false;});}break;
 case 'wager':if(!me||g.phase!=='finalWager'||me.before<=0)fail('You cannot wager right now.');if(me.wager!==null)fail('Your wager is already locked.');{
  const n=Number(action.amount);if(!Number.isInteger(n)||n<0||n>me.before)fail('Enter a whole-number wager from 0 to '+me.before+'.');me.wager=n;break;}
 case 'beginFinal':host();if(g.phase!=='finalWager')fail('Wagering has ended.');if(g.players.some(p=>p.wager===null)&&!action.force)fail('Wait for all wagers or continue with $0 for missing wagers.');g.players.forEach(p=>{if(p.wager===null)p.wager=0;});g.phase='finalClue';g.endsAt=now+30000;g.pausedMs=null;break;
 case 'submitFinal':if(!me||g.phase!=='finalClue'||!g.endsAt||now>=g.endsAt||me.before<=0)fail('Final answering is closed.');if(me.response!==null)fail('Your response is already locked.');{const s=String(action.response||'').trim();if(!s||s.length>600)fail('Enter a response up to 600 characters.');me.response=s;break;}
 case 'endFinal':host();if(g.phase!=='finalClue')fail('Final Jeopardy has not started.');g.phase='finalReveal';g.endsAt=null;g.pausedMs=null;break;
 case 'judgeFinal':host();if(g.phase!=='finalReveal')fail('Reveal Final Jeopardy first.');{const p=g.players.find(p=>p.id===action.playerId);if(!p||p.before<=0)fail('This player was not eligible for Final Jeopardy.');snapshot(g);p.judgment=!!action.correct;p.score=p.before+(action.correct?1:-1)*(p.wager||0);break;}
 case 'finish':host();if(g.phase!=='finalReveal'||g.players.some(p=>p.judgment===null))fail('Score every final response first.');g.phase='results';g.history=[];break;
 case 'undo':host();{const s=g.history.pop();if(!s)fail('No score to undo.');g.players.forEach(p=>{const prev=s.players.find((x:any)=>x.id===p.id);if(prev){p.score=prev.score;p.judgment=prev.judgment;}});for(const key of ['phase','used','buzz','attempted','buzzOpen','endsAt','pausedMs'])(g as any)[key]=s[key];if(g.endsAt&&g.endsAt<now)g.endsAt=now+5000;break;}
 default:fail('Unknown action.');
 }return g;
}
export function viewGame(g:Game,userId:string,now=Date.now()){
 const host=g.hostId===userId,me=g.players.find(p=>p.userId===userId);if(!host&&!me)fail('Join this room to view it.');
 const revealed=['finalReveal','results'].includes(g.phase);const clue=activeClue(g);
 return {code:g.code,hostName:g.hostName,isHost:host,myId:me?.id||null,phase:g.phase,round:g.round,used:g.used,active:g.active,buzz:g.buzz,attempted:g.attempted,buzzOpen:g.buzzOpen,endsAt:g.endsAt,pausedMs:g.pausedMs,serverNow:now,canUndo:host&&g.history.length>0,
 players:g.players.map(p=>({id:p.id,name:p.name,avatar:p.avatar,score:p.score,ready:p.ready,before:p.before,wager:(revealed||p.id===me?.id)?p.wager:null,wagerLocked:p.wager!==null,response:(revealed||p.id===me?.id)?p.response:null,submitted:p.response!==null,judgment:revealed?p.judgment:null})),
 bank:host?g.bank:undefined,
 boards:g.bank.rounds.map(r=>r.map(c=>({id:c.id,category:c.category,value:c.value,available:completeClue(c)}))),
 clue:clue?{id:clue.id,category:clue.category,value:clue.value,question:clue.question,answer:host||g.phase==='answer'?clue.answer:null,source:host||g.phase==='answer'?clue.source:null}:null,
 final:{category:g.bank.final.category,question:host||['finalClue','finalReveal','results'].includes(g.phase)?g.bank.final.question:null,answer:host||revealed?g.bank.final.answer:null,source:host||revealed?g.bank.final.source:null}};
}
