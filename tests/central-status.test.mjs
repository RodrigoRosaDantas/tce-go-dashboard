import test from "node:test";
import assert from "node:assert/strict";
import { buildCentralStatus, localDate } from "../scripts/build-central-status.mjs";

const snapshot = {
  generatedAt: "2026-09-29T23:00:00.000Z",
  publicStats: { sessions: 47, totalDays: 100 },
  days: [
    { dxx: "D001", order: 1, date: "2026-09-29", focus: "CF/88 arts. 70–75", readyForStudy: true },
    { dxx: "D002", order: 2, date: "2026-09-30", focus: "Dia protegido", readyForStudy: false, protected: true },
    { dxx: "D003", order: 3, date: "2026-10-01", focus: "CASP I", readyForStudy: true }
  ]
};

test("TCE public calendar produces a planned action without asserting execution", () => {
  const contract = buildCentralStatus(snapshot, { today: "2026-09-29", publishedAt: "2026-09-29" });
  assert.equal(contract.source.updatedAt, snapshot.generatedAt);
  assert.equal(contract.state.nextAction, "D001 — CF/88 arts. 70–75");
  assert.equal(contract.state.nextActionKind, "planned");
  assert.equal(contract.state.currentUnit, null);
  assert.equal(contract.study.evidence, "planned");
  assert.equal(contract.study.nextUnit, "D001");
  assert.equal(contract.study.lastCompletedUnit, null);
  assert.equal(contract.study.lastStudiedAt, null);
  assert.equal(contract.study.questionsDone, null);
  assert.equal(contract.study.completedSessions, null);
  assert.equal(contract.study.totalSessions, null);
});

test("TCE picks the next ready calendar date and skips protected dates without inferring completion", () => {
  const contract = buildCentralStatus(snapshot, { today: "2026-09-30", publishedAt: "2026-09-30" });
  assert.equal(contract.state.nextAction, "D003 — CASP I");
  assert.equal(contract.state.nextActionKind, "planned");
  assert.equal(contract.study.lastCompletedUnit, null);
  assert.equal(contract.study.completedSessions, null);
});

test("TCE returns no invented action when no ready future calendar date exists", () => {
  const contract = buildCentralStatus(snapshot, { today: "2026-10-02", publishedAt: "2026-10-02" });
  assert.equal(contract.state.nextAction, null);
  assert.equal(contract.state.nextActionKind, "none");
  assert.equal(contract.study.nextUnit, null);
  assert.equal(contract.study.accuracy, null);
});

test("localDate uses the Brasília timezone", () => {
  assert.match(localDate(new Date("2026-09-30T02:30:00.000Z")), /^2026-09-29$/);
});
