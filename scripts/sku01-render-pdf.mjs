#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import MarkdownIt from "markdown-it";
import { chromium } from "playwright-core";

const defaults = {
  input: path.join(process.cwd(), "production_ready", "sku_01_dual_route_formal.md"),
  output: path.join(process.cwd(), "production_ready", "sku_01_dual_route_formal.pdf"),
  htmlOut: path.join(process.cwd(), "production_ready", "sku_01_dual_route_formal.html"),
};

function parseArgs(argv) {
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case "--input":
        options.input = path.resolve(argv[++index]);
        break;
      case "--output":
        options.output = path.resolve(argv[++index]);
        break;
      case "--html-out":
        options.htmlOut = path.resolve(argv[++index]);
        break;
      case "--help":
      case "-h":
        console.log(
          "Usage: node scripts/sku01-render-pdf.mjs [--input <path>] [--output <path>] [--html-out <path>]",
        );
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${token}`);
    }
  }
  return options;
}

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function findChromeExecutable() {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/未命名文件夹/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Arc.app/Contents/MacOS/Arc",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
  }
  throw new Error("No local Chrome-compatible browser executable found for PDF rendering.");
}

function buildHtml(markdownSource) {
  const md = new MarkdownIt({ html: false, linkify: true, breaks: false });
  const body = md.render(markdownSource);
  const styles = `
    :root {
      --bg: #09090b;
      --panel: #121317;
      --panel-soft: rgba(255,255,255,0.03);
      --gold: #d6b259;
      --gold-soft: rgba(214,178,89,0.12);
      --text: #f4f0e6;
      --muted: #b9b2a1;
      --border: rgba(214,178,89,0.25);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--text);
      background:
        radial-gradient(circle at top right, rgba(214,178,89,0.16), transparent 22%),
        radial-gradient(circle at left center, rgba(214,178,89,0.08), transparent 26%),
        var(--bg);
      font-family: "Avenir Next", "Helvetica Neue", Helvetica, Arial, sans-serif;
      line-height: 1.6;
    }
    .document {
      padding: 36px 40px 48px;
    }
    .cover {
      min-height: 240px;
      display: grid;
      align-content: end;
      gap: 16px;
      padding: 36px;
      border: 1px solid var(--border);
      border-radius: 28px;
      background:
        linear-gradient(180deg, rgba(214,178,89,0.08), transparent 55%),
        var(--panel);
      box-shadow: 0 16px 60px rgba(0,0,0,0.38);
      margin-bottom: 28px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-dot {
      width: 14px;
      height: 14px;
      border-radius: 999px;
      background: linear-gradient(135deg, #f1d58b 0%, #9d7622 100%);
      box-shadow: 0 0 20px rgba(214,178,89,0.42);
    }
    .eyebrow {
      margin: 0;
      color: var(--gold);
      letter-spacing: 0.18em;
      text-transform: uppercase;
      font-size: 11px;
      font-weight: 700;
    }
    .cover h1 {
      margin: 0;
      font-family: "Didot", "Baskerville", Georgia, serif;
      font-size: 42px;
      line-height: 0.95;
      letter-spacing: -0.02em;
    }
    .cover p {
      margin: 0;
      max-width: 70ch;
      color: var(--muted);
      font-size: 15px;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
      margin-top: 12px;
    }
    .meta-card {
      border: 1px solid var(--border);
      border-radius: 18px;
      background: var(--panel-soft);
      padding: 14px 16px;
    }
    .meta-card strong {
      display: block;
      color: var(--text);
      margin-bottom: 6px;
      font-size: 13px;
    }
    .meta-card span {
      color: var(--muted);
      font-size: 12px;
    }
    .content {
      border: 1px solid var(--border);
      border-radius: 28px;
      background: var(--panel);
      padding: 28px 30px 36px;
    }
    h1, h2, h3, h4 {
      break-after: avoid;
      color: var(--text);
    }
    h1 {
      font-family: "Didot", "Baskerville", Georgia, serif;
      font-size: 34px;
      line-height: 1.02;
      margin: 0 0 18px;
    }
    h2 {
      margin: 32px 0 12px;
      font-size: 24px;
      padding-top: 10px;
      border-top: 1px solid rgba(214,178,89,0.16);
    }
    h3 {
      margin: 26px 0 10px;
      font-size: 18px;
      color: var(--gold);
    }
    p, li {
      color: var(--muted);
      font-size: 13px;
    }
    ul, ol {
      padding-left: 22px;
    }
    code {
      color: var(--text);
      background: rgba(255,255,255,0.04);
      padding: 0 5px;
      border-radius: 6px;
    }
    strong {
      color: var(--text);
    }
    hr {
      border: 0;
      border-top: 1px solid rgba(214,178,89,0.12);
      margin: 20px 0;
    }
    @media print {
      .cover, .content { box-shadow: none; }
    }
  `;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>CyberFlow SKU 01 Production Delivery</title>
    <style>${styles}</style>
  </head>
  <body>
    <div class="document">
      <section class="cover">
        <div class="brand">
          <span class="brand-dot"></span>
          <div>
            <p class="eyebrow">CyberFlow AI</p>
            <p class="eyebrow">SKU 01 Delivery Pack</p>
          </div>
        </div>
        <h1>Prompt Pack Delivery<br />Built To Feel Premium On First Open.</h1>
        <p>
          A black-gold production artifact for operators, founders, and consultants buying clarity,
          repeatability, and time leverage. This edition ships with Dual-Route prompt normalization,
          campaign workflow notes, and commercialization hooks.
        </p>
        <div class="meta-grid">
          <div class="meta-card"><strong>Pack Value</strong><span>520 production prompts, SOPs, and campaign workflows</span></div>
          <div class="meta-card"><strong>Build Mode</strong><span>DeepSeek structure pass, premium tone pass</span></div>
          <div class="meta-card"><strong>Commercial Hook</strong><span>Lemon Squeezy checkout-ready CTA wiring</span></div>
        </div>
      </section>
      <main class="content">${body}</main>
    </div>
  </body>
</html>`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const markdown = await fs.readFile(options.input, "utf8");
  const html = buildHtml(markdown);
  await ensureDir(options.htmlOut);
  await fs.writeFile(options.htmlOut, html, "utf8");

  const executablePath = await findChromeExecutable();
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    await ensureDir(options.output);
    await page.pdf({
      path: options.output,
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      margin: {
        top: "72px",
        bottom: "72px",
        left: "16mm",
        right: "16mm",
      },
      headerTemplate: `
        <div style="width:100%;font-size:9px;padding:0 16mm;color:#b9b2a1;display:flex;justify-content:space-between;align-items:center;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:linear-gradient(135deg,#f1d58b 0%,#9d7622 100%);"></span>
            <span style="letter-spacing:0.18em;text-transform:uppercase;">CyberFlow AI</span>
          </div>
          <span>SKU 01 Premium Delivery</span>
        </div>`,
      footerTemplate: `
        <div style="width:100%;font-size:9px;padding:0 16mm;color:#b9b2a1;display:flex;justify-content:space-between;align-items:center;">
          <span>CyberFlow AI Solutions</span>
          <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
        </div>`,
    });
    console.log(
      JSON.stringify(
        { status: "completed", output: options.output, htmlOut: options.htmlOut },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exitCode = 1;
});
