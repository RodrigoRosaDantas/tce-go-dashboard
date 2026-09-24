export const TCE_EXAM: Readonly<{status:string;board:string;date:string;objectiveQuestions:number;weightedPoints:number}>;
export function sampleConfidence(totalQuestions?:number,sessions?:number): {key:string;label:string;rank:number};
export function buildStudyIntelligence(args:{snapshot:any;summary:any;referenceDate?:string;examDate?:string}): any;
