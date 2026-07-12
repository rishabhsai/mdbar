import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const baseURL = process.argv[2]?.replace(/\/$/, "");
const adminSecret = process.env.MDBAR_ADMIN_SECRET;
const developmentTeam = process.env.MDBAR_DEVELOPMENT_TEAM?.trim();
const writeIOSConfiguration = process.argv.includes("--write-ios");

if (!baseURL || !adminSecret) {
  console.error("Usage: MDBAR_ADMIN_SECRET=... npm run create-space -- https://your-worker.workers.dev");
  process.exit(1);
}

const response = await fetch(`${baseURL}/v1/spaces`, {
  method: "POST",
  headers: { authorization: `Bearer ${adminSecret}` },
});

if (!response.ok) {
  console.error(`Space creation failed (${response.status}): ${await response.text()}`);
  process.exit(1);
}

const { spaceId, token } = await response.json();
console.log(`Worker URL: ${baseURL}`);
console.log(`Space ID:   ${spaceId}`);
if (writeIOSConfiguration) {
  const path = resolve("../ios/Config/Sync.local.xcconfig");
  const escapedURL = baseURL.replace("://", ":/$()/");
  await writeFile(
    path,
    `MDBAR_SYNC_BASE_URL = ${escapedURL}\nMDBAR_SYNC_SPACE_ID = ${spaceId}\nMDBAR_SYNC_TOKEN = ${token}\n${developmentTeam ? `DEVELOPMENT_TEAM = ${developmentTeam}\n` : ""}`,
    { mode: 0o600 },
  );
  console.log(`iOS configuration: ${path}`);
  console.log("Device token: saved privately (not printed)");
} else {
  console.log(`Device token: ${token}`);
}
console.log("\nKeep the token private. The Worker stores only its SHA-256 hash.");
