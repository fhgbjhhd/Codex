#!/usr/bin/env node

const baseUrl = process.argv[2] || "https://getcyberflow.ai";
const endpoint = new URL("/api/payment-hook-ready", baseUrl).toString();

async function main() {
  const response = await fetch(endpoint, {
    headers: {
      accept: "application/json",
      "cache-control": "no-cache",
    },
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON from ${endpoint}, got: ${text.slice(0, 200)}`);
  }
  if (!response.ok) {
    throw new Error(`Payment hook check failed (${response.status}): ${JSON.stringify(body)}`);
  }
  console.log(JSON.stringify({ endpoint, ...body }, null, 2));
  if (!body.ready) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exitCode = 1;
});
