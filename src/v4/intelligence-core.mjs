const DAY = 86_400_000;
export const TCE_EXAM = Object.freeze({
  status: "EDITAL ABERTO",
  board: "FCC",
  date: "2027-01-17",
  objectiveQuestions: 70,
  weightedPoints: 115,
});

const openStatus = (value) => !["Validado", "Encerrado", "Resolvido", "Fechado", "Concluído", "Corrigido", "Recuperado"].includes(String(value || ""));
const norm = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const dateOnly = (value) => String(value || "").slice(0, 10);
const toUtc = (iso) => {
  const [y,m,d] = dateOnly(iso).split("-").map(Number);
  return y && m && d ? Date.UTC(y,m-1,d) : NaN;
};
const daysBetween = (from,to) => {
  const a=toUtc(from), b=toUtc(to);
  return Number.isFinite(a)&&Number.isFinite(b) ? Math.floor((b-a)/DAY) : null;
};
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const accuracy=(correct,errors)=>{
  if(correct==null||errors==null) return null;
  const total=Number(correct)+Number(errors);
  return total>0?Number(correct)/total*100:null;
};
const hasExecution=(day)=>Boolean(day&&(day.studied||day.completed||day.status==="Em andamento"||day.status==="Concluído"
  ||(day.timeMinutes??0)>0||(day.questionsDone??0)>0||(day.correct??0)>0||(day.errors??0)>0||(day.doubts??0)>0));

export function sampleConfidence(totalQuestions=0,sessions=0){
  const q=Number(totalQuestions||0), s=Number(sessions||0);
  if(q<=0||s<=0) return {key:"none",label:"sem dados suficientes",rank:0};
  if(q<10) return {key:"tiny",label:"amostra muito pequena",rank:1};
  if(q<25||s<2) return {key:"small",label:"amostra pequena",rank:2};
  if(q<60||s<3) return {key:"moderate",label:"evidência moderada",rank:3};
  return {key:"strong",label:"evidência forte",rank:4};
}

function examPhase(referenceDate,examDate){
  const days=daysBetween(referenceDate,examDate);
  if(days==null) return {days:null,key:"unknown",label:"horizonte não calculável"};
  if(days<=17) return {days,key:"final",label:"reta final"};
  if(days<=45) return {days,key:"near",label:"perto da prova"};
  if(days<=90) return {days,key:"middle",label:"fase intermediária"};
  return {days,key:"building",label:"fase de construção"};
}

function editalIndex(snapshot){
  const active=(snapshot.edital||[]).filter(item=>item.active);
  const max=Math.max(1,...active.map(item=>Number(item.weightedPoints||0)));
  return active.map(item=>({
    ...item,
    n:norm(item.discipline),
    impact:clamp(Number(item.weightedPoints||0)/max,0,1),
  }));
}
function canonicalSubjectLabel(value){
  const raw=String(value||"").trim();
  if(!raw) return null;
  const head=raw.split(" — ")[0].trim();
  return head.replace(/\s+(?:I|II|III|IV|V|VI|VII|VIII|IX|X)$/i,"").trim()||null;
}
const EDITAL_ALIASES = new Map([
  ["casp","contabilidade aplicada ao setor publico"],
  ["afo","administracao financeira e orcamentaria"],
  ["matematica rlm","matematica e raciocinio logico"],
  ["direito administrativo","nocoes de direito administrativo"],
  ["direito constitucional","nocoes de direito constitucional"],
  ["controle externo","nocoes de controle externo"],
  ["licitacoes","licitacoes e contratos"],
  ["administracao estrategica","nocoes de administracao estrategica"],
  ["administracao publica","nocoes de administracao publica"],
  ["administracao geral","nocoes de administracao geral"],
  ["comportamento organizacional","nocoes de comportamento organizacional"],
  ["gestao de pessoas","nocoes de gestao de pessoas"],
  ["redacao","redacao fcc"],
]);
function matchEdital(subject,index){
  const label=canonicalSubjectLabel(subject)||subject;
  const n=norm(label);
  if(!n) return null;
  const aliased=EDITAL_ALIASES.get(n)||n;
  const exact=index.find(item=>item.n===aliased);
  if(exact) return {...exact,match:aliased===n?"exact":"alias"};
  const partial=index.filter(item=>item.n.length>=6&&aliased.length>=6&&(item.n.includes(aliased)||aliased.includes(item.n)));
  return partial.length===1?{...partial[0],match:"partial"}:null;
}
function subjectForDay(summary,dxx){
  const focus=summary.questionMeta?.find(item=>String(item.dxx||"").toUpperCase()===String(dxx||"").toUpperCase())?.focus;
  return canonicalSubjectLabel(focus);
}
function buildSubjectStats(snapshot,summary,index){
  const daysById=new Map((snapshot.days||[]).map(day=>[day.dxx,day]));
  const groups=new Map();
  for(const row of summary.dayControl||[]){
    if(!hasExecution(row)) continue;
    const subject=subjectForDay(summary,row.dxx)||"Matéria não informada";
    const key=norm(subject)||subject;
    const g=groups.get(key)||{subject,sessions:0,questions:0,correct:0,errors:0,doubts:0,minutes:0,events:[]};
    g.sessions+=1;
    g.questions+=Number(row.questionsDone||0);
    g.correct+=Number(row.correct||0);
    g.errors+=Number(row.errors||0);
    g.doubts+=Number(row.doubts||0);
    g.minutes+=Number(row.timeMinutes||0);
    const a=accuracy(row.correct,row.errors);
    if(a!=null) g.events.push({date:daysById.get(row.dxx)?.date||"",accuracy:a,dxx:row.dxx});
    groups.set(key,g);
  }
  return [...groups.values()].map(g=>{
    const conf=sampleConfidence(g.questions,g.sessions);
    const a=accuracy(g.correct,g.errors);
    const edital=matchEdital(g.subject,index);
    const events=[...g.events].sort((x,y)=>String(x.date).localeCompare(String(y.date)));
    let trend={key:"insufficient",label:"amostra temporal insuficiente",delta:null};
    if(events.length>=4){
      const current=events.slice(-2).reduce((s,x)=>s+x.accuracy,0)/2;
      const previous=events.slice(-4,-2).reduce((s,x)=>s+x.accuracy,0)/2;
      const delta=current-previous;
      trend=delta>=5?{key:"improving",label:"melhorando",delta}:delta<=-5?{key:"worsening",label:"piorando",delta}:{key:"stable",label:"estável",delta};
    }
    return {...g,accuracy:a,confidence:conf,edital,trend};
  }).sort((a,b)=>(b.edital?.weightedPoints||0)-(a.edital?.weightedPoints||0)||b.questions-a.questions);
}
function strengthLevel(row){
  if(row.accuracy==null) return null;
  if(row.confidence.rank<3||row.accuracy<85) return null;
  if(row.trend.key==="worsening") return null;
  if(row.confidence.key==="strong"&&row.accuracy>=90) return "forte com boa amostra";
  if(row.accuracy>=90) return "forte";
  if(row.trend.key==="improving") return "recuperando";
  return "estável";
}
function recencyPoints(days){if(days==null)return 0;if(days<=2)return 10;if(days<=7)return 8;if(days<=14)return 6;if(days<=30)return 3;return 0;}
function reviewSignal(summary,dxx,referenceDate){
  const active=(summary.reviews||[]).filter(r=>r.dxx===dxx&&!["Concluída","Cancelada por domínio"].includes(r.status));
  if(!active.length) return {points:0,label:"sem revisão ativa",items:[]};
  let points=0,label="revisão programada";
  for(const r of active){
    const due=dateOnly(r.plannedDate);
    const late=due&&due<referenceDate;
    const today=due===referenceDate;
    const important=r.type==="Fatal Error"||/reincid|erro relevante/i.test(r.reason||"");
    const p=r.type==="Fatal Error"?15:late&&important?14:late?10:today?8:4;
    if(p>points){points=p;label=late?"revisão vencida":today?"revisão de hoje":"revisão ativa";}
  }
  return {points,label,items:active};
}
function errorSeverity(item){
  if(item.fatal) return 25;
  const s=String(item.severity||"").toUpperCase();
  if(s==="P1") return 22;
  if(s==="P2") return 14;
  if(s==="P3") return 7;
  return 6;
}
function weaknessGroups(snapshot,summary,index,subjectStats,referenceDate,phase){
  const groups=new Map();
  for(const error of summary.errors||[]){
    if(!openStatus(error.status)) continue;
    const subject=error.subject?.trim()||"Matéria não informada";
    const topic=error.topic?.trim()||error.error?.trim()||"Tópico não informado";
    const key=norm(subject+"|"+topic);
    const g=groups.get(key)||{subject,topic,errors:[],dxx:new Set()};
    g.errors.push(error); if(error.dxx)g.dxx.add(error.dxx); groups.set(key,g);
  }
  return [...groups.values()].map(g=>{
    const dates=g.errors.map(x=>dateOnly(x.date)).filter(Boolean).sort();
    const latest=dates.at(-1)||null;
    const days=latest?daysBetween(latest,referenceDate):null;
    const recurrence=Math.max(0,...g.errors.map(x=>Number(x.recurrence||0)),g.errors.length-1);
    const severity=Math.max(...g.errors.map(errorSeverity));
    const subjectRow=subjectStats.find(row=>norm(row.subject)===norm(g.subject));
    const edital=matchEdital(g.subject,index);
    const retention=Math.max(0,...[...g.dxx].map(dxx=>reviewSignal(summary,dxx,referenceDate).points));
    const trend=subjectRow?.trend?.key==="worsening"?10:subjectRow?.trend?.key==="stable"&&recurrence?5:0;
    const confidence=g.errors.length>=4||recurrence>=3?5:g.errors.length>=2||recurrence>=1?3:1;
    const horizon=phase.key==="final"?5:phase.key==="near"?3:phase.key==="middle"?1:0;
    const recurrenceScore=recurrence>=3?15:recurrence===2?12:recurrence===1?8:0;
    const editalPoints=edital?Math.round(edital.impact*15):0;
    let score=clamp(severity+recurrenceScore+recencyPoints(days)+retention+editalPoints+trend+confidence+horizon,0,100);
    if(g.errors.length===1&&recurrence===0&&!g.errors[0].fatal&&String(g.errors[0].severity||"").toUpperCase()!=="P1") score=Math.min(score,49);
    const level=score>=75?"crítica":score>=55?"alta":score>=35?"atenção":"monitorar";
    const evidence=[
      `${g.errors.length} erro(s) aberto(s)`,
      recurrence?`${recurrence} reincidência(s)`:"sem reincidência confirmada",
      latest?`última ocorrência ${latest}`:"data da última ocorrência ausente",
      edital?`${edital.block} · peso ${edital.weight} · ${edital.weightedPoints} ponto(s) potenciais`:"sem vínculo seguro com item do edital",
      subjectRow?.confidence?.label||"sem amostra de questões suficiente",
    ];
    return {
      id:norm(g.subject+"-"+g.topic),subject:g.subject,topic:g.topic,dxx:[...g.dxx],score,level,recurrence,latest,daysSinceLast:days,
      fatal:g.errors.some(x=>x.fatal),p1:g.errors.some(x=>String(x.severity||"").toUpperCase()==="P1"),
      edital,confidence:subjectRow?.confidence||sampleConfidence(0,0),trend:subjectRow?.trend||{key:"insufficient",label:"amostra temporal insuficiente",delta:null},
      evidence,
      breakdown:{severity:{points:severity,max:25},recurrence:{points:recurrenceScore,max:15},recency:{points:recencyPoints(days),max:10},retention:{points:retention,max:15},edital:{points:editalPoints,max:15},trend:{points:trend,max:10},confidence:{points:confidence,max:5},horizon:{points:horizon,max:5}},
    };
  }).sort((a,b)=>b.score-a.score||b.recurrence-a.recurrence||String(b.latest||"").localeCompare(String(a.latest||"")));
}
function reviewCandidate(review,summary,referenceDate,weaknesses){
  const due=dateOnly(review.plannedDate), late=Boolean(due&&due<referenceDate), today=due===referenceDate;
  const linked=weaknesses.find(w=>w.dxx.includes(review.dxx));
  let score=review.type==="Fatal Error"?98:review.type==="D20"?60:review.type==="D7"?52:48;
  if(late) score+=10; else if(today) score+=5;
  if(/reincid|erro relevante/i.test(review.reason||"")) score+=10;
  if(linked) score+=Math.round(linked.score*.15);
  score=clamp(score,0,97);
  return {
    kind:"review",score,eyebrow:late?"REVISÃO ATRASADA":today?"REVISÃO DE HOJE":"REVISÃO ATIVA",
    title:`${review.type} · ${review.dxx}`,
    reason:`${review.reason||"Retenção programada"} · ${late?"vencida":today?"prevista para hoje":"programada"}.`,
    href:`/revisoes/?dxx=${encodeURIComponent(review.dxx)}&type=${encodeURIComponent(review.type)}`,
    dxx:review.dxx,badge:review.type,
    evidence:[`tipo ${review.type}`,review.reason||"motivo não informado",due?`data prevista ${due}`:"sem data prevista",linked?`fragilidade associada: ${linked.topic}`:"sem fragilidade associada confirmada"],
    breakdown:{base:score},
  };
}
function candidateWeakness(w,phase){
  const action=phase.key==="final"||phase.key==="near"?"revisão dirigida + questões seletivas":"revisão curta + questões dirigidas";
  const score=w.fatal?100:w.p1?Math.max(90,Math.min(98,w.score+12)):Math.min(96,w.score+8);
  return {kind:"weakness",score,eyebrow:w.fatal?"FATAL ERROR":w.p1?"ERRO P1":"FRAGILIDADE PRIORITÁRIA",title:`${w.subject} · ${w.topic}`,reason:`${action}; prioridade ${w.score}/100 sustentada por evidências registradas.`,href:w.dxx[0]?`/erros/?dxx=${encodeURIComponent(w.dxx[0])}`:"/erros/",dxx:w.dxx[0],badge:`${w.level} · ${w.score}/100`,evidence:w.evidence,breakdown:w.breakdown};
}
function hasSimulationEvidence(item){
  return ["generalTotal","generalCorrect","specificTotal","specificCorrect","timeMinutes","coverageExecuted","sessionsExecuted","writingScore"].some(key=>item?.[key]!=null);
}
function buildWritingSignal(summary){
  const rows=(summary.redactions||[]).filter(item=>item.score!=null||item.rewriteNeeded||item.mainError);
  const scored=rows.filter(item=>item.score!=null).sort((a,b)=>String(a.date||a.lastEditedAt||"").localeCompare(String(b.date||b.lastEditedAt||"")));
  const latest=[...rows].sort((a,b)=>String(b.date||b.lastEditedAt||"").localeCompare(String(a.date||a.lastEditedAt||"")))[0]||null;
  const errorCounts=new Map();
  for(const item of rows){
    const key=norm(item.mainError);
    if(key) errorCounts.set(key,(errorCounts.get(key)||0)+1);
  }
  const repeated=[...errorCounts.entries()].sort((a,b)=>b[1]-a[1])[0]||null;
  let trend={key:"insufficient",label:"amostra temporal insuficiente",delta:null};
  if(scored.length>=2){
    const previous=Number(scored.at(-2).score), current=Number(scored.at(-1).score), delta=current-previous;
    trend=delta>=5?{key:"improving",label:"melhorando",delta}:delta<=-5?{key:"worsening",label:"piorando",delta}:{key:"stable",label:"estável",delta};
  }
  return {
    count:rows.length,latest,trend,
    rewriteNeeded:Boolean(latest?.rewriteNeeded),
    repeatedMainError:repeated&&repeated[1]>=2?{key:repeated[0],count:repeated[1]}:null,
  };
}
function buildCheckpointSignal(summary){
  const rows=(summary.simulations||[]).filter(hasSimulationEvidence)
    .sort((a,b)=>String(b.date||b.lastEditedAt||"").localeCompare(String(a.date||a.lastEditedAt||"")));
  const latest=rows[0]||null;
  if(!latest) return {count:0,latest:null,generalAccuracy:null,specificAccuracy:null};
  const ratio=(correct,total)=>correct!=null&&total!=null&&Number(total)>0?Number(correct)/Number(total)*100:null;
  return {
    count:rows.length,latest,
    generalAccuracy:ratio(latest.generalCorrect,latest.generalTotal),
    specificAccuracy:ratio(latest.specificCorrect,latest.specificTotal),
  };
}
function buildRecommendation(snapshot,summary,referenceDate,phase,weaknesses,writing,checkpoint){
  const candidates=[];
  for(const w of weaknesses.filter(x=>x.fatal||x.p1||x.score>=55)) candidates.push(candidateWeakness(w,phase));
  for(const r of summary.reviews||[]){
    if(["Concluída","Cancelada por domínio"].includes(r.status)) continue;
    const due=dateOnly(r.plannedDate);
    if(r.type==="Fatal Error"||!due||due<=referenceDate) candidates.push(reviewCandidate(r,summary,referenceDate,weaknesses));
  }
  const published=(snapshot.days||[]).filter(day=>!day.protected&&day.readyForStudy).sort((a,b)=>a.order-b.order);
  const byDay=new Map((summary.dayControl||[]).map(day=>[day.dxx,day]));
  const resume=published.find(day=>{const p=byDay.get(day.dxx);return p&&hasExecution(p)&&!p.completed;});
  if(resume) candidates.push({kind:"resume",score:65,eyebrow:"RETOMAR SESSÃO",title:`${resume.session||resume.dxx} · ${resume.focus}`,reason:"Há execução real iniciada e ainda não concluída; a continuidade reduz custo de contexto.",href:`/dia/${resume.dxx.toLowerCase()}/`,dxx:resume.dxx,badge:resume.session,evidence:["sessão iniciada no estado canônico","conclusão ainda não registrada"],breakdown:{continuity:65}});
  if(writing.rewriteNeeded&&writing.latest){
    const repeat=writing.repeatedMainError?.count||0;
    const score=clamp(76+(repeat>=2?8:0),0,88);
    candidates.push({kind:"redaction",score,eyebrow:"REESCRITA DE REDAÇÃO",title:writing.latest.title||writing.latest.dxx,reason:"A correção registrou necessidade de reescrita; a redação volta ao motor em vez de ficar isolada.",href:`/redacoes/?dxx=${writing.latest.dxx}`,dxx:writing.latest.dxx,badge:"Reescrita",evidence:["reescrita necessária registrada",writing.latest.mainError?`erro principal: ${writing.latest.mainError}`:"erro principal não informado",repeat>=2?`erro principal reincidente em ${repeat} redações`:"sem reincidência comprovada do erro principal"],breakdown:{rewrite:76,recurrence:repeat>=2?8:0}});
  }
  if(checkpoint.latest&&((checkpoint.latest.p1Open||0)>0||(checkpoint.latest.recurrent||0)>0)){
    const p1=Number(checkpoint.latest.p1Open||0), recurrent=Number(checkpoint.latest.recurrent||0);
    const score=clamp(74+Math.min(10,p1*5)+Math.min(6,recurrent*3),0,90);
    candidates.push({kind:"simulation",score,eyebrow:"RECALIBRAÇÃO PÓS-CHECKPOINT",title:checkpoint.latest.title||checkpoint.latest.dxx,reason:"O checkpoint registrou P1/reincidência; a execução seguinte deve absorver esse diagnóstico.",href:`/simulados/?dxx=${checkpoint.latest.dxx}`,dxx:checkpoint.latest.dxx,badge:"Pós-checkpoint",evidence:[`${p1} P1 aberto(s) no checkpoint`,`${recurrent} reincidência(s) registrada(s)`,checkpoint.latest.decision||"decisão pós-checkpoint não informada"],breakdown:{checkpoint:74,p1:Math.min(10,p1*5),recurrence:Math.min(6,recurrent*3)}});
  }
  const redactionStatus=new Map((summary.redactions||[]).map(x=>[x.dxx,x.status]));
  const red=(snapshot.redactions||[]).find(plan=>plan.date<=referenceDate&&!["Produzida","Corrigida","Reescrita"].includes(redactionStatus.get(plan.dxx)||"Planejada"));
  if(red) candidates.push({kind:"redaction",score:72,eyebrow:"REDAÇÃO PENDENTE",title:red.title,reason:`${red.dxx} chegou ao marco planejado e ainda não possui execução confirmada.`,href:`/redacoes/?dxx=${red.dxx}`,dxx:red.dxx,badge:red.code,evidence:["marco do ciclo atingido","execução não confirmada"],breakdown:{schedule:72}});
  const doneSim=new Set((summary.simulations||[]).filter(hasSimulationEvidence).map(x=>x.dxx));
  const sim=(snapshot.simulations||[]).find(plan=>plan.date<=referenceDate&&!doneSim.has(plan.dxx));
  if(sim) candidates.push({kind:"simulation",score:70,eyebrow:"CHECKPOINT PENDENTE",title:sim.title,reason:`${sim.dxx} chegou ao marco sem resultado real; o diagnóstico posterior depende dele.`,href:`/simulados/?dxx=${sim.dxx}`,dxx:sim.dxx,badge:sim.type,evidence:["marco previsto atingido","resultado real ausente"],breakdown:{checkpoint:70}});
  const next=published.find(day=>!byDay.get(day.dxx)?.completed);
  if(next) candidates.push({kind:"next-session",score:50,eyebrow:"PRÓXIMA SESSÃO CANÔNICA",title:`${next.session||next.dxx} · ${next.focus}`,reason:"É a primeira sessão publicada ainda não concluída, preservando Ordem e a sequência S01–S47.",href:`/dia/${next.dxx.toLowerCase()}/`,dxx:next.dxx,badge:next.session,evidence:["menor Ordem publicada ainda não concluída","nenhuma reorganização da trilha"],breakdown:{canonicalSequence:50}});
  candidates.sort((a,b)=>b.score-a.score);
  const top=candidates[0]||{kind:"maintenance",score:0,eyebrow:"SEM AÇÃO URGENTE",title:"Ainda não há evidência para priorização adaptativa.",reason:"O sistema preserva desconhecido como desconhecido; siga a próxima sessão canônica quando ela estiver liberada.",href:"/dias/",evidence:["sem execução suficiente"],breakdown:{}};
  const canonical=next?{title:`${next.session||next.dxx} · ${next.focus}`,href:`/dia/${next.dxx.toLowerCase()}/`,dxx:next.dxx}:null;
  return {...top,after:top.kind==="next-session"?null:canonical,candidates:candidates.slice(0,8)};
}
function risks(snapshot,summary,index,subjectStats,weaknesses,phase,writing,checkpoint){
  const out=[];
  for(const w of weaknesses.filter(x=>x.score>=55)){
    out.push({level:w.score>=75?"critical":"attention",title:`${w.subject} · ${w.topic}`,detail:`Prioridade ${w.score}/100 · ${w.evidence.slice(0,3).join(" · ")}`,href:"/mentor/",evidence:w.evidence});
  }
  const anyExecution=subjectStats.some(x=>x.questions>0);
  if(anyExecution||["near","final"].includes(phase.key)){
    for(const item of index.filter(x=>x.impact>=.75)){
      const row=subjectStats.find(s=>norm(s.subject)===item.n);
      if(!row||row.questions===0) out.push({level:"attention",title:`${item.discipline} · alto impacto sem amostra`,detail:`${item.weightedPoints} pontos ponderados no edital e nenhuma questão de execução associada de forma segura.`,href:"/edital/",evidence:["alto impacto editalício","sem amostra operacional vinculada"]});
    }
  }
  const overdue=(summary.reviews||[]).filter(r=>!["Concluída","Cancelada por domínio"].includes(r.status)&&dateOnly(r.plannedDate)&&dateOnly(r.plannedDate)<phase.referenceDate);
  if(overdue.length) out.push({level:"attention",title:`${overdue.length} revisão(ões) vencida(s)`,detail:"Atraso de retenção confirmado no banco canônico; a prioridade individual depende do motivo e da gravidade.",href:"/revisoes/",evidence:["datas canônicas de revisão"]});
  if(writing.rewriteNeeded&&writing.latest) out.push({level:"attention",title:"Redação com reescrita pendente",detail:writing.latest.mainError?`Erro principal: ${writing.latest.mainError}`:"A correção marcou reescrita necessária.",href:"/redacoes/",evidence:["reescrita necessária registrada",writing.repeatedMainError?`erro principal repetido ${writing.repeatedMainError.count} vezes`:"sem reincidência comprovada"]});
  if(checkpoint.latest&&((checkpoint.latest.p1Open||0)>0||(checkpoint.latest.recurrent||0)>0)) out.push({level:(checkpoint.latest.p1Open||0)>0?"critical":"attention",title:"Checkpoint exige recalibração",detail:`${checkpoint.latest.p1Open||0} P1 aberto(s) · ${checkpoint.latest.recurrent||0} reincidência(s)`,href:"/simulados/",evidence:["resultado real de checkpoint","P1/reincidência registrados"]});
  return out.slice(0,10);
}

export function buildStudyIntelligence({snapshot,summary,referenceDate,examDate=TCE_EXAM.date}){
  const ref=referenceDate||new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const phase={...examPhase(ref,examDate),referenceDate:ref};
  const index=editalIndex(snapshot);
  const subjects=buildSubjectStats(snapshot,summary,index);
  const weaknesses=weaknessGroups(snapshot,summary,index,subjects,ref,phase);
  const strengths=subjects.map(row=>({...row,level:strengthLevel(row)})).filter(row=>row.level);
  const writing=buildWritingSignal(summary);
  const checkpoint=buildCheckpointSignal(summary);
  const uncertainties=[];
  if(!subjects.length) uncertainties.push({title:"Desempenho ainda sem amostra",detail:"Nenhuma sessão real com questões foi localizada. Isso não significa 0% nem fraqueza."});
  for(const row of subjects.filter(x=>x.confidence.rank<3)) uncertainties.push({title:`${row.subject}: ${row.confidence.label}`,detail:`${row.questions} questão(ões) em ${row.sessions} sessão(ões); ainda insuficiente para afirmar domínio.`});
  const recommendation=buildRecommendation(snapshot,summary,ref,phase,weaknesses,writing,checkpoint);
  const riskRows=risks(snapshot,summary,index,subjects,weaknesses,phase,writing,checkpoint);
  const totalQuestions=index.reduce((s,x)=>s+Number(x.questions||0),0);
  const totalWeighted=index.reduce((s,x)=>s+Number(x.weightedPoints||0),0);
  return {
    exam:{...TCE_EXAM,date:examDate,objectiveQuestions:totalQuestions||TCE_EXAM.objectiveQuestions,weightedPoints:totalWeighted||TCE_EXAM.weightedPoints,daysRemaining:phase.days,phase:phase.label},
    referenceDate:ref,
    recommendation,
    weaknesses,
    strengths,
    uncertainties:uncertainties.slice(0,8),
    risks:riskRows,
    subjects,
    writing,
    checkpoint,
    methodology:{
      priority:"0–100 = severidade 25 + reincidência 15 + recência 10 + retenção 15 + impacto do edital 15 + tendência 10 + confiança 5 + horizonte 5. Um erro isolado não P1/Fatal é limitado a 49.",
      confidence:"Amostra: <10 questões = muito pequena; 10–24 ou <2 sessões = pequena; 25–59 com ≥2 sessões = moderada; ≥60 com ≥3 sessões = forte.",
      strength:"Força exige precisão ≥85%, evidência ao menos moderada e ausência de tendência de piora. 100% em poucas questões continua sendo amostra pequena.",
      decision:"Fatal/P1 entram acima da expansão. Revisões não bloqueiam por tipo apenas: atraso, motivo, reincidência, edital e fragilidade associada alteram prioridade. A Ordem D001–D100/S01–S47 nunca é reescrita.",
      edital:`${index.length} itens ativos · ${index.reduce((s,x)=>s+Number(x.questions||0),0)} questões · ${totalWeighted} pontos ponderados.`,
    },
  };
}
