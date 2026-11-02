import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

// The production artifact must never expose Scene Lab, even if someone knows
// its URL or has a saved local browser preset from development.
async function reserveEphemeralPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address === "object");
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

const port = await reserveEphemeralPort();
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [".next/standalone/server.js"], {
  env: { ...process.env, HOSTNAME: "127.0.0.1", PORT: String(port), NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";
for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", (chunk) => {
    serverOutput = (serverOutput + chunk.toString()).slice(-5000);
  });
}

async function responseFor(route) {
  return fetch(origin + route, { signal: AbortSignal.timeout(4000) });
}

try {
  let homepage;
  for (let attempt = 0; attempt < 75; attempt++) {
    if (child.exitCode !== null) throw new Error(`Server exited early: ${serverOutput}`);
    try {
      homepage = await responseFor("/");
      if (homepage.ok) break;
    } catch {
      // The standalone server needs a moment to bind its port.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(homepage?.ok, `Production homepage did not start: ${serverOutput}`);

  const html = await homepage.text();
  assert.match(html, /Same Web/);
  assert.doesNotMatch(html, /class="scene-editor/);
  assert.doesNotMatch(html, /href="\/lab\/(?:motion|physical)/);

  for (const route of ["/lab/motion", "/lab/physical"]) {
    const response = await responseFor(route);
    assert.equal(response.status, 404, `Developer-only route exposed in production: ${route}`);
    const body = await response.text();
    assert.doesNotMatch(body, /Floating scene editor|Shape the light|download\/import presets/);
  }

  for (const route of [
    "/brand/hero-physical-v1/keld-hero.glb",
    "/brand/hero-physical-v1/realtime-config.json",
    "/brand/GYLDLAB.svg",
    "/brand/keld-symbol-white.svg",
    "/brand/social/github.svg",
    "/brand/social/x.svg",
    "/brand/social/linkedin.png",
    "/brand/stone-materials/seaside_rock/color-2048.webp",
  ]) {
    const response = await responseFor(route);
    assert.equal(response.status, 200, `Required production asset missing: ${route}`);
    assert(
      Number(response.headers.get("content-length")) > 0 ||
        (await response.arrayBuffer()).byteLength > 0,
    );
  }

  console.log("Production access gate passed: homepage and assets 200; both Scene Lab routes 404.");
} finally {
  child.kill("SIGTERM");
}
