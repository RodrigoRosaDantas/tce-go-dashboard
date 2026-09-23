import { useEffect, useMemo, useState } from "react";
import { loadSnapshot, publicRoute } from "./data";
import type { Snapshot } from "./types";
import { Shell } from "./v3/Shell";
import { HomePage } from "./v3/HomePage";
import { StudyPage, QuestionPage } from "./v3/StudyPage";
import { PerformancePage } from "./v3/PerformancePage";
import {
  EditalPage,
  ErrorsPage,
  FinalSprintPage,
  LegislationPage,
  NotFoundPage,
  RedactionsPage,
  RevisionsPage,
  SimulationsPage,
  SyncPage,
  TrailPage,
} from "./v3/AuxPages";

function LoadingScreen() {
  return (
    <div className="boot-screen">
      <div className="boot-mark">TC</div>
      <strong>Carregando TCE-GO</strong>
      <span>Validando snapshot publicado…</span>
      <div className="boot-line"><i /></div>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="boot-screen error">
      <div className="boot-mark">!</div>
      <strong>Falha ao carregar o snapshot</strong>
      <span>{message}</span>
      <button type="button" onClick={() => window.location.reload()}>Tentar novamente</button>
    </div>
  );
}

export default function AppV3() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const route = useMemo(() => publicRoute(window.location.pathname), []);

  useEffect(() => {
    loadSnapshot().then(setSnapshot).catch((reason: Error) => setError(reason.message));
  }, []);

  if (error) return <ErrorScreen message={error} />;
  if (!snapshot) return <LoadingScreen />;

  const dayMatch = route.match(/^\/dia\/(d\d{3})\/$/i);
  const questionMatch = route.match(/^\/questoes\/(q\d{3})\/$/i);

  let page: React.ReactNode;
  if (route === "/") page = <HomePage snapshot={snapshot} />;
  else if (route === "/dias/") page = <TrailPage snapshot={snapshot} />;
  else if (dayMatch) page = <StudyPage snapshot={snapshot} dxx={dayMatch[1]} />;
  else if (questionMatch) page = <QuestionPage snapshot={snapshot} qxx={questionMatch[1]} />;
  else if (route === "/revisoes/") page = <RevisionsPage snapshot={snapshot} />;
  else if (route === "/redacoes/") page = <RedactionsPage snapshot={snapshot} />;
  else if (route === "/erros/") page = <ErrorsPage snapshot={snapshot} />;
  else if (route === "/simulados/") page = <SimulationsPage snapshot={snapshot} />;
  else if (route === "/desempenho/") page = <PerformancePage snapshot={snapshot} />;
  else if (route === "/edital/") page = <EditalPage snapshot={snapshot} />;
  else if (route === "/legislacao/") page = <LegislationPage snapshot={snapshot} />;
  else if (route === "/reta-final/") page = <FinalSprintPage snapshot={snapshot} />;
  else if (route === "/sync/") page = <SyncPage snapshot={snapshot} />;
  else page = <NotFoundPage />;

  return <Shell snapshot={snapshot}>{page}</Shell>;
}
