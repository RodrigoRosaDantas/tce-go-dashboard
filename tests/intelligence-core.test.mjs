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
  const e=error({recurrence:1,date:"2026-10-14"});
  const improving=buildStudyIntelligence({snapshot:baseSnapshot,summary:summary({dayControl:good,errors:[e]}),referenceDate:"2026-10-14"});
  const worsening=buildStudyIntelligence({snapshot:baseSnapshot,summary:summary({dayControl:bad,errors:[e]}),referenceDate:"2026-10-14"});
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
