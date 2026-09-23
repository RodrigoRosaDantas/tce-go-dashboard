const NAPI="https://api.notion.com/v1",NVER="2026-03-11";
const DAYS="a1075521-857b-4e1e-8fb2-849b51fdccc0",SESSIONS="f70b8e2d-31cc-4a26-9c06-9d0a9fe69de0";
const REVIEWS="d4733b43-6f1c-41ff-a066-ddc7a13f9d44",REDACTIONS="d837d3d6-7646-4f41-888a-ed8b48f94c9d",ERRORS_BANK="c0d696b3-99de-4d20-ae0e-a3324b74e038",SIMULATIONS="6deb1496-01ae-4a2d-8b38-5e99423410ee";
const ORIGINS=new Set(["https://rodrigorosadantas.github.io","http://localhost:3000","http://localhost:4173"]);
const STATE_TYPES=new Set(["progress.snapshot","questions.result","day.completed","day.reopened"]);
const TYPES=new Set([...STATE_TYPES,"review.snapshot","simulation.result","essay.result","error.capture"]);

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

    const nt=await resolveNotionToken();
    if(!nt)return json({status:"pending",canonical:false,dxx:ev.v.dxx,idempotencyKey:ev.v.idempotencyKey,message:"Pendente de sincronização com o Notion.",reason:"notion_unconfigured"},202,cors);

    const day=await resolveDay(ev.v.dxx,nt);
    if(!day){await conflict(user.id,ev.v.idempotencyKey,"DXX_NOT_FOUND","Dxx não existe no Notion.");return json({status:"conflict",error:"Dxx não existe no Notion."},409,cors);}
    if(day.protected||!day.sxx){await conflict(user.id,ev.v.idempotencyKey,"PROTECTED_DAY","Dia protegido não aceita execução TCE.",day);return json({status:"conflict",error:"Dia protegido não aceita execução TCE."},409,cors);}
    if(ev.v.sxx&&ev.v.sxx!==day.sxx){await conflict(user.id,ev.v.idempotencyKey,"DXX_SXX_CONFLICT",`Frontend enviou ${ev.v.sxx}; Notion resolve ${day.sxx}.`,day);return json({status:"conflict",error:"Conflito Dxx/Sxx. O Notion prevalece.",dxx:day.dxx,submittedSxx:ev.v.sxx,canonicalSxx:day.sxx},409,cors);}
    const stateEvent=STATE_TYPES.has(ev.v.eventType);
    if(stateEvent){
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
    }
    await patchEvent(user.id,ev.v.idempotencyKey,{resolved_sxx:day.sxx,notion_day_page_id:day.id});

    if(!stateEvent){
      let target;
      try{target=await writeSpecialized(user.id,day,ev.v,nt);}
      catch(err){
        if(err instanceof Error&&err.name==="ValidationError"){
          await conflict(user.id,ev.v.idempotencyKey,"SPECIALIZED_PAYLOAD_INVALID",err.message,day);
          return json({status:"conflict",error:err.message,code:"SPECIALIZED_PAYLOAD_INVALID",dxx:day.dxx,sxx:day.sxx},409,cors);
        }
        throw err;
      }
      const metrics=specializedSessionMetrics(ev.v,day);
      const sid=await ensureSession(user.id,day,ev.v,metrics,nt,cors);
      const confirmedAt=new Date().toISOString();
      const canonicalRevision=day.lastEditedAt||confirmedAt;
      const confirmation={dxx:day.dxx,sxx:day.sxx,eventType:ev.v.eventType,occurredAt:ev.v.occurredAt,confirmedAt,canonicalRevision,canonical:true,target};
      await patchEvent(user.id,ev.v.idempotencyKey,{status:"confirmed",resolved_sxx:day.sxx,notion_session_page_id:sid,notion_day_page_id:day.id,confirmation,confirmed_at:confirmedAt,error_code:null,error_message:null});
      return json({status:"confirmed",canonical:true,dxx:day.dxx,sxx:day.sxx,idempotencyKey:ev.v.idempotencyKey,confirmation,target},200,cors);
    }

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
    const sid=await ensureSession(user.id,day,ev.v,next,nt,cors);
    const updatedPage=await updateDay(day,next,nt);
    const confirmedAt=new Date().toISOString();
    const canonicalRevision=updatedPage?.last_edited_time||confirmedAt;
    const confirmation={dxx:day.dxx,sxx:day.sxx,eventType:ev.v.eventType,occurredAt:ev.v.occurredAt,confirmedAt,canonicalRevision,canonical:true};
    await patchEvent(user.id,ev.v.idempotencyKey,{status:"confirmed",resolved_sxx:day.sxx,notion_session_page_id:sid,notion_day_page_id:day.id,confirmation,confirmed_at:confirmedAt,error_code:null,error_message:null});
    await upsertState(user.id,day,next,ev.v.idempotencyKey,ev.v.occurredAt,confirmedAt,canonicalRevision);
    return json({status:"confirmed",canonical:true,dxx:day.dxx,sxx:day.sxx,idempotencyKey:ev.v.idempotencyKey,confirmation,state:next},200,cors);
  }catch(e){if(e instanceof Response)return e;console.error("tce-progress",e instanceof Error?e.message:e);return json({error:"Falha segura no writeback TCE-GO."},502,cors);}
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
  const nt=await resolveNotionToken();
  if(nt){const d=await resolveDay(dxx,nt);if(!d)return json({error:"Dxx não existe no Notion."},404,cors);if(d.protected)return json({dxx,sxx:null,protected:true,canonical:true,source:"notion"},200,cors);const s={owner_id:owner,dxx:d.dxx,resolved_sxx:d.sxx,studied:d.studied,completed:d.completed,time_minutes:d.timeMinutes,questions_done:d.questionsDone,correct:d.correct,errors:d.errors,doubts:d.doubts,canonical_status:d.status,last_event_key:"notion-read",confirmed_at:new Date().toISOString(),event_occurred_at:d.lastEditedAt||new Date().toISOString(),canonical_revision:d.lastEditedAt||null,updated_at:new Date().toISOString()};await stateWrite(s);return json({...pub(s,true),protected:false},200,cors);}
  const s=await one("tce_progress_state",`owner_id=eq.${enc(owner)}&dxx=eq.${enc(dxx)}`);return json(s?pub(s,false):{dxx,canonical:false,source:"cache",state:null},200,cors);
}

async function resolveDay(dxx,token){const r=await notion(`/data_sources/${DAYS}/query`,token,{method:"POST",body:JSON.stringify({page_size:2,filter:{property:"Slug",rich_text:{equals:dxx.toLowerCase()}}})});const page=r.results?.[0];if(!page)return null;const p=page.properties||{},type=txt(p,"Tipo");return{id:page.id,dxx,sxx:txt(p,"Sessão TCE")||null,type,protected:type==="Protegido",studied:check(p,"Estudado"),completed:check(p,"Concluído"),timeMinutes:nprop(p,"Tempo real (min)"),questionsDone:nprop(p,"Questões feitas"),correct:nprop(p,"Acertos"),errors:nprop(p,"Erros"),doubts:nprop(p,"Acertos com dúvida"),status:txt(p,"Status")||"Não iniciado",lastEditedAt:page.last_edited_time||null};}
async function findNotionSessions(key,token){const r=await notion(`/data_sources/${SESSIONS}/query`,token,{method:"POST",body:JSON.stringify({page_size:3,filter:{property:"Idempotency key",rich_text:{equals:key}}})});return Array.isArray(r.results)?r.results:[];}
async function createSession(d,e,p,token){const props={"Sessão":title(`${d.dxx} · ${d.sxx} · ${e.eventType}`),"Dxx":rich(d.dxx),"Sessão TCE":rich(d.sxx),"Tipo de evento":rich(e.eventType),"Timestamp":{date:{start:e.occurredAt}},"Data":{date:{start:e.occurredAt}},"Origem":rich(e.origin),"Idempotency key":rich(e.idempotencyKey),"Tipo":{select:{name:sessionType(d.type,e.eventType)}},"Tempo (min)":{number:p.timeMinutes},"Questões":{number:p.questionsDone},"Acertos":{number:p.correct},"Erros":{number:p.errors},"Acertos com dúvida":{number:p.doubts},"Observações":rich(("Evento confirmado pelo endpoint TCE-GO. "+String(e.payload.notes||"")).trim().slice(0,1200))};return notion("/pages",token,{method:"POST",body:JSON.stringify({parent:{data_source_id:SESSIONS},properties:props})});}
async function updateDay(d,p,token){return notion(`/pages/${d.id}`,token,{method:"PATCH",body:JSON.stringify({properties:{"Estudado":{checkbox:p.studied},"Concluído":{checkbox:p.completed},"Tempo real (min)":{number:p.timeMinutes},"Questões feitas":{number:p.questionsDone},"Acertos":{number:p.correct},"Erros":{number:p.errors},"Acertos com dúvida":{number:p.doubts},"Status":{select:{name:p.status}}}})});}
function sessionType(day,event){if(event==="questions.result")return"Questões";if(event==="review.snapshot")return"Revisão";if(event==="simulation.result"||day==="Simulado"||day==="Checkpoint")return"Simulado";if(event==="essay.result"||day==="Redação")return"Redação";if(event==="error.capture")return"Correção";if(day==="Correção")return"Correção";return"Teoria";}

async function ensureSession(owner,day,event,metrics,token,cors){
  const refreshed=await one("tce_progress_events",`owner_id=eq.${enc(owner)}&idempotency_key=eq.${enc(event.idempotencyKey)}`);
  let sid=refreshed?.notion_session_page_id||null;
  if(sid)return sid;
  const existing=await findNotionSessions(event.idempotencyKey,token);
  if(existing.length>1){await conflict(owner,event.idempotencyKey,"NOTION_DUPLICATE_IDEMPOTENCY","Mais de uma sessão Notion usa a mesma idempotency key.",day);throw json({status:"conflict",error:"Duplicidade detectada no Notion; gravação interrompida para auditoria.",code:"NOTION_DUPLICATE_IDEMPOTENCY"},409,cors);}
  if(existing.length===1)sid=existing[0].id;
  else sid=(await createSession(day,event,metrics,token)).id;
  await patchEvent(owner,event.idempotencyKey,{notion_session_page_id:sid});
  return sid;
}

function specializedSessionMetrics(event,day){
  const p=event.payload||{};
  if(event.eventType==="review.snapshot")return{timeMinutes:num(p.timeMinutes,0),questionsDone:num(p.questions,0),correct:num(p.correct,0),errors:num(p.errors,0),doubts:0};
  if(event.eventType==="essay.result")return{timeMinutes:num(p.timeMinutes,0),questionsDone:0,correct:0,errors:0,doubts:0};
  if(event.eventType==="simulation.result"){
    const questions=num(p.generalTotal,0)+num(p.specificTotal,0);
    const correct=num(p.generalCorrect,0)+num(p.specificCorrect,0);
    return{timeMinutes:num(p.timeMinutes,0),questionsDone:questions,correct,errors:Math.max(0,questions-correct),doubts:0};
  }
  return{timeMinutes:0,questionsDone:0,correct:0,errors:0,doubts:0};
}

async function writeSpecialized(owner,day,event,token){
  if(event.eventType==="review.snapshot")return writeReview(day,event,token);
  if(event.eventType==="essay.result")return writeEssay(day,event,token);
  if(event.eventType==="simulation.result")return writeSimulation(day,event,token);
  if(event.eventType==="error.capture")return writeError(owner,day,event,token);
  throw new Error("Evento especializado não suportado.");
}

async function writeReview(day,event,token){
  const p=event.payload||{},type=choice(p.reviewType,["D0","D7","D20","Fatal Error"],"Tipo de revisão");
  const status=choice(p.status||"Concluída",["Pendente","Próxima","Concluída","Cancelada por domínio"],"Status da revisão");
  const q=num(p.questions,0),c=num(p.correct,0),e=num(p.errors,0);
  if(c+e>q)throw validation("Revisão: acertos + erros excedem questões.");
  const filter={and:[{property:"Dxx origem",rich_text:{equals:day.dxx}},{property:"Tipo",select:{equals:type}}]};
  const rows=await queryDataSource(REVIEWS,filter,token,3);
  if(rows.length>1)throw validation(`Revisão duplicada para ${day.dxx}/${type}.`);
  const props={
    "Dxx origem":rich(day.dxx),
    "Tipo":{select:{name:type}},
    "Status":{select:{name:status}},
    "Questões de revisão":{number:q},
    "Acertos":{number:c},
    "Erros":{number:e},
    "Observações":rich(String(p.notes||"").slice(0,1800)),
  };
  if(p.reason)props["Motivo"]={select:{name:choice(p.reason,["Conteúdo novo","Erro relevante","Legislação","Reincidência","Calibração"],"Motivo da revisão")}};
  if(p.plannedDate)props["Data prevista"]={date:{start:isoDate(p.plannedDate,"Data prevista")}};
  if(status==="Concluída")props["Data realizada"]={date:{start:isoDate(p.performedDate||event.occurredAt,"Data realizada")}};
  let page=rows[0];
  if(page)page=await notion(`/pages/${page.id}`,token,{method:"PATCH",body:JSON.stringify({properties:props})});
  else page=await notion("/pages",token,{method:"POST",body:JSON.stringify({parent:{data_source_id:REVIEWS},properties:{"Revisão":title(`${type} — ${day.dxx}`),...props}})});
  return{kind:"review",pageId:page.id};
}

async function writeEssay(day,event,token){
  const p=event.payload||{},rows=await queryDataSource(REDACTIONS,{property:"Dxx",rich_text:{equals:day.dxx}},token,3);
  if(rows.length!==1)throw validation(`Redação canônica de ${day.dxx}: esperado 1 registro; recebido ${rows.length}.`);
  const status=choice(p.status||"Produzida",["Planejada","Em produção","Produzida","Corrigida","Reescrita"],"Status da redação");
  const props={"Status":{select:{name:status}}};
  if(["Produzida","Corrigida","Reescrita"].includes(status)){
    props["Linhas"]={number:bounded(p.lines,1,80,"Linhas")};
    props["Tempo (min)"]={number:bounded(p.timeMinutes,1,300,"Tempo (min)")};
  }else{
    optionalNumber(props,"Linhas",p.lines,0,80);
    optionalNumber(props,"Tempo (min)",p.timeMinutes,0,300);
  }
  if(p.mainError!=null)props["Erro principal"]=rich(String(p.mainError).slice(0,1800));
  if(p.rewriteNeeded!=null)props["Reescrita necessária"]={checkbox:Boolean(p.rewriteNeeded)};
  const criteria=[
    ["Recorte temático /20","recorte",20],
    ["Interpretação crítica /20","interpretacao",20],
    ["Progressão /30","progressao",30],
    ["Vocabulário /8","vocabulario",8],
    ["Coesão /16","coesao",16],
    ["Morfossintaxe /6","morfossintaxe",6],
  ];
  const given=criteria.filter(([,key])=>p[key]!=null&&p[key]!=="");
  if(["Corrigida","Reescrita"].includes(status)&&given.length!==criteria.length)throw validation("Redação corrigida exige os 6 critérios FCC.");
  let total=0;
  for(const [prop,key,max] of criteria){
    if(p[key]==null||p[key]==="")continue;
    const value=bounded(p[key],0,max,String(prop));total+=value;props[prop]={number:value};
  }
  if(given.length===criteria.length)props["Nota simulada /100"]={number:total};
  const page=await notion(`/pages/${rows[0].id}`,token,{method:"PATCH",body:JSON.stringify({properties:props})});
  return{kind:"essay",pageId:page.id,score:given.length===criteria.length?total:null};
}

async function writeSimulation(day,event,token){
  const p=event.payload||{},rows=await queryDataSource(SIMULATIONS,{property:"Dxx",rich_text:{equals:day.dxx}},token,3);
  if(rows.length!==1)throw validation(`Simulado/checkpoint de ${day.dxx}: esperado 1 registro; recebido ${rows.length}.`);
  const props={};

  const gt=bounded(p.generalTotal,0,100,"Gerais — total");
  const gc=bounded(p.generalCorrect,0,100,"Gerais — acertos");
  const st=bounded(p.specificTotal,0,100,"Específicos — total");
  const sc=bounded(p.specificCorrect,0,100,"Específicos — acertos");
  if(gt+st<=0)throw validation("Simulado/checkpoint exige ao menos uma questão executada.");
  if(gc>gt)throw validation("Simulado: acertos gerais excedem total.");
  if(sc>st)throw validation("Simulado: acertos específicos excedem total.");

  const time=bounded(p.timeMinutes,1,600,"Tempo (min)");
  const coverage=bounded(p.coverageExecuted,0,1000,"Cobertura — executados");
  const sessions=bounded(p.sessionsCompleted,0,1000,"Carga — sessões realizadas");
  const p1=bounded(p.p1Open,0,1000,"P1 abertos");
  const openErrors=bounded(p.openErrors,0,1000,"Erros abertos");
  const recurrent=bounded(p.recurrent,0,1000,"Reincidentes");
  const control=bounded(p.controlPercent,0,100,"Controle Externo %");
  const casp=bounded(p.caspPercent,0,100,"CASP %");
  const legislation=bounded(p.legislationPercent,0,100,"Legislação Institucional %");
  const known=bounded(p.knownPercent,0,100,"Matérias conhecidas %");
  const timeByBlock=String(p.timeByBlock||"").trim();
  const weakKnown=String(p.weakKnown||"").trim();
  if(!timeByBlock)throw validation("Simulado/checkpoint exige tempo por bloco.");
  if(!weakKnown)throw validation("Simulado/checkpoint exige pontos fracos das matérias conhecidas.");

  props["Gerais — total"]={number:gt};
  props["Gerais — acertos"]={number:gc};
  props["Específicos — total"]={number:st};
  props["Específicos — acertos"]={number:sc};
  props["Tempo (min)"]={number:time};
  props["Cobertura — executados"]={number:coverage};
  props["Carga — sessões realizadas"]={number:sessions};
  props["P1 abertos"]={number:p1};
  props["Erros abertos"]={number:openErrors};
  props["Reincidentes"]={number:recurrent};
  props["Controle Externo %"]={number:control};
  props["CASP %"]={number:casp};
  props["Legislação Institucional %"]={number:legislation};
  props["Matérias conhecidas %"]={number:known};
  props["Tempo por bloco"]=rich(timeByBlock);
  props["Pontos fracos — matérias conhecidas"]=rich(weakKnown);
  props["IPI interno"]={number:Math.round(((gc+2*sc)/115*100)*100)/100};
  props["Decisão"]={select:{name:choice(p.decision,["Manter","Ajustar","Reduzir","Ampliar"],"Decisão")}};
  props["Impactou SEEDF"]={checkbox:Boolean(p.impactedSeedf)};
  props["Impactou TJDFT"]={checkbox:Boolean(p.impactedTjdft)};

  optionalNumber(props,"Redação /100",p.essayScore,0,100);
  if(p.biggestEssayLoss!=null)props["Maior perda — redação"]=rich(String(p.biggestEssayLoss).slice(0,1800));
  if(p.notes!=null)props["Observações"]=rich(String(p.notes).slice(0,1800));

  const page=await notion(`/pages/${rows[0].id}`,token,{method:"PATCH",body:JSON.stringify({properties:props})});
  return{kind:"simulation",pageId:page.id,ipi:props["IPI interno"].number};
}

async function writeError(owner,day,event,token){
  const p=event.payload||{};
  const stored=await one("tce_progress_events",`owner_id=eq.${enc(owner)}&idempotency_key=eq.${enc(event.idempotencyKey)}`);
  let errorId=String(stored?.payload?.errorId||p.errorId||"").trim();
  if(!errorId){
    errorId=`TCE-E-${event.idempotencyKey.replace(/-/g,"").slice(0,12).toUpperCase()}`;
    await patchEvent(owner,event.idempotencyKey,{payload:{...event.payload,errorId}});
  }
  const rows=await queryDataSource(ERRORS_BANK,{property:"ID erro",rich_text:{equals:errorId}},token,3);
  if(rows.length>1)throw validation(`Caderno de Erros duplicado para ${errorId}.`);
  const props={
    "ID erro":rich(errorId),
    "Dxx":rich(day.dxx),
    "Data":{date:{start:event.occurredAt}},
    "Status":{select:{name:choice(p.status||"Aberto",["Aberto","Em tratamento","Validado","Encerrado"],"Status do erro")}},
    "Erro":title(String(p.error||"Erro capturado pelo site").slice(0,180)),
  };
  if(p.questionId!=null)props["ID questão"]=rich(String(p.questionId).slice(0,300));
  if(p.subject!=null)props["Matéria"]=rich(String(p.subject).slice(0,300));
  if(p.topic!=null)props["Tópico"]=rich(String(p.topic).slice(0,500));
  if(p.source)props["Fonte"]={select:{name:choice(p.source,["FCC","Autoral","Outra"],"Fonte do erro")}};
  optionalNumber(props,"Peso",p.weight,0,10);
  if(p.markedAnswer!=null)props["Resposta marcada"]=rich(String(p.markedAnswer).slice(0,500));
  if(p.answerKey!=null)props["Gabarito"]=rich(String(p.answerKey).slice(0,500));
  if(p.reason)props["Motivo do erro"]={select:{name:choice(p.reason,["Desconhecimento","Confusão conceitual","Lei/norma","Memória","Interpretação","Cálculo","Distração","Gestão do tempo"],"Motivo do erro")}};
  if(p.correctRule!=null)props["Regra correta"]=rich(String(p.correctRule).slice(0,1800));
  if(p.action!=null)props["Ação"]=rich(String(p.action).slice(0,1800));
  if(p.severity)props["Severidade"]={select:{name:choice(p.severity,["P1","P2","P3"],"Severidade")}};
  optionalNumber(props,"Reincidência",p.recurrence,0,100);
  if(p.doubt!=null)props["Acerto com dúvida?"]={checkbox:Boolean(p.doubt)};
  if(p.fatal!=null)props["Fatal Error?"]={checkbox:Boolean(p.fatal)};
  if(p.nextCheck!=null)props["Próxima checagem"]=rich(String(p.nextCheck).slice(0,500));
  if(p.notes!=null)props["Observação"]=rich(String(p.notes).slice(0,1800));
  let page=rows[0];
  if(page)page=await notion(`/pages/${page.id}`,token,{method:"PATCH",body:JSON.stringify({properties:props})});
  else page=await notion("/pages",token,{method:"POST",body:JSON.stringify({parent:{data_source_id:ERRORS_BANK},properties:props})});
  return{kind:"error",pageId:page.id,errorId};
}

async function queryDataSource(id,filter,token,pageSize=3){
  const r=await notion(`/data_sources/${id}/query`,token,{method:"POST",body:JSON.stringify({page_size:pageSize,filter})});
  return Array.isArray(r.results)?r.results:[];
}
function validation(message){const e=new Error(message);e.name="ValidationError";return e;}
function choice(value,allowed,label){const v=String(value||"").trim();if(!allowed.includes(v))throw validation(`${label} inválido.`);return v;}
function bounded(value,min,max,label){const n=Number(value);if(!Number.isFinite(n)||n<min||n>max)throw validation(`${label} inválido.`);return Math.round(n*100)/100;}
function optionalNumber(props,name,value,min,max){if(value==null||value==="")return null;const n=bounded(value,min,max,name);props[name]={number:n};return n;}
function isoDate(value,label){const d=new Date(String(value));if(Number.isNaN(d.getTime()))throw validation(`${label} inválida.`);return d.toISOString();}

async function resolveNotionToken(){
  const candidates=[...new Set([
    (Deno.env.get("TCE_GO_NOTION_TOKEN")||"").trim(),
    (Deno.env.get("SEEDF")||"").trim(),
  ].filter(Boolean))];
  for(const token of candidates){
    try{
      await notion(`/data_sources/${DAYS}/query`,token,{method:"POST",body:JSON.stringify({page_size:1})});
      return token;
    }catch(error){
      console.warn("Credencial Notion server-side recusada; tentando alternativa configurada.",error instanceof Error?error.message.replace(/:.*/,""):"erro");
    }
  }
  return "";
}

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
