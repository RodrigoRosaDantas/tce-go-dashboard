import test from "node:test";
import assert from "node:assert/strict";
import { buildStudyIntelligence, sampleConfidence } from "../src/v4/intelligence-core.mjs";

const days = [
  ["D001",1,"2026-09-23","S01","CASP"],
  ["D003",3,"2026-09-30","S02","CASP"],
  ["D005",5,"2026-10-07","S03","CASP"],
  ["D008",8,"2026-10-14","S04","CASP"],
].map(([dxx,order,date,session,focus])=>({dxx,order,date,session,focus,protected:false,readyForStudy:true}));

const baseSnapshot = {
  days,
  edital: [
    {code:"E01",discipline:"Contabilidade Aplicada ao Setor Público",block:"Específicos",questions:10,weight:2,weightedPoints:20,active:true},
    {code:"G01",discipline:"Português",block:"Gerais",questions:10,weight:1,weightedPoints:10,active:true},
  ],
  redactions: [],
  simulations: [],
};

function summary(patch={}) {
  return {
    dayControl: [],
    questionMeta: days.map((d,i)=>({dxx:d.dxx,focus:"CASP "+["I","II","III","IV"][i]+" — recorte técnico"})),
    sessions: [],
    reviews: [],
    errors: [],
    redactions: [],
    simulations: [],
    ...patch,
  };
}
const error=(patch={})=>({
  id:"e1",dxx:"D001",subject:"CASP",topic:"Receita orçamentária",error:"conceito",
  severity:"P2",fatal:false,recurrence:0,date:"2026-09-23",status:"Aberto",...patch,
});
const executed=(dxx,correct,errors,patch={})=>({
  dxx,studied:true,completed:true,status:"Concluído",timeMinutes:60,
  questionsDone:correct+errors,correct,errors,doubts:0,...patch,
});
const executionSession=(dxx,date,patch={})=>({
  dxx,eventType:"day.completed",date,timestamp:date+"T20:00:00-03:00",timeMinutes:60,questions:10,correct:8,errors:2,doubts:0,...patch,
});

test("cenário 1 — Fatal aberto impede matéria nova",()=>{
  const intel=buildStudyIntelligence({snapshot:baseSnapshot,summary:summary({errors:[error({fatal:true,severity:"P1"})]}),referenceDate:"2026-09-23"});
  assert.equal(intel.recommendation.kind,"weakness");
  assert.equal(intel.recommendation.score,100);
  assert.match(intel.recommendation.eyebrow,/FATAL/);
});

test("cenário 2 — P1 reincidente recebe prioridade alta",()=>{
  const intel=buildStudyIntelligence({snapshot:baseSnapshot,summary:summary({errors:[error({severity:"P1",recurrence:2})]}),referenceDate:"2026-09-23"});
  assert.equal(intel.recommendation.kind,"weakness");
  assert.ok(intel.recommendation.score>=90);
});

test("cenário 3 — D7 vencida + reincidência sobe prioridade sem regra burra",()=>{
  const s=summary({
    errors:[error({recurrence:2})],
    reviews:[{id:"r1",dxx:"D001",type:"D7",reason:"Reincidência",plannedDate:"2026-09-20",status:"Pendente"}],
    dayControl:[executed("D001",7,3,{completed:false,status:"Em andamento"})],
  });
  const intel=buildStudyIntelligence({snapshot:baseSnapshot,summary:s,referenceDate:"2026-09-23"});
  assert.notEqual(intel.recommendation.kind,"next-session");
  assert.ok(intel.recommendation.score>65);
});

test("cenário 4 — 3/3 continua amostra muito pequena",()=>{
  const c=sampleConfidence(3,1);
  assert.equal(c.key,"tiny");
  assert.match(c.label,/muito pequena/);
});

test("cenário 5 — 80/100 em múltiplas sessões é evidência forte mesmo abaixo de 100%",()=>{
  const c=sampleConfidence(100,4);
  assert.equal(c.key,"strong");
});

test("cenário 6 — recuperação consistente reduz prioridade relativa",()=>{
  const good=[
    executed("D001",5,5),executed("D003",6,4),executed("D005",9,1),executed("D008",9,1),
  ];
  const bad=[
    executed("D001",9,1),executed("D003",9,1),executed("D005",5,5),executed("D008",5,5),
  ];
  const sessions=[
    executionSession("D001","2026-09-23"),executionSession("D003","2026-09-30"),
    executionSession("D005","2026-10-07"),executionSession("D008","2026-10-14"),
  ];
  const e=error({recurrence:1,date:"2026-10-14"});
  const improving=buildStudyIntelligence({snapshot:baseSnapshot,summary:summary({dayControl:good,sessions,errors:[e]}),referenceDate:"2026-10-14"});
  const worsening=buildStudyIntelligence({snapshot:baseSnapshot,summary:summary({dayControl:bad,sessions,errors:[e]}),referenceDate:"2026-10-14"});
  assert.equal(improving.subjects[0].trend.key,"improving");
  assert.equal(worsening.subjects[0].trend.key,"worsening");
  assert.ok(improving.weaknesses[0].score<worsening.weaknesses[0].score);
});

test("cenário 7 — peso do edital aumenta impacto, mas não cria fraqueza sozinho",()=>{
  const s=summary({errors:[
    error({id:"high",subject:"CASP",topic:"A"}),
    error({id:"low",subject:"Português",topic:"B",dxx:"D003"}),
  ]});
  const intel=buildStudyIntelligence({snapshot:baseSnapshot,summary:s,referenceDate:"2026-09-23"});
  const high=intel.weaknesses.find((x)=>x.subject==="CASP");
  const low=intel.weaknesses.find((x)=>x.subject==="Português");
  assert.ok(high.score>low.score);
  assert.equal(high.edital?.discipline,"Contabilidade Aplicada ao Setor Público");
  const empty=buildStudyIntelligence({snapshot:baseSnapshot,summary:summary(),referenceDate:"2026-09-23"});
  assert.equal(empty.weaknesses.length,0);
});

test("cenário 8 — ausência permanece desconhecida, não 0%",()=>{
  const intel=buildStudyIntelligence({snapshot:baseSnapshot,summary:summary(),referenceDate:"2026-09-23"});
  assert.equal(intel.subjects.length,0);
  assert.equal(intel.strengths.length,0);
  assert.equal(intel.weaknesses.length,0);
  assert.match(intel.uncertainties[0].detail,/não significa 0%/);
});

test("cenário 9 — sessão interrompida é retomada sem bloqueio superior",()=>{
  const s=summary({dayControl:[executed("D001",0,0,{completed:false,status:"Em andamento",timeMinutes:25,questionsDone:0})]});
  const intel=buildStudyIntelligence({snapshot:baseSnapshot,summary:s,referenceDate:"2026-09-23"});
  assert.equal(intel.recommendation.kind,"resume");
  assert.equal(intel.recommendation.dxx,"D001");
});

test("cenário 10 — redação vencida participa do motor",()=>{
  const snapshot={...baseSnapshot,redactions:[{dxx:"D001",date:"2026-09-20",title:"R1 — Redação",code:"R1"}]};
  const intel=buildStudyIntelligence({snapshot,summary:summary(),referenceDate:"2026-09-23"});
  assert.equal(intel.recommendation.kind,"redaction");
});

test("cenário 11 — checkpoint executado recalibra decisões posteriores",()=>{
  const snapshot={...baseSnapshot,simulations:[{dxx:"D001",date:"2026-09-20",title:"Checkpoint 1",type:"Checkpoint"}]};
  const s=summary({simulations:[{dxx:"D001",date:"2026-09-20",title:"Checkpoint 1",type:"Checkpoint",generalTotal:25,generalCorrect:20,specificTotal:45,specificCorrect:32,p1Open:2,recurrent:1}]});
  const intel=buildStudyIntelligence({snapshot,summary:s,referenceDate:"2026-09-23"});
  assert.equal(intel.recommendation.kind,"simulation");
  assert.match(intel.recommendation.eyebrow,/RECALIBRAÇÃO/);
  assert.ok(intel.risks.some((x)=>x.title==="Checkpoint exige recalibração"));
});

test("cenário 12 — mesma fragilidade fica mais seletiva perto da prova",()=>{
  const far=buildStudyIntelligence({snapshot:baseSnapshot,summary:summary({errors:[error({date:"2026-09-23",recurrence:1})]}),referenceDate:"2026-09-23"});
  const near=buildStudyIntelligence({snapshot:baseSnapshot,summary:summary({errors:[error({date:"2026-12-20",recurrence:1})]}),referenceDate:"2026-12-20"});
  assert.equal(far.exam.phase,"fase de construção");
  assert.equal(near.exam.phase,"perto da prova");
  assert.ok(near.weaknesses[0].score>far.weaknesses[0].score);
});


test("alias canônico agrega focos CASP I–IV sem forçar assunto ambíguo",()=>{
  const s=summary({dayControl:[
    executed("D001",8,2),executed("D003",8,2),executed("D005",9,1),executed("D008",9,1),
  ]});
  const intel=buildStudyIntelligence({snapshot:baseSnapshot,summary:s,referenceDate:"2026-10-14"});
  assert.equal(intel.subjects.length,1);
  assert.equal(intel.subjects[0].subject,"CASP");
  assert.equal(intel.subjects[0].edital?.discipline,"Contabilidade Aplicada ao Setor Público");

  const ambiguous=buildStudyIntelligence({
    snapshot:baseSnapshot,
    summary:summary({errors:[error({subject:"Auditoria",topic:"Amostragem"})]}),
    referenceDate:"2026-09-23",
  });
  assert.equal(ambiguous.weaknesses[0].edital,null);
  assert.match(ambiguous.weaknesses[0].evidence.join(" "),/sem vínculo seguro/);
});

test("erros Validado/Encerrado não voltam como fragilidade",()=>{
  for(const status of ["Validado","Encerrado"]){
    const intel=buildStudyIntelligence({snapshot:baseSnapshot,summary:summary({errors:[error({status})]}),referenceDate:"2026-09-23"});
    assert.equal(intel.weaknesses.length,0);
  }
});


test("agenda unificada remove marcos já executados e preserva vencidos como contexto",()=>{
  const snapshot={...baseSnapshot,
    redactions:[
      {dxx:"D001",date:"2026-09-20",title:"R1",code:"R1"},
      {dxx:"D003",date:"2026-10-01",title:"R2",code:"R2"},
    ],
    simulations:[
      {dxx:"D001",date:"2026-09-21",title:"Checkpoint 1",type:"Checkpoint"},
      {dxx:"D005",date:"2026-10-07",title:"Checkpoint 2",type:"Checkpoint"},
    ],
    finalSprint:[{code:"RF01",date:"2026-12-31",title:"Reta final 1"}],
  };
  const s=summary({
    reviews:[{id:"r1",dxx:"D001",type:"D7",reason:"Conteúdo novo",plannedDate:"2026-09-22",status:"Pendente"}],
    redactions:[{dxx:"D001",title:"R1",status:"Corrigida",score:75,date:"2026-09-20",rewriteNeeded:false}],
    simulations:[{dxx:"D001",title:"Checkpoint 1",date:"2026-09-21",generalTotal:25,generalCorrect:20,specificTotal:45,specificCorrect:35}],
  });
  const intel=buildStudyIntelligence({snapshot,summary:s,referenceDate:"2026-09-23"});
  assert.ok(intel.agenda.some((x)=>x.type==="Revisão"&&x.state==="overdue"));
  assert.ok(intel.agenda.some((x)=>x.title==="R2"));
  assert.ok(intel.agenda.some((x)=>x.title==="Checkpoint 2"));
  assert.ok(intel.agenda.some((x)=>x.type==="Reta Final"));
  assert.ok(intel.agenda.some((x)=>x.type==="Prova"));
  assert.ok(!intel.agenda.some((x)=>x.title==="R1"));
  assert.ok(!intel.agenda.some((x)=>x.title==="Checkpoint 1"));
});

test("checkpoint comparável detecta piora sem inventar precisão quando faltam campos",()=>{
  const first={dxx:"D001",title:"C1",date:"2026-09-10",generalTotal:25,generalCorrect:22,specificTotal:45,specificCorrect:38,p1Open:0,recurrent:0};
  const second={dxx:"D003",title:"C2",date:"2026-09-20",generalTotal:25,generalCorrect:17,specificTotal:45,specificCorrect:28,p1Open:0,recurrent:0};
  const intel=buildStudyIntelligence({snapshot:baseSnapshot,summary:summary({simulations:[first,second]}),referenceDate:"2026-09-23"});
  assert.equal(intel.checkpoint.trend.key,"worsening");
  assert.ok(intel.checkpoint.weightedAccuracy<80);
  assert.equal(intel.recommendation.kind,"simulation");
  assert.ok(intel.risks.some((x)=>x.title==="Checkpoint exige recalibração"));

  const incomplete=buildStudyIntelligence({snapshot:baseSnapshot,summary:summary({simulations:[{...second,specificCorrect:null}]}),referenceDate:"2026-09-23"});
  assert.equal(incomplete.checkpoint.weightedAccuracy,null);
});

test("checkpoint com contadores vazios não exibe zero inventado",()=>{
  const first={dxx:"D001",title:"C1",date:"2026-09-10",generalTotal:25,generalCorrect:22,specificTotal:45,specificCorrect:38,p1Open:null,recurrent:null};
  const second={dxx:"D003",title:"C2",date:"2026-09-20",generalTotal:25,generalCorrect:17,specificTotal:45,specificCorrect:28,p1Open:null,recurrent:null};
  const intel=buildStudyIntelligence({snapshot:baseSnapshot,summary:summary({simulations:[first,second]}),referenceDate:"2026-09-23"});
  assert.equal(intel.checkpoint.trend.key,"worsening");
  assert.equal(intel.recommendation.kind,"simulation");
  assert.ok(intel.recommendation.evidence.some((x)=>/não informad/.test(x)));
  assert.ok(!intel.recommendation.evidence.some((x)=>/^0 P1/.test(x)));
  assert.match(intel.risks.find((x)=>x.title==="Checkpoint exige recalibração").detail,/P1 —/);
});

test("critério de redação ausente não vira zero e reescrita antiga continua pendente",()=>{
  const s=summary({redactions:[
    {dxx:"D001",title:"R1",status:"Corrigida",score:70,date:"2026-09-10",rewriteNeeded:true,mainError:"coesão",thematicCut:15,criticalInterpretation:null,progression:24,cohesion:9,morphosyntax:5,vocabulary:7},
    {dxx:"D003",title:"R2",status:"Corrigida",score:82,date:"2026-09-20",rewriteNeeded:false,mainError:null,thematicCut:18,criticalInterpretation:17,progression:25,cohesion:14,morphosyntax:5,vocabulary:7},
  ]});
  const intel=buildStudyIntelligence({snapshot:baseSnapshot,summary:s,referenceDate:"2026-09-23"});
  assert.equal(intel.writing.pendingRewrite.dxx,"D001");
  assert.equal(intel.writing.pendingRewriteCount,1);
  assert.equal(intel.writing.weakestCriterion.label,"progressão");
  assert.notEqual(intel.writing.weakestCriterion.label,"interpretação crítica");
  assert.equal(intel.recommendation.kind,"redaction");
});

test("alto impacto com alias CASP praticado não vira falso risco de ausência",()=>{
  const s=summary({dayControl:[executed("D001",8,2),executed("D003",8,2)]});
  const intel=buildStudyIntelligence({snapshot:baseSnapshot,summary:s,referenceDate:"2026-12-20"});
  assert.ok(!intel.risks.some((x)=>x.title.includes("Contabilidade Aplicada ao Setor Público · alto impacto sem amostra")));
});

test("tendência usa data real de execução, não data planejada do Dxx",()=>{
  const rows=[
    executed("D001",5,5),executed("D003",6,4),executed("D005",9,1),executed("D008",9,1),
  ];
  const sessions=[
    executionSession("D005","2026-09-01"),executionSession("D008","2026-09-02"),
    executionSession("D001","2026-10-01"),executionSession("D003","2026-10-02"),
  ];
  const intel=buildStudyIntelligence({snapshot:baseSnapshot,summary:summary({dayControl:rows,sessions}),referenceDate:"2026-10-14"});
  assert.equal(intel.subjects[0].trend.key,"worsening");
  assert.equal(intel.subjects[0].temporalEvents,4);
});

test("métrica ausente permanece ausente e não autoriza força",()=>{
  const row=executed("D001",0,0,{questionsDone:null,correct:null,errors:null,doubts:null,timeMinutes:60});
  const intel=buildStudyIntelligence({snapshot:baseSnapshot,summary:summary({dayControl:[row]}),referenceDate:"2026-09-23"});
  assert.equal(intel.subjects[0].questions,null);
  assert.equal(intel.subjects[0].accuracy,null);
  assert.equal(intel.subjects[0].performanceComplete,false);
  assert.equal(intel.strengths.length,0);
  assert.match(intel.uncertainties[0].detail,/métricas ausentes/);
});

test("erro com nome formal herda amostra e tendência do alias CASP",()=>{
  const rows=[
    executed("D001",9,1),executed("D003",9,1),executed("D005",5,5),executed("D008",5,5),
  ];
  const sessions=[
    executionSession("D001","2026-09-23"),executionSession("D003","2026-09-30"),
    executionSession("D005","2026-10-07"),executionSession("D008","2026-10-14"),
  ];
  const formal=error({subject:"Contabilidade Aplicada ao Setor Público",recurrence:1,date:"2026-10-14"});
  const intel=buildStudyIntelligence({snapshot:baseSnapshot,summary:summary({dayControl:rows,sessions,errors:[formal]}),referenceDate:"2026-10-14"});
  assert.equal(intel.weaknesses[0].confidence.key,intel.subjects[0].confidence.key);
  assert.equal(intel.weaknesses[0].trend.key,"worsening");
});

test("redação Planejada pré-criada no banco continua aparecendo na Agenda",()=>{
  const snapshot={...baseSnapshot,redactions:[{dxx:"D001",date:"2026-10-01",title:"R1",code:"R1"}]};
  const s=summary({redactions:[{dxx:"D001",title:"R1",status:"Planejada",score:null,date:"2026-10-01",rewriteNeeded:false}]});
  const intel=buildStudyIntelligence({snapshot,summary:s,referenceDate:"2026-09-23"});
  assert.ok(intel.agenda.some((x)=>x.type==="Redação"&&x.dxx==="D001"));
  assert.ok(!intel.agenda.some((x)=>x.type==="Redação em produção"&&x.dxx==="D001"));
});

test("redação Em produção continua visível para retomada",()=>{
  const snapshot={...baseSnapshot,redactions:[{dxx:"D001",date:"2026-09-20",title:"R1",code:"R1"}]};
  const s=summary({redactions:[{dxx:"D001",title:"R1",status:"Em produção",score:null,date:"2026-09-20",rewriteNeeded:false}]});
  const intel=buildStudyIntelligence({snapshot,summary:s,referenceDate:"2026-09-23"});
  assert.equal(intel.writing.productionPending.dxx,"D001");
  assert.equal(intel.recommendation.kind,"redaction");
  assert.match(intel.recommendation.eyebrow,/RETOMAR REDAÇÃO/);
  assert.ok(intel.agenda.some((x)=>x.type==="Redação em produção"&&x.dxx==="D001"));
  assert.ok(!intel.agenda.some((x)=>x.type==="Redação"&&x.dxx==="D001"));
});

test("sessão com zero questões não inventa acertos nem gera falsa ausência de resposta",()=>{
  const row=executed("D001",0,0,{questionsDone:0,correct:null,errors:null,doubts:null,timeMinutes:60});
  const intel=buildStudyIntelligence({snapshot:baseSnapshot,summary:summary({dayControl:[row]}),referenceDate:"2026-09-23"});
  assert.equal(intel.subjects[0].questions,0);
  assert.equal(intel.subjects[0].performanceComplete,true);
  assert.equal(intel.subjects[0].accuracy,null);
  assert.equal(intel.strengths.length,0);
});

test("redação Produzida continua pendente de correção no Mentor e na Agenda",()=>{
  const snapshot={...baseSnapshot,redactions:[{dxx:"D001",date:"2026-09-20",title:"R1",code:"R1"}]};
  const s=summary({redactions:[{dxx:"D001",title:"R1",status:"Produzida",score:null,date:"2026-09-20",rewriteNeeded:false}]});
  const intel=buildStudyIntelligence({snapshot,summary:s,referenceDate:"2026-09-23"});
  assert.equal(intel.writing.correctionPending.dxx,"D001");
  assert.equal(intel.recommendation.kind,"redaction");
  assert.match(intel.recommendation.eyebrow,/CORRIGIR REDAÇÃO/);
  assert.ok(intel.agenda.some((x)=>x.type==="Correção de redação"&&x.dxx==="D001"));
  assert.ok(!intel.agenda.some((x)=>x.type==="Redação"&&x.dxx==="D001"));
});

test("redação corrigida com reescrita volta ao motor e registra reincidência",()=>{
  const s=summary({redactions:[
    {dxx:"D001",title:"R1",status:"Corrigida",score:72,date:"2026-09-10",rewriteNeeded:true,mainError:"coesão"},
    {dxx:"D003",title:"R2",status:"Corrigida",score:76,date:"2026-09-20",rewriteNeeded:true,mainError:"coesão"},
  ]});
  const intel=buildStudyIntelligence({snapshot:baseSnapshot,summary:s,referenceDate:"2026-09-23"});
  assert.equal(intel.recommendation.kind,"redaction");
  assert.equal(intel.writing.repeatedMainError.count,2);
  assert.ok(intel.risks.some((x)=>x.title==="Redação com reescrita pendente"));
});
