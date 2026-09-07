#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const targetUrl = process.argv.find((value) => value.startsWith("http"))
  || "http://localhost:3000/nbadash/#/officiating?tab=tonight";
const outputDir = path.join(process.cwd(), "tmp", "pdfs");
const pdfPath = path.join(outputDir, "officiating-report-layout-audit.pdf");
const screenshotPath = path.join(outputDir, "officiating-report-layout-audit.png");

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1600 }, deviceScaleFactor: 1 });
  await page.goto(targetUrl, { waitUntil: "networkidle" });
  const sheet = page.locator('[class*="officialsReportSheet"]').first();
  await sheet.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(() => document.querySelectorAll('[class*="officialsReportSheet"] article').length === 3);
  await page.evaluate(() => document.body.classList.add("officiating-report-print"));
  await page.emulateMedia({ media: "print" });

  const audit = await page.locator('[class*="officialsReportSheet"]').first().evaluate((report) => {
    const rect = (element) => element?.getBoundingClientRect();
    const textRect = (element) => {
      if (!element) return null;
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getBoundingClientRect();
    };
    const overlaps = (left, right) => (
      left && right
      && left.left < right.right
      && left.right > right.left
      && left.top < right.bottom
      && left.bottom > right.top
    );
    const within = (child, parent) => (
      child.left >= parent.left - 0.5
      && child.right <= parent.right + 0.5
      && child.top >= parent.top - 0.5
      && child.bottom <= parent.bottom + 0.5
    );
    const cards = [...report.querySelectorAll("article")];
    const failures = [];

    if (cards.length !== 3) failures.push(`Expected 3 referee cards, found ${cards.length}.`);
    cards.forEach((card, index) => {
      const top = card.firstElementChild;
      const identity = top?.firstElementChild;
      const history = identity?.nextElementSibling;
      const metrics = top?.lastElementChild;
      const name = identity?.querySelector("h3")?.textContent?.trim() || `card ${index + 1}`;
      if (overlaps(rect(identity), rect(history))) failures.push(`${name}: identity overlaps Previous Games.`);
      if (overlaps(rect(history), rect(metrics))) failures.push(`${name}: Previous Games overlaps primary metrics.`);
      if (!within(rect(card), rect(report))) failures.push(`${name}: card escapes the Letter sheet.`);
      if (card.scrollWidth > card.clientWidth + 1) failures.push(`${name}: horizontal card overflow.`);
      if (card.scrollHeight > card.clientHeight + 1) failures.push(`${name}: vertical card overflow.`);
      const historyPanels = card.querySelectorAll("[class*='reportPreviousGames']");
      if (historyPanels.length !== 1) failures.push(`${name}: expected one Previous Games panel in the header.`);
      if (historyPanels.length === 1) {
        const historyColumns = historyPanels[0].querySelector("[class*='reportPreviousGameColumns']")?.children || [];
        if (historyColumns.length !== 2) failures.push(`${name}: expected Last 5 and WAS Games columns.`);
        const recentRows = historyColumns[0]?.querySelectorAll("li").length || 0;
        if (recentRows > 5) failures.push(`${name}: Last 5 exceeds five rows.`);
        const wizardsRows = historyColumns[1]?.querySelectorAll("li").length || 0;
        if (wizardsRows > 5) failures.push(`${name}: WAS Games exceeds five rows.`);
      }
      [...card.querySelectorAll("[class*='reportFoulMetrics'] [class*='reportBarMetric'], [class*='reportViolationMetrics'] [class*='reportBarMetric']")]
        .forEach((metric) => {
          const label = metric.querySelector("[class*='reportBarMetricLabel']");
          const marker = metric.querySelector("[class*='reportMetricBarMarker']");
          if (overlaps(textRect(label), rect(marker))) failures.push(`${name}: metric label '${label?.textContent?.trim()}' overlaps its percentile marker.`);
        });
      [...card.querySelectorAll("h3, h4, [class*='reportBarMetricLabel'], [class*='reportWizardsHistory'] span, [class*='reportWizardsHistory'] li, [class*='reportWizardsHistory'] strong, [class*='reportMetric'] span, [class*='reportMetric'] strong, [class*='reportMetric'] em")]
        .forEach((element) => {
          if (element.scrollWidth > element.clientWidth + 1) {
            failures.push(`${name}: clipped text '${element.textContent.trim()}'.`);
          }
        });
    });

    const footer = report.lastElementChild;
    if (!footer || !within(rect(footer), rect(report))) failures.push("Footer is outside the Letter sheet.");
    return { failures, cardCount: cards.length, width: report.clientWidth, height: report.clientHeight };
  });

  if (audit.failures.length) throw new Error(audit.failures.join("\n"));
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await page.pdf({ path: pdfPath, format: "Letter", printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  console.log(JSON.stringify({ ...audit, pdfPath, screenshotPath }, null, 2));
} finally {
  await browser.close();
}
