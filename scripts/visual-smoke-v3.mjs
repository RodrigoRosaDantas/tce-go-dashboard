import { chromium } from "playwright";
import fs from "node:fs";

const baseUrl = process.env.V3_VISUAL_BASE_URL || "http://127.0.0.1:4173";
const outDir = process.env.V3_VISUAL_OUT || "artifacts/v3-visual";
const viewports = [
  { name: "mobile-360", width: 360, height: 800 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-412", width: 412, height: 915 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "tablet-1024", width: 1024, height: 1366 },
  { name: "desktop-1440", width: 1440, height: 900 },
];
const routes = [
  { name: "home", path: "/" },
  { name: "hoje", path: "/hoje/" },
  { name: "mentor", path: "/mentor/" },
  { name: "trilha", path: "/dias/" },
  { name: "d001", path: "/dia/d001/" },
  { name: "q001", path: "/questoes/q001/" },
  { name: "revisoes", path: "/revisoes/" },
  { name: "erros", path: "/erros/" },
  { name: "desempenho", path: "/desempenho/" },
  { name: "riscos", path: "/riscos/" },
  { name: "redacoes", path: "/redacoes/" },
  { name: "simulados", path: "/simulados/" },
  { name: "edital", path: "/edital/" },
  { name: "legislacao", path: "/legislacao/" },
  { name: "reta-final", path: "/reta-final/" },
  { name: "sync", path: "/sync/" },
];

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const failures = [];
const report = [];

for (const viewport of viewports) {
  const context = await browser.newContext({ viewport });
  for (const route of routes) {
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    const response = await page.goto(baseUrl + route.path, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-v3", { timeout: 10_000 });
    if (route.name === "desempenho") {
      await page.locator(".analytics-tabs-v41 button", { hasText: "Execução" }).click();
      await page.waitForSelector(".execution-cards-mobile-v5");
    }

    const geometry = await page.evaluate(() => {
      const rect = (selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top:r.top, right:r.right, bottom:r.bottom, left:r.left, width:r.width, height:r.height };
      };
      const visible = (selector) => {
        const el = document.querySelector(selector);
        if (!el) return false;
        const style = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && r.width > 0 && r.height > 0;
      };
      return {
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        topbar: rect(".topbar-v3"),
        sidebar: rect(".sidebar-v3"),
        main: rect(".main-v3"),
        bottomNav: rect(".bottom-nav-v3"),
        sessionToolbar: rect(".session-toolbar"),
        stageTabs: rect(".stage-tabs"),
        readerPanel: rect(".reader-settings-panel"),
        sidebarVisible: visible(".sidebar-v3"),
        bottomNavVisible: visible(".bottom-nav-v3"),
        executionCardsVisible: visible(".execution-cards-mobile-v5"),
        executionTableVisible: visible(".execution-table-desktop-v5"),
      };
    });

    const issues = [];
    if (!response?.ok()) issues.push(`HTTP ${response?.status() ?? "?"}`);
    if (geometry.scrollWidth > geometry.innerWidth + 3) {
      issues.push(`overflow horizontal: ${geometry.scrollWidth}px > ${geometry.innerWidth}px`);
    }
    if (viewport.width <= 1050 && geometry.sidebarVisible) issues.push("sidebar desktop visível no mobile/tablet estreito");
    if (viewport.width <= 1050 && !geometry.bottomNavVisible) issues.push("bottom nav ausente no mobile/tablet estreito");
    if (viewport.width > 1050 && geometry.bottomNavVisible) issues.push("bottom nav móvel visível no desktop/tablet amplo");
    if (viewport.width > 1050 && !geometry.sidebarVisible) issues.push("sidebar desktop ausente acima de 1050px");
    if (geometry.topbar && geometry.main && geometry.main.top < geometry.topbar.bottom - 1) issues.push("conteúdo inicia sob a topbar");
    if (route.name === "desempenho") {
      if (viewport.width <= 820 && !geometry.executionCardsVisible) issues.push("cards de execução ausentes no analytics mobile");
      if (viewport.width <= 820 && geometry.executionTableVisible) issues.push("tabela central de execução ainda visível no analytics mobile");
      if (viewport.width > 820 && geometry.executionCardsVisible) issues.push("cards mobile de execução visíveis no desktop");
      if (viewport.width > 820 && !geometry.executionTableVisible) issues.push("tabela de execução ausente no desktop");
    }

    if (geometry.bottomNav && viewport.width <= 1050) {
      const bodyPadding = await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingBottom) || 0);
      if (bodyPadding + 4 < geometry.bottomNav.height) issues.push("padding inferior insuficiente para bottom nav");
    }

    if (route.name === "d001" || route.name === "q001") {
      const navState = await page.evaluate(() => {
        const activeDesktop = document.querySelector(".sidebar-v3 .nav-group a.active")?.textContent?.trim() || "";
        const activeMobile = document.querySelector(".bottom-nav-v3 > a.active")?.textContent?.trim() || "";
        const duplicateIndex = Array.from(document.querySelectorAll(".study-content > .study-index")).some((el) => {
          const style = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== "none" && rect.width > 0 && rect.height > 0;
        });
        return { activeDesktop, activeMobile, duplicateIndex };
      });
      const activeLabel = viewport.width > 1050 ? navState.activeDesktop : navState.activeMobile;
      if (!activeLabel.includes("Trilha")) issues.push(`Trilha não está ativa em ${route.path}: "${activeLabel}"`);
      if (viewport.width > 820 && navState.duplicateIndex) issues.push(`índice interno duplicado visível em ${route.path}`);
      if (viewport.width <= 820 && !navState.duplicateIndex) issues.push(`índice interno ausente no mobile em ${route.path}`);
    }

    if (route.name === "q001") {
      const q001 = await page.evaluate(() => {
        const visible = (selector) => {
          const el = document.querySelector(selector);
          if (!el) return false;
          const style = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        };
        return {
          detailed: visible(".question-content-card"),
          fallback: visible(".question-fallback"),
          hasReferenceHeading: document.body.textContent?.includes("FCC reais — resolver pela referência") ?? false,
          hasAuthorial19: document.body.textContent?.includes("AUT-Q001-01") ?? false,
          hasAuthorial20: document.body.textContent?.includes("AUT-Q001-02") ?? false,
        };
      });
      if (!q001.detailed) issues.push("Q001 detalhado não renderizado");
      if (q001.fallback) issues.push("fallback do Q001 ainda visível após sync");
      if (!q001.hasReferenceHeading) issues.push("Q001 sem bloco de referências FCC");
      if (!q001.hasAuthorial19 || !q001.hasAuthorial20) issues.push("Q001 sem os dois itens autorais previstos");
    }

    if (consoleErrors.length) issues.push(`console/page errors: ${consoleErrors.join(" | ")}`);

    const shot = `${outDir}/${viewport.name}-${route.name}.png`;
    await page.screenshot({ path: shot, fullPage: false });
    report.push({ viewport, route: route.path, geometry, issues, screenshot: shot });
    if (issues.length) failures.push(`${viewport.name} ${route.path}: ${issues.join("; ")}`);
    await page.close();
  }
  await context.close();
}

await browser.close();
fs.writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
if (failures.length) {
  console.error("V3 visual smoke falhou:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(`Study OS visual smoke aprovado em ${viewports.length} viewports × ${routes.length} rotas.`);
