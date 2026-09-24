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
const EXECUTION_EVENT_TYPES=new Set(["progress.snapshot","questions.result","day.completed","day.reopened"]);
function executionDateForDxx(summary,dxx){
  const dates=(summary.sessions||[])
    .filter(item=>String(item.dxx||"").toUpperCase()===String(dxx||"").toUpperCase())
    .filter(item=>{
      const event=String(item.eventType||"");
      if(event) return EXECUTION_EVENT_TYPES.has(event);
      return [item.timeMinutes,item.questions,item.correct,item.errors,item.doubts].some(value=>value!=null&&Number(value)>0);
    })
    .map(item=>dateOnly(item.timestamp||item.date))
    .filter(Boolean)
    .sort();
  return dates.at(-1)||null;
}
function buildSubjectStats(summary,index){
  const groups=new Map();
  for(const row of summary.dayControl||[]){
    if(!hasExecution(row)) continue;
    const subject=subjectForDay(summary,row.dxx)||"Matéria não informada";
    const key=norm(subject)||subject;
    const g=groups.get(key)||{
      subject,sessions:0,knownQuestionSessions:0,questionsSum:0,correctSum:0,errorsSum:0,doubtsSum:0,minutesSum:0,
      questionsComplete:true,correctComplete:true,errorsComplete:true,doubtsComplete:true,minutesComplete:true,events:[]
    };
    g.sessions+=1;
    if(row.questionsDone==null) g.questionsComplete=false; else {g.questionsSum+=Number(row.questionsDone);g.knownQuestionSessions+=1;}
    if(row.correct==null) {
      if(row.questionsDone==null||Number(row.questionsDone)>0) g.correctComplete=false;
    } else g.correctSum+=Number(row.correct);
    if(row.errors==null) {
      if(row.questionsDone==null||Number(row.questionsDone)>0) g.errorsComplete=false;
    } else g.errorsSum+=Number(row.errors);
    if(row.doubts==null) g.doubtsComplete=false; else g.doubtsSum+=Number(row.doubts);
    if(row.timeMinutes==null) g.minutesComplete=false; else g.minutesSum+=Number(row.timeMinutes);
    const a=accuracy(row.correct,row.errors);
    const eventDate=executionDateForDxx(summary,row.dxx);
    if(a!=null&&eventDate) g.events.push({date:eventDate,accuracy:a,dxx:row.dxx});
    groups.set(key,g);
  }
  return [...groups.values()].map(g=>{
    const questions=g.questionsComplete?g.questionsSum:null;
    const correct=g.correctComplete?g.correctSum:null;
    const errors=g.errorsComplete?g.errorsSum:null;
    const doubts=g.doubtsComplete?g.doubtsSum:null;
    const minutes=g.minutesComplete?g.minutesSum:null;
    const performanceComplete=g.questionsComplete&&g.correctComplete&&g.errorsComplete;
    const baseConfidence=sampleConfidence(g.questionsSum,g.knownQuestionSessions);
    const confidence=performanceComplete
      ? baseConfidence
      : {...baseConfidence,label:baseConfidence.rank?baseConfidence.label+" · dados parciais":"dados parciais sem amostra suficiente",partial:true};
    const a=accuracy(correct,errors);
    const edital=matchEdital(g.subject,index);
    const events=[...g.events].sort((x,y)=>String(x.date).localeCompare(String(y.date)));
    let trend={key:"insufficient",label:"amostra temporal insuficiente",delta:null,events:events.length};
    if(events.length>=4){
      const current=events.slice(-2).reduce((s,x)=>s+x.accuracy,0)/2;
      const previous=events.slice(-4,-2).reduce((s,x)=>s+x.accuracy,0)/2;
      const delta=current-previous;
      const partial=events.length<g.sessions;
      trend=delta>=5?{key:"improving",label:partial?"melhorando · datas parciais":"melhorando",delta,events:events.length}
        :delta<=-5?{key:"worsening",label:partial?"piorando · datas parciais":"piorando",delta,events:events.length}
        :{key:"stable",label:partial?"estável · datas parciais":"estável",delta,events:events.length};
    }
    return {
      subject:g.subject,sessions:g.sessions,questions,knownQuestions:g.questionsSum,knownQuestionSessions:g.knownQuestionSessions,
      correct,errors,doubts,minutes,accuracy:a,performanceComplete,confidence,edital,trend,temporalEvents:events.length
    };
  }).sort((a,b)=>(b.edital?.weightedPoints||0)-(a.edital?.weightedPoints||0)||(b.knownQuestions||0)-(a.knownQuestions||0));
}
function buildCoverage(summary,index,subjects){
  const matchedCodes=(labels)=>new Set(labels.map(label=>matchEdital(label,index)?.code).filter(Boolean));
  const inTrail=matchedCodes((summary.questionMeta||[]).map(item=>item.focus).filter(Boolean));
  const studied=matchedCodes(subjects.filter(item=>item.sessions>0).map(item=>item.subject));
  const practiced=matchedCodes(subjects.filter(item=>(item.knownQuestions||0)>0).map(item=>item.subject));
  const evidenced=matchedCodes(subjects.filter(item=>(item.knownQuestions||0)>0&&item.confidence.rank>=1).map(item=>item.subject));
  const consolidated=matchedCodes(subjects.filter(item=>item.performanceComplete&&item.confidence.rank>=3).map(item=>item.subject));
  const weighted=(set)=>index.filter(item=>set.has(item.code)).reduce((sum,item)=>sum+Number(item.weightedPoints||0),0);
  const totalWeighted=index.reduce((sum,item)=>sum+Number(item.weightedPoints||0),0);
  return {
    activeItems:index.length,
    inTrailItems:inTrail.size,
    studiedItems:studied.size,
    practicedItems:practiced.size,
    evidenceItems:evidenced.size,
    consolidatedItems:consolidated.size,
    weightedEvidence:weighted(evidenced),
    weightedConsolidated:weighted(consolidated),
    totalWeighted,
    note:"Cobertura é vínculo seguro por disciplina/item do edital. Material publicado não equivale a domínio; consolidação exige amostra ao menos moderada.",
  };
}
function strengthLevel(row){
  if(!row.performanceComplete||row.accuracy==null) return null;
  if(row.confidence.rank<3||row.accuracy<85) return null;
  if(row.trend.key==="worsening") return null;
  if(row.confidence.key==="strong"&&row.accuracy>=90) return "forte com boa amostra";
  if(row.accuracy>=90) return "forte";
  if(row.trend.key==="improving") return "recuperando";
  return "estável";
}
function recencyPoints(days){if(days==null||days<0)return 0;if(days<=2)return 10;if(days<=7)return 8;if(days<=14)return 6;if(days<=30)return 3;return 0;}
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
    const edital=matchEdital(g.subject,index);
    const subjectRow=edital
      ? subjectStats.find(row=>row.edital?.code===edital.code)
      : subjectStats.find(row=>norm(canonicalSubjectLabel(row.subject))===norm(canonicalSubjectLabel(g.subject)));
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
const WRITING_CRITERIA=[
  ["thematicCut","recorte temático",20],
  ["criticalInterpretation","interpretação crítica",20],
  ["progression","progressão",30],
  ["cohesion","coesão",16],
  ["morphosyntax","morfossintaxe",6],
  ["vocabulary","vocabulário",8],
];
function buildWritingSignal(summary){
  const rows=(summary.redactions||[]).filter(item=>["Em produção","Produzida"].includes(item.status)||item.score!=null||item.rewriteNeeded||item.mainError||WRITING_CRITERIA.some(([key])=>item[key]!=null));
  const chronology=[...rows].sort((a,b)=>String(a.date||a.lastEditedAt||"").localeCompare(String(b.date||b.lastEditedAt||"")));
  const scored=chronology.filter(item=>item.score!=null);
  const latest=chronology.at(-1)||null;
  const productionPending=chronology.filter(item=>item.status==="Em produção").at(-1)||null;
  const correctionPending=chronology.filter(item=>item.status==="Produzida"&&item.score==null).at(-1)||null;
  const pendingRewrites=chronology.filter(item=>item.rewriteNeeded&&item.status!=="Reescrita");
  const pendingRewrite=pendingRewrites.at(-1)||null;
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
  let weakestCriterion=null;
  if(latest){
    const values=WRITING_CRITERIA
      .map(([key,label,max])=>latest[key]==null?null:{key,label,max,value:Number(latest[key]),pct:Number(latest[key])/Number(max)*100})
      .filter(Boolean)
      .sort((a,b)=>a.pct-b.pct);
    weakestCriterion=values[0]||null;
  }
  return {
    count:rows.length,scoredCount:scored.length,latest,trend,productionPending,correctionPending,
    rewriteNeeded:Boolean(pendingRewrite),pendingRewrite,pendingRewriteCount:pendingRewrites.length,
    repeatedMainError:repeated&&repeated[1]>=2?{key:repeated[0],count:repeated[1]}:null,
    weakestCriterion,
  };
}
function checkpointAccuracy(item){
  if(!item) return {general:null,specific:null,weighted:null};
  const ratio=(correct,total)=>correct!=null&&total!=null&&Number(total)>0?Number(correct)/Number(total)*100:null;
  const general=ratio(item.generalCorrect,item.generalTotal);
  const specific=ratio(item.specificCorrect,item.specificTotal);
  const hasWeighted=[item.generalCorrect,item.generalTotal,item.specificCorrect,item.specificTotal].every(value=>value!=null)
    && Number(item.generalTotal)>0 && Number(item.specificTotal)>0;
  const weighted=hasWeighted
    ? (Number(item.generalCorrect)+2*Number(item.specificCorrect))/(Number(item.generalTotal)+2*Number(item.specificTotal))*100
    : null;
  return {general,specific,weighted};
}
function buildCheckpointSignal(summary){
  const rows=(summary.simulations||[]).filter(hasSimulationEvidence)
    .sort((a,b)=>String(a.date||a.lastEditedAt||"").localeCompare(String(b.date||b.lastEditedAt||"")));
  const latest=rows.at(-1)||null;
  if(!latest) return {count:0,latest:null,generalAccuracy:null,specificAccuracy:null,weightedAccuracy:null,trend:{key:"insufficient",label:"amostra temporal insuficiente",delta:null}};
  const current=checkpointAccuracy(latest);
  const comparable=rows.map(item=>({item,...checkpointAccuracy(item)})).filter(item=>item.weighted!=null);
  let trend={key:"insufficient",label:"amostra temporal insuficiente",delta:null};
  if(comparable.length>=2){
    const previous=comparable.at(-2).weighted, now=comparable.at(-1).weighted, delta=now-previous;
    trend=delta>=5?{key:"improving",label:"melhorando",delta}:delta<=-5?{key:"worsening",label:"piorando",delta}:{key:"stable",label:"estável",delta};
  }
  return {
    count:rows.length,latest,
    generalAccuracy:current.general,
    specificAccuracy:current.specific,
    weightedAccuracy:current.weighted,
    trend,
  };
}
function buildAgenda(snapshot,summary,referenceDate,examDate){
  const redactionStarted=new Set((summary.redactions||[]).map(item=>item.dxx));
  const productionPending=(summary.redactions||[]).filter(item=>item.status==="Em produção");
  const correctionPending=(summary.redactions||[]).filter(item=>item.status==="Produzida"&&item.score==null);
  const simulationDone=new Set((summary.simulations||[]).filter(hasSimulationEvidence).map(item=>item.dxx));
  const rows=[
    ...(summary.reviews||[])
      .filter(item=>!["Concluída","Cancelada por domínio"].includes(item.status)&&dateOnly(item.plannedDate))
      .map(item=>({date:dateOnly(item.plannedDate),type:"Revisão",title:`${item.type} · ${item.dxx}`,href:"/revisoes/",dxx:item.dxx})),
    ...productionPending.map(item=>({date:dateOnly(item.date||item.lastEditedAt)||referenceDate,type:"Redação em produção",title:item.title,href:"/redacoes/",dxx:item.dxx})),
    ...correctionPending.map(item=>({date:dateOnly(item.date||item.lastEditedAt)||referenceDate,type:"Correção de redação",title:item.title,href:"/redacoes/",dxx:item.dxx})),
    ...(snapshot.redactions||[])
      .filter(item=>item.date&&!redactionStarted.has(item.dxx))
      .map(item=>({date:dateOnly(item.date),type:"Redação",title:item.title,href:"/redacoes/",dxx:item.dxx})),
    ...(snapshot.simulations||[])
      .filter(item=>item.date&&!simulationDone.has(item.dxx))
      .map(item=>({date:dateOnly(item.date),type:item.type||"Checkpoint",title:item.title,href:"/simulados/",dxx:item.dxx})),
    ...(snapshot.finalSprint||[])
      .filter(item=>item.date&&dateOnly(item.date)>=referenceDate)
      .map(item=>({date:dateOnly(item.date),type:"Reta Final",title:item.title,href:"/reta-final/",code:item.code})),
    {date:dateOnly(examDate),type:"Prova",title:"TCE-GO · FCC",href:"/edital/"},
  ].filter(item=>item.date);
  return rows.map(item=>({...item,state:item.date<referenceDate?"overdue":item.date===referenceDate?"today":"upcoming"}))
    .sort((a,b)=>{
      const rank={overdue:0,today:1,upcoming:2};
      return rank[a.state]-rank[b.state]||a.date.localeCompare(b.date)||a.type.localeCompare(b.type,"pt-BR");
    });
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
  if(writing.productionPending){
    candidates.push({kind:"redaction",score:68,eyebrow:"RETOMAR REDAÇÃO",title:writing.productionPending.title||writing.productionPending.dxx,reason:"A redação está com status Em produção no banco canônico; concluir o texto evita fragmentar o ciclo discursivo.",href:`/redacoes/?dxx=${writing.productionPending.dxx}`,dxx:writing.productionPending.dxx,badge:"Em produção",evidence:["status Em produção no banco canônico","execução discursiva iniciada e ainda não produzida"],breakdown:{continuity:68}});
  }
  if(writing.correctionPending){
    candidates.push({kind:"redaction",score:74,eyebrow:"CORRIGIR REDAÇÃO",title:writing.correctionPending.title||writing.correctionPending.dxx,reason:"A redação foi produzida, mas ainda não possui correção/nota. O fluxo FCC precisa fechar diagnóstico antes de seguir como concluído.",href:`/redacoes/?dxx=${writing.correctionPending.dxx}`,dxx:writing.correctionPending.dxx,badge:"Correção pendente",evidence:["status Produzida no banco canônico","nota simulada ainda ausente","a visão Pendentes do Notion inclui redações Produzidas"],breakdown:{correction:74}});
  }
  if(writing.rewriteNeeded&&writing.pendingRewrite){
    const repeat=writing.repeatedMainError?.count||0;
    const score=clamp(76+(repeat>=2?8:0)+(writing.trend.key==="worsening"?4:0),0,88);
    candidates.push({kind:"redaction",score,eyebrow:"REESCRITA DE REDAÇÃO",title:writing.pendingRewrite.title||writing.pendingRewrite.dxx,reason:"A correção registrou necessidade de reescrita; a redação volta ao motor em vez de ficar isolada.",href:`/redacoes/?dxx=${writing.pendingRewrite.dxx}`,dxx:writing.pendingRewrite.dxx,badge:"Reescrita",evidence:["reescrita necessária registrada",writing.pendingRewrite.mainError?`erro principal: ${writing.pendingRewrite.mainError}`:"erro principal não informado",writing.weakestCriterion?`critério mais frágil no último registro: ${writing.weakestCriterion.label} (${writing.weakestCriterion.value}/${writing.weakestCriterion.max})`:"critérios sem preenchimento suficiente",repeat>=2?`erro principal reincidente em ${repeat} redações`:"sem reincidência comprovada do erro principal"],breakdown:{rewrite:76,recurrence:repeat>=2?8:0,trend:writing.trend.key==="worsening"?4:0}});
  }
  if(checkpoint.latest&&((checkpoint.latest.p1Open??0)>0||(checkpoint.latest.recurrent??0)>0||checkpoint.trend.key==="worsening")){
    const p1=Number(checkpoint.latest.p1Open??0), recurrent=Number(checkpoint.latest.recurrent??0);
    const trendPoints=checkpoint.trend.key==="worsening"?6:0;
    const score=clamp(74+Math.min(10,p1*5)+Math.min(6,recurrent*3)+trendPoints,0,90);
    const p1Evidence=checkpoint.latest.p1Open==null?"P1 abertos não informados":`${checkpoint.latest.p1Open} P1 aberto(s) no checkpoint`;
    const recurrentEvidence=checkpoint.latest.recurrent==null?"reincidências não informadas":`${checkpoint.latest.recurrent} reincidência(s) registrada(s)`;
    candidates.push({kind:"simulation",score,eyebrow:"RECALIBRAÇÃO PÓS-CHECKPOINT",title:checkpoint.latest.title||checkpoint.latest.dxx,reason:"O checkpoint trouxe sinal objetivo de recuperação necessária; a execução seguinte deve absorver esse diagnóstico.",href:`/simulados/?dxx=${checkpoint.latest.dxx}`,dxx:checkpoint.latest.dxx,badge:"Pós-checkpoint",evidence:[p1Evidence,recurrentEvidence,checkpoint.weightedAccuracy==null?"precisão ponderada não calculável":`precisão ponderada: ${checkpoint.weightedAccuracy.toFixed(1)}%`,checkpoint.trend.delta==null?checkpoint.trend.label:`${checkpoint.trend.label}: ${checkpoint.trend.delta>0?"+":""}${checkpoint.trend.delta.toFixed(1)} p.p.`,checkpoint.latest.weakKnownSubjects?`fragilidades declaradas: ${checkpoint.latest.weakKnownSubjects}`:checkpoint.latest.decision||"decisão pós-checkpoint não informada"],breakdown:{checkpoint:74,p1:Math.min(10,p1*5),recurrence:Math.min(6,recurrent*3),trend:trendPoints}});
  }
  const redactionStatus=new Map((summary.redactions||[]).map(x=>[x.dxx,x.status]));
  const red=(snapshot.redactions||[]).find(plan=>{
    const status=redactionStatus.get(plan.dxx);
    return plan.date<=referenceDate&&(!status||status==="Planejada");
  });
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
  const anyExecution=subjectStats.some(x=>(x.knownQuestions||0)>0);
  if(anyExecution||["near","final"].includes(phase.key)){
    for(const item of index.filter(x=>x.impact>=.75)){
      const row=subjectStats.find(s=>s.edital?.code===item.code);
      if(!row||(row.knownQuestions||0)===0) out.push({level:"attention",title:`${item.discipline} · alto impacto sem amostra`,detail:`${item.weightedPoints} pontos ponderados no edital e nenhuma questão de execução associada de forma segura.`,href:"/edital/",evidence:["alto impacto editalício","sem amostra operacional vinculada"]});
    }
  }
  const overdue=(summary.reviews||[]).filter(r=>!["Concluída","Cancelada por domínio"].includes(r.status)&&dateOnly(r.plannedDate)&&dateOnly(r.plannedDate)<phase.referenceDate);
  if(overdue.length) out.push({level:"attention",title:`${overdue.length} revisão(ões) vencida(s)`,detail:"Atraso de retenção confirmado no banco canônico; a prioridade individual depende do motivo e da gravidade.",href:"/revisoes/",evidence:["datas canônicas de revisão"]});
  if(writing.rewriteNeeded&&writing.pendingRewrite) out.push({level:"attention",title:"Redação com reescrita pendente",detail:writing.pendingRewrite.mainError?`Erro principal: ${writing.pendingRewrite.mainError}`:"A correção marcou reescrita necessária.",href:"/redacoes/",evidence:["reescrita necessária registrada",writing.weakestCriterion?`critério mais frágil: ${writing.weakestCriterion.label}`:"critérios incompletos",writing.repeatedMainError?`erro principal repetido ${writing.repeatedMainError.count} vezes`:"sem reincidência comprovada"]});
  if(checkpoint.latest&&((checkpoint.latest.p1Open??0)>0||(checkpoint.latest.recurrent??0)>0||checkpoint.trend.key==="worsening")) {
    const p1Label=checkpoint.latest.p1Open==null?"P1 —":`${checkpoint.latest.p1Open} P1 aberto(s)`;
    const recurrentLabel=checkpoint.latest.recurrent==null?"reincidências —":`${checkpoint.latest.recurrent} reincidência(s)`;
    out.push({level:(checkpoint.latest.p1Open??0)>0?"critical":"attention",title:"Checkpoint exige recalibração",detail:`${p1Label} · ${recurrentLabel} · ${checkpoint.trend.label}`,href:"/simulados/",evidence:["resultado real de checkpoint",checkpoint.weightedAccuracy==null?"precisão ponderada ausente":`precisão ponderada ${checkpoint.weightedAccuracy.toFixed(1)}%`,checkpoint.trend.delta==null?"sem comparação temporal":`variação ${checkpoint.trend.delta.toFixed(1)} p.p.`]});
  }
  return out.slice(0,10);
}

export function buildStudyIntelligence({snapshot,summary,referenceDate,examDate=TCE_EXAM.date}){
  const ref=referenceDate||new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const phase={...examPhase(ref,examDate),referenceDate:ref};
  const index=editalIndex(snapshot);
  const subjects=buildSubjectStats(summary,index);
  const weaknesses=weaknessGroups(snapshot,summary,index,subjects,ref,phase);
  const strengths=subjects.map(row=>({...row,level:strengthLevel(row)})).filter(row=>row.level);
  const writing=buildWritingSignal(summary);
  const checkpoint=buildCheckpointSignal(summary);
  const coverage=buildCoverage(summary,index,subjects);
  const agenda=buildAgenda(snapshot,summary,ref,examDate);
  const uncertainties=[];
  if(!subjects.length) uncertainties.push({title:"Desempenho ainda sem amostra",detail:"Nenhuma sessão real com questões foi localizada. Isso não significa 0% nem fraqueza."});
  for(const row of subjects.filter(x=>x.confidence.rank<3||!x.performanceComplete)) {
    const quantity=row.questions==null?row.knownQuestions+" questão(ões) conhecidas; há métricas ausentes":row.questions+" questão(ões)";
    uncertainties.push({title:`${row.subject}: ${row.confidence.label}`,detail:quantity+" em "+row.sessions+" sessão(ões); ainda insuficiente para afirmar domínio."});
  }
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
    coverage,
    agenda,
    methodology:{
      priority:"0–100 = severidade 25 + reincidência 15 + recência 10 + retenção 15 + impacto do edital 15 + tendência 10 + confiança 5 + horizonte 5. Um erro isolado não P1/Fatal é limitado a 49.",
      confidence:"Amostra: <10 questões = muito pequena; 10–24 ou <2 sessões = pequena; 25–59 com ≥2 sessões = moderada; ≥60 com ≥3 sessões = forte. Campo ausente permanece ausente: amostra parcial pode orientar fragilidade, mas não autoriza declarar força.",
      strength:"Força exige precisão ≥85%, evidência ao menos moderada e ausência de tendência de piora. 100% em poucas questões continua sendo amostra pequena.",
      decision:"Fatal/P1 entram acima da expansão. Revisões não bloqueiam por tipo apenas: atraso, motivo, reincidência, edital e fragilidade associada alteram prioridade. Redação Em produção permanece como retomada; Redação Produzida permanece pendente de correção; redação corrigida volta ao motor quando há reescrita/reincidência; checkpoint real recalibra quando há P1, reincidência ou piora comparável. A Ordem D001–D100/S01–S47 nunca é reescrita.",
      edital:`${index.length} itens ativos · ${index.reduce((s,x)=>s+Number(x.questions||0),0)} questões · ${totalWeighted} pontos ponderados. ${coverage.evidenceItems}/${coverage.activeItems} itens têm alguma evidência operacional; ${coverage.consolidatedItems} têm amostra ao menos moderada.`,
      agenda:"Agenda integra revisões, redações planejadas, redações Em produção, correções de redação Produzida, checkpoints não executados, reta final e prova. Ela é contexto temporal e nunca reordena a sequência pedagógica canônica. Tendência por matéria usa datas reais do banco Sessões; data planejada do Dxx não substitui execução.",
    },
  };
}
