#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const defaults = {
  link:
    process.env.LEMON_SQUEEZY_PAYMENT_LINK?.trim() ||
    process.env.LEMON_SQUEEZY_CHECKOUT_URL?.trim() ||
    "",
  targets: [
    path.join(process.cwd(), "production_ready", "sku_01_dual_route_formal.md"),
    path.join(process.cwd(), "sites", "getcyberflow-ai", "index.html"),
    path.join(process.cwd(), "sites", "getcyberflow-ai", "token-recharge", "index.html"),
  ],
};

function parseArgs(argv) {
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case "--link":
        options.link = argv[++index];
        break;
      case "--target":
        options.targets.push(path.resolve(argv[++index]));
        break;
      case "--help":
      case "-h":
        console.log(
          "Usage: node scripts/inject-lemonsqueezy-link.mjs [--link <url>] [--target <path>]",
        );
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${token}`);
    }
  }
  return options;
}

function replaceMarkdownPlaceholders(source, link) {
  return source
    .replaceAll(">>> [Lemon Squeezy Payment Link] <<<", `>>> ${link} <<<`)
    .replaceAll("[Lemon Squeezy Payment Link]", link);
}

function replaceHtmlPaymentSlots(source, link) {
  return source.replace(
    /(<a\b[^>]*data-payment-link-slot="sku01"[^>]*href=")([^"]*)(")/gu,
    `$1${link}$3`,
  );
}

async function updateTarget(filePath, link) {
  const original = await fs.readFile(filePath, "utf8");
  const next = filePath.endsWith(".md")
    ? replaceMarkdownPlaceholders(original, link)
    : replaceHtmlPaymentSlots(original, link);
  if (next !== original) {
    await fs.writeFile(filePath, next, "utf8");
  }
  return { filePath, changed: next !== original };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.link) {
    throw new Error(
      "Missing Lemon Squeezy link. Set LEMON_SQUEEZY_PAYMENT_LINK or LEMON_SQUEEZY_CHECKOUT_URL, or pass --link.",
    );
  }
  const results = [];
  for (const target of options.targets) {
    try {
      results.push(await updateTarget(target, options.link));
    } catch (error) {
      results.push({ filePath: target, changed: false, error: error.message || String(error) });
    }
  }
  console.log(JSON.stringify({ status: "completed", updated: results }, null, 2));
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exitCode = 1;
});
