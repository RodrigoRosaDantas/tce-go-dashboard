const NAPI="https://api.notion.com/v1",NVER="2026-03-11";
const DAYS="a1075521-857b-4e1e-8fb2-849b51fdccc0",SESSIONS="f70b8e2d-31cc-4a26-9c06-9d0a9fe69de0";
const ORIGINS=new Set(["https://rodrigorosadantas.github.io","http://localhost:3000","http://localhost:4173"]);
const TYPES=new Set(["progress.snapshot","questions.result","day.completed","day.reopened","review.snapshot","simulation.result","essay.result"]);

Deno.serve(async req=>{
  const cors=corsHeaders(req);
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  try{
    const user=await currentUser(req);
    if(!user||!(await allowedUser(user.id)))return json({error:"Acesso não autorizado."},403,cors);
    if(req.method==="GET"){
      const dxx=normDxx(new URL(req.url).searchParams.get("dxx"));
      if(!dxx)return json({error:"Dxx inválido."},400,cors);
      return await readState(user.id,dxx,cors);
    }
    if(req.method!=="POST")return json({error:"Método não permitido."},405,cors);
    const ev=normalize(await req.json().catch(()=>null));
    if(!ev.ok)return json({error:ev.error},400,cors);

    const old=await one("tce_progress_events",`owner_id=eq.${enc(user.id)}&idempotency_key=eq.${enc(ev.v.idempotencyKey)}`);
    const requestHash=await eventHash(ev.v);
    if(old?.request_hash&&old.request_hash!==requestHash)return json({status:"conflict",error:"Idempotency key reutilizada com evento diferente.",code:"IDEMPOTENCY_KEY_REUSED"},409,cors);
    if(old?.status==="confirmed")return json({status:"confirmed",duplicate:true,dxx:old.dxx,sxx:old.resolved_sxx,idempotencyKey:old.idempotency_key,confirmation:old.confirmation},200,cors);
    if(old?.status==="conflict")return json({status:"conflict",duplicate:true,dxx:old.dxx,sxx:old.resolved_sxx,idempotencyKey:old.idempotency_key,error:old.error_message},409,cors);
    if(old&&!old.request_hash)await patchEvent(user.id,ev.v.idempotencyKey,{request_hash:requestHash});
    if(!old)await insertEvent(user.id,ev.v,requestHash);

    const nt=Deno.env.get("TCE_GO_NOTION_TOKEN")?.trim();
    if(!nt)return json({status:"pending",canonical:false,dxx:ev.v.dxx,idempotencyKey:ev.v.idempotencyKey,message:"Pendente de sincronização com o Notion.",reason:"notion_unconfigured"},202,cors);

    const day=await resolveDay(ev.v.dxx,nt);
    if(!day){await conflict(user.id,ev.v.idempotencyKey,"DXX_NOT_FOUND","Dxx não existe no Notion.");return json({status:"conflict",error:"Dxx não existe no Notion."},409,cors);}
    if(day.protected||!day.sxx){await conflict(user.id,ev.v.idempotencyKey,"PROTECTED_DAY","Dia protegido não aceita execução TCE.",day);return json({status:"conflict",error:"Dia protegido não aceita execução TCE."},409,cors);}
    if(ev.v.sxx&&ev.v.sxx!==day.sxx){await conflict(user.id,ev.v.idempotencyKey,"DXX_SXX_CONFLICT",`Frontend enviou ${ev.v.sxx}; Notion resolve ${day.sxx}.`,day);return json({status:"conflict",error:"Conflito Dxx/Sxx. O Notion prevalece.",dxx:day.dxx,submittedSxx:ev.v.sxx,canonicalSxx:day.sxx},409,cors);}
    const refreshedBeforeRevision=old||await one("tce_progress_events",`owner_id=eq.${enc(user.id)}&idempotency_key=eq.${enc(ev.v.idempotencyKey)}`);
    const recoverablePartial=Boolean(refreshedBeforeRevision?.notion_session_page_id)&&payloadMatchesDay(ev.v.payload,day);
    if(ev.v.baseCanonicalRevision&&day.lastEditedAt&&ev.v.baseCanonicalRevision!==day.lastEditedAt&&!recoverablePartial){
      await conflict(user.id,ev.v.idempotencyKey,"CANONICAL_REVISION_CHANGED","O Dia controle mudou no Notion desde a última confirmação conhecida.",day);
      return json({status:"conflict",error:"O estado canônico mudou no Notion. Recarregue antes de salvar novamente.",dxx:day.dxx,sxx:day.sxx,canonicalRevision:day.lastEditedAt},409,cors);
    }
    if(!ev.v.baseCanonicalRevision&&day.lastEditedAt&&Date.parse(ev.v.occurredAt)<Date.parse(day.lastEditedAt)&&!recoverablePartial){
      await conflict(user.id,ev.v.idempotencyKey,"CANONICAL_REVISION_UNKNOWN","Evento offline anterior à revisão canônica atual do Notion.",day);
      return json({status:"conflict",error:"O Notion mudou depois que este evento foi criado. O evento foi preservado sem sobrescrever o estado canônico.",dxx:day.dxx,sxx:day.sxx,canonicalRevision:day.lastEditedAt},409,cors);
    }
    await patchEvent(user.id,ev.v.idempotencyKey,{resolved_sxx:day.sxx,notion_day_page_id:day.id});

    const newer=await one("tce_progress_events",`owner_id=eq.${enc(user.id)}&dxx=eq.${enc(day.dxx)}&idempotency_key=neq.${enc(ev.v.idempotencyKey)}&occurred_at=gt.${enc(ev.v.occurredAt)}&status=in.(pending,confirmed)&order=occurred_at.desc&limit=1`);
    if(newer){
      await conflict(user.id,ev.v.idempotencyKey,"SUPERSEDED_BY_NEWER_EVENT","Existe evento mais novo para o mesmo Dxx; o evento antigo foi preservado sem escrita canônica.",day);
      return json({status:"conflict",error:"Existe um evento mais novo para este Dxx. O evento anterior foi preservado e não sobrescreveu o Notion.",dxx:day.dxx,sxx:day.sxx,supersededBy:newer.idempotency_key},409,cors);
    }

    const prev=await one("tce_progress_state",`owner_id=eq.${enc(user.id)}&dxx=eq.${enc(day.dxx)}`);
    if(prev?.event_occurred_at&&Date.parse(prev.event_occurred_at)>Date.parse(ev.v.occurredAt)){
      await conflict(user.id,ev.v.idempotencyKey,"STALE_REPLAY","Replay offline mais antigo que o último estado confirmado.",day);
      return json({status:"conflict",error:"Evento antigo preservado sem regredir o Notion.",dxx:day.dxx,sxx:day.sxx,canonicalState:pub(prev,false)},409,cors);
    }

    const next=progress(ev.v.payload,day);
    const refreshed=await one("tce_progress_events",`owner_id=eq.${enc(user.id)}&idempotency_key=eq.${enc(ev.v.idempotencyKey)}`);
    let sid=refreshed?.notion_session_page_id||null;
    if(!sid){
      const existingSessions=await findNotionSessions(ev.v.idempotencyKey,nt);
      if(existingSessions.length>1){
        await conflict(user.id,ev.v.idempotencyKey,"NOTION_DUPLICATE_IDEMPOTENCY","Mais de uma sessão Notion usa a mesma idempotency key.",day);
        return json({status:"conflict",error:"Duplicidade detectada no Notion; gravação interrompida para auditoria."},409,cors);
      }
      if(existingSessions.length===1)sid=existingSessions[0].id;
      else {const created=await createSession(day,ev.v,next,nt);sid=created.id;}
      await patchEvent(user.id,ev.v.idempotencyKey,{notion_session_page_id:sid});
    }
    const updatedPage=await updateDay(day,next,nt);
    const confirmedAt=new Date().toISOString();
    const canonicalRevision=updatedPage?.last_edited_time||confirmedAt;
    const confirmation={dxx:day.dxx,sxx:day.sxx,eventType:ev.v.eventType,occurredAt:ev.v.occurredAt,confirmedAt,canonicalRevision,canonical:true};
    await patchEvent(user.id,ev.v.idempotencyKey,{status:"confirmed",resolved_sxx:day.sxx,notion_session_page_id:sid,notion_day_page_id:day.id,confirmation,confirmed_at:confirmedAt,error_code:null,error_message:null});
    await upsertState(user.id,day,next,ev.v.idempotencyKey,ev.v.occurredAt,confirmedAt,canonicalRevision);
    return json({status:"confirmed",canonical:true,dxx:day.dxx,sxx:day.sxx,idempotencyKey:ev.v.idempotencyKey,confirmation,state:next},200,cors);
  }catch(e){console.error("tce-progress",e instanceof Error?e.message:e);return json({error:"Falha segura no writeback TCE-GO."},502,cors);}
});

async function currentUser(req){
  const auth=req.headers.get("authorization")||"";
  if(!/^Bearer\s+/i.test(auth))return null;
  const base=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_ANON_KEY");
  if(!base||!key)return null;
  const r=await fetch(base+"/auth/v1/user",{headers:{apikey:key,Authorization:auth}});
  return r.ok?await r.json():null;
}
async function allowedUser(id){return Boolean(await one("tce_writeback_users",`owner_id=eq.${enc(id)}&active=eq.true`));}

function normDxx(v){v=String(v||"").toUpperCase().trim();return /^D(?:00[1-9]|0[1-9]\d|100)$/.test(v)?v:null;}
function normSxx(v){if(v==null||v==="")return null;v=String(v).toUpperCase().trim();return /^S(?:0[1-9]|[1-3]\d|4[0-7])$/.test(v)?v:"!";}
function normRevision(v){if(v==null||v==="")return null;const d=new Date(v);return Number.isNaN(d.getTime())?"!":d.toISOString();}
function uuid(v){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||""));}
function normalize(raw){
  if(!raw||typeof raw!=="object")return{ok:false,error:"Evento ausente."};
  const dxx=normDxx(raw.dxx),sxx=normSxx(raw.sxx),eventType=String(raw.eventType||"").trim(),origin=String(raw.origin||"").trim(),idempotencyKey=String(raw.idempotencyKey||"").trim(),t=new Date(raw.timestamp||raw.occurredAt||""),baseCanonicalRevision=normRevision(raw.baseCanonicalRevision);
  if(!dxx)return{ok:false,error:"Dxx inválido."};if(sxx==="!")return{ok:false,error:"Sxx inválido."};if(baseCanonicalRevision==="!")return{ok:false,error:"Revisão canônica inválida."};if(!TYPES.has(eventType))return{ok:false,error:"Tipo de evento inválido."};if(Number.isNaN(t.getTime())||t.getTime()>Date.now()+300000)return{ok:false,error:"Timestamp inválido."};if(!["tce-go-dashboard","plataforma-questoes"].includes(origin))return{ok:false,error:"Origem inválida."};if(!uuid(idempotencyKey))return{ok:false,error:"Idempotency key inválida."};
  return{ok:true,v:{dxx,sxx,eventType,origin,idempotencyKey,occurredAt:t.toISOString(),baseCanonicalRevision,payload:raw.payload&&typeof raw.payload==="object"?raw.payload:{}}};
}
const num=(v,f=0)=>{if(v==null||v==="")return f;const n=Number(v);return Number.isFinite(n)&&n>=0?Math.round(n):f;};
const bool=(v,f=false)=>typeof v==="boolean"?v:f;
function progress(p,d){const q=num(p.questionsDone,d.questionsDone),c=num(p.correct,d.correct),e=num(p.errors,d.errors),u=num(p.doubts,d.doubts);if(c+e>q)throw new Error("Acertos + erros excedem questões feitas.");if(u>c)throw new Error("Acertos com dúvida excedem acertos.");const completed=bool(p.completed,d.completed),time=num(p.timeMinutes,d.timeMinutes),studied=completed||bool(p.studied,d.studied)||time>0||q>0;return{studied,completed,timeMinutes:time,questionsDone:q,correct:c,errors:e,doubts:u,status:completed?"Concluído":studied?"Em andamento":"Não iniciado"};}

async function readState(owner,dxx,cors){
  const nt=Deno.env.get("TCE_GO_NOTION_TOKEN")?.trim();
  if(nt){const d=await resolveDay(dxx,nt);if(!d)return json({error:"Dxx não existe no Notion."},404,cors);if(d.protected)return json({dxx,sxx:null,protected:true,canonical:true,source:"notion"},200,cors);const s={owner_id:owner,dxx:d.dxx,resolved_sxx:d.sxx,studied:d.studied,completed:d.completed,time_minutes:d.timeMinutes,questions_done:d.questionsDone,correct:d.correct,errors:d.errors,doubts:d.doubts,canonical_status:d.status,last_event_key:"notion-read",confirmed_at:new Date().toISOString(),event_occurred_at:d.lastEditedAt||new Date().toISOString(),canonical_revision:d.lastEditedAt||null,updated_at:new Date().toISOString()};await stateWrite(s);return json({...pub(s,true),protected:false},200,cors);}
  const s=await one("tce_progress_state",`owner_id=eq.${enc(owner)}&dxx=eq.${enc(dxx)}`);return json(s?pub(s,false):{dxx,canonical:false,source:"cache",state:null},200,cors);
}

async function resolveDay(dxx,token){const r=await notion(`/data_sources/${DAYS}/query`,token,{method:"POST",body:JSON.stringify({page_size:2,filter:{property:"Slug",rich_text:{equals:dxx.toLowerCase()}}})});const page=r.results?.[0];if(!page)return null;const p=page.properties||{},type=txt(p,"Tipo");return{id:page.id,dxx,sxx:txt(p,"Sessão TCE")||null,type,protected:type==="Protegido",studied:check(p,"Estudado"),completed:check(p,"Concluído"),timeMinutes:nprop(p,"Tempo real (min)"),questionsDone:nprop(p,"Questões feitas"),correct:nprop(p,"Acertos"),errors:nprop(p,"Erros"),doubts:nprop(p,"Acertos com dúvida"),status:txt(p,"Status")||"Não iniciado",lastEditedAt:page.last_edited_time||null};}
async function findNotionSessions(key,token){const r=await notion(`/data_sources/${SESSIONS}/query`,token,{method:"POST",body:JSON.stringify({page_size:3,filter:{property:"Idempotency key",rich_text:{equals:key}}})});return Array.isArray(r.results)?r.results:[];}
async function createSession(d,e,p,token){const props={"Sessão":title(`${d.dxx} · ${d.sxx} · ${e.eventType}`),"Dxx":rich(d.dxx),"Sessão TCE":rich(d.sxx),"Tipo de evento":rich(e.eventType),"Timestamp":{date:{start:e.occurredAt}},"Data":{date:{start:e.occurredAt}},"Origem":rich(e.origin),"Idempotency key":rich(e.idempotencyKey),"Tipo":{select:{name:sessionType(d.type,e.eventType)}},"Tempo (min)":{number:p.timeMinutes},"Questões":{number:p.questionsDone},"Acertos":{number:p.correct},"Erros":{number:p.errors},"Acertos com dúvida":{number:p.doubts},"Observações":rich(("Evento confirmado pelo endpoint TCE-GO. "+String(e.payload.notes||"")).trim().slice(0,1200))};return notion("/pages",token,{method:"POST",body:JSON.stringify({parent:{data_source_id:SESSIONS},properties:props})});}
async function updateDay(d,p,token){return notion(`/pages/${d.id}`,token,{method:"PATCH",body:JSON.stringify({properties:{"Estudado":{checkbox:p.studied},"Concluído":{checkbox:p.completed},"Tempo real (min)":{number:p.timeMinutes},"Questões feitas":{number:p.questionsDone},"Acertos":{number:p.correct},"Erros":{number:p.errors},"Acertos com dúvida":{number:p.doubts},"Status":{select:{name:p.status}}}})});}
function sessionType(day,event){if(event==="questions.result")return"Questões";if(event==="review.snapshot")return"Revisão";if(event==="simulation.result"||day==="Simulado"||day==="Checkpoint")return"Simulado";if(event==="essay.result"||day==="Redação")return"Redação";if(day==="Correção")return"Correção";return"Teoria";}

async function notion(path,token,init={}){const h=new Headers(init.headers);h.set("Authorization",`Bearer ${token}`);h.set("Notion-Version",NVER);h.set("Content-Type","application/json");const r=await fetch(NAPI+path,{...init,headers:h});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`Notion ${r.status}: ${data?.message||"erro"}`);return data;}
function txt(p,n){const x=p?.[n];if(!x)return"";if(x.title)return x.title.map(y=>y.plain_text||"").join("").trim();if(x.rich_text)return x.rich_text.map(y=>y.plain_text||"").join("").trim();return x.select?.name||x.status?.name||"";}
function nprop(p,n){const x=p?.[n]?.number;return typeof x==="number"&&Number.isFinite(x)?x:0;}function check(p,n){return Boolean(p?.[n]?.checkbox);}
function title(v){return{title:[{type:"text",text:{content:String(v).slice(0,180)}}]};}function rich(v){return{rich_text:[{type:"text",text:{content:String(v).slice(0,1900)}}]};}

function svc(){const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!key)throw new Error("Service role indisponível.");return{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"};}
async function db(path,init={}){const base=Deno.env.get("SUPABASE_URL");if(!base)throw new Error("SUPABASE_URL indisponível.");const r=await fetch(base+"/rest/v1/"+path,{...init,headers:{...svc(),...(init.headers||{})}});const data=await r.json().catch(()=>null);if(!r.ok)throw new Error(`Supabase ${r.status}`);return data;}
const enc=v=>encodeURIComponent(String(v));
async function one(table,filters){const a=await db(`${table}?${filters}&select=*`);return a?.[0]||null;}
async function insertEvent(owner,e,requestHash){await db("tce_progress_events",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({owner_id:owner,idempotency_key:e.idempotencyKey,request_hash:requestHash,dxx:e.dxx,client_sxx:e.sxx,event_type:e.eventType,occurred_at:e.occurredAt,base_canonical_revision:e.baseCanonicalRevision,origin:e.origin,payload:e.payload,status:"pending"})});}
async function patchEvent(owner,key,p){await db(`tce_progress_events?owner_id=eq.${enc(owner)}&idempotency_key=eq.${enc(key)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({...p,updated_at:new Date().toISOString()})});}
async function conflict(owner,key,code,msg,day=null){await patchEvent(owner,key,{status:"conflict",resolved_sxx:day?.sxx||null,notion_day_page_id:day?.id||null,error_code:code,error_message:String(msg).slice(0,1000)});}
async function upsertState(owner,d,p,key,occurred,confirmed,canonicalRevision){await stateWrite({owner_id:owner,dxx:d.dxx,resolved_sxx:d.sxx,studied:p.studied,completed:p.completed,time_minutes:p.timeMinutes,questions_done:p.questionsDone,correct:p.correct,errors:p.errors,doubts:p.doubts,canonical_status:p.status,last_event_key:key,confirmed_at:confirmed,event_occurred_at:occurred,canonical_revision:canonicalRevision,updated_at:confirmed});}
async function stateWrite(s){await db("tce_progress_state?on_conflict=owner_id,dxx",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(s)});}
function pub(s,canonical){return{dxx:s.dxx,sxx:s.resolved_sxx,studied:Boolean(s.studied),completed:Boolean(s.completed),timeMinutes:Number(s.time_minutes||0),questionsDone:Number(s.questions_done||0),correct:Number(s.correct||0),errors:Number(s.errors||0),doubts:Number(s.doubts||0),status:s.canonical_status||null,confirmedAt:s.confirmed_at||null,eventOccurredAt:s.event_occurred_at||null,canonicalRevision:s.canonical_revision||null,canonical,source:canonical?"notion":"cache"};}

function payloadMatchesDay(p,d){return bool(p.studied,d.studied)===d.studied&&bool(p.completed,d.completed)===d.completed&&num(p.timeMinutes,d.timeMinutes)===d.timeMinutes&&num(p.questionsDone,d.questionsDone)===d.questionsDone&&num(p.correct,d.correct)===d.correct&&num(p.errors,d.errors)===d.errors&&num(p.doubts,d.doubts)===d.doubts;}
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==="object"){const out={};for(const k of Object.keys(value).sort())out[k]=stable(value[k]);return out;}return value;}
async function eventHash(e){const raw=JSON.stringify(stable({dxx:e.dxx,sxx:e.sxx,eventType:e.eventType,occurredAt:e.occurredAt,origin:e.origin,baseCanonicalRevision:e.baseCanonicalRevision,payload:e.payload}));const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("");}

function corsHeaders(req){const o=req.headers.get("origin"),allow=o&&ORIGINS.has(o)?o:"https://rodrigorosadantas.github.io";return{"Access-Control-Allow-Origin":allow,"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Vary":"Origin"};}
function json(v,s,h){return new Response(JSON.stringify(v),{status:s,headers:h});}
