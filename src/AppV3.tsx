import { useEffect, useMemo, useState } from "react";
import { loadSnapshot, publicRoute } from "./data";
import type { Snapshot } from "./types";
import { Shell } from "./v3/Shell";
import { OperationalProvider } from "./v4/OperationalContext";
import { HomePage } from "./v3/HomePage";
import { StudyPage, QuestionPage } from "./v3/StudyPage";
import { DataDashboardPage } from "./v4/DataDashboardPage";
import { TrailPageV4 } from "./v4/TrailPage";
import { RevisionsPageV4 } from "./v4/RevisionsPage";
import { ErrorsPageV4 } from "./v4/ErrorsPage";
import { FinalSprintPageV4 } from "./v4/FinalSprintPage";
import {
  EditalPage,
  LegislationPage,
  NotFoundPage,
  RedactionsPage,
  SimulationsPage,
  SyncPage,
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
  else if (route === "/dias/") page = <TrailPageV4 snapshot={snapshot} />;
  else if (dayMatch) page = <StudyPage snapshot={snapshot} dxx={dayMatch[1]} />;
  else if (questionMatch) page = <QuestionPage snapshot={snapshot} qxx={questionMatch[1]} />;
  else if (route === "/revisoes/") page = <RevisionsPageV4 snapshot={snapshot} />;
  else if (route === "/redacoes/") page = <RedactionsPage snapshot={snapshot} />;
  else if (route === "/erros/") page = <ErrorsPageV4 snapshot={snapshot} />;
  else if (route === "/simulados/") page = <SimulationsPage snapshot={snapshot} />;
  else if (route === "/desempenho/") page = <DataDashboardPage snapshot={snapshot} />;
  else if (route === "/edital/") page = <EditalPage snapshot={snapshot} />;
  else if (route === "/legislacao/") page = <LegislationPage snapshot={snapshot} />;
  else if (route === "/reta-final/") page = <FinalSprintPageV4 snapshot={snapshot} />;
  else if (route === "/sync/") page = <SyncPage snapshot={snapshot} />;
  else page = <NotFoundPage />;

  return <OperationalProvider snapshot={snapshot}><Shell snapshot={snapshot}>{page}</Shell></OperationalProvider>;
}
