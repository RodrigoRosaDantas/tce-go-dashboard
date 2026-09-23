import { chromium } from "playwright";
import fs from "node:fs";

const baseUrl = process.env.V3_VISUAL_BASE_URL || "http://127.0.0.1:4173";
const outDir = process.env.V3_VISUAL_OUT || "artifacts/v3-visual";
const viewports = [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "mobile-430", width: 430, height: 932 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "tablet-834", width: 834, height: 1194 },
  { name: "tablet-1024", width: 1024, height: 1366 },
  { name: "desktop-1366", width: 1366, height: 768 },
  { name: "desktop-1440", width: 1440, height: 900 },
];
const routes = [
  { name: "hoje", path: "/" },
  { name: "trilha", path: "/dias/" },
  { name: "d001", path: "/dia/d001/" },
  { name: "q001", path: "/questoes/q001/" },
  { name: "desempenho", path: "/desempenho/" },
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
    if (viewport.width > 1050 && !geometry.sidebarVisible) issues.push("sidebar desktop ausente acima de 820px");
    if (geometry.topbar && geometry.main && geometry.main.top < geometry.topbar.bottom - 1) issues.push("conteúdo inicia sob a topbar");
    if (geometry.bottomNav && viewport.width <= 1050) {
      const bodyPadding = await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingBottom) || 0);
      if (bodyPadding + 4 < geometry.bottomNav.height) issues.push("padding inferior insuficiente para bottom nav");
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
console.log(`V3 visual smoke aprovado em ${viewports.length} viewports × ${routes.length} rotas.`);
