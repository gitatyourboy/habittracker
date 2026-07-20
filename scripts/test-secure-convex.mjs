import { readFileSync } from "node:fs";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const url = process.argv[2] || "https://standing-caribou-59.convex.cloud";
const code = readFileSync(new URL("../convex-registration-code.local.txt", import.meta.url), "utf8").trim();
const client = new ConvexHttpClient(url);
const stamp = Date.now().toString(36);

function credentials(label) {
  const profileId = `security_test_${label.replace(/[^a-z0-9_-]/gi, '_')}_${stamp}`;
  const pin = "4826";
  const pinSalt = randomBytes(16).toString("hex");
  const pinProof = pbkdf2Sync(pin, Buffer.from(pinSalt, "hex"), 210000, 32, "sha256").toString("hex");
  const sessionToken = randomBytes(32).toString("hex");
  return { profileId, pinSalt, pinProof, sessionToken };
}

async function register(profileName) {
  const values = credentials(profileName.toLowerCase());
  await client.mutation(anyApi.auth.register, {
    ...values, profileName, registrationCode: code,
  });
  return values;
}

let unauthenticatedRejected = false;
try {
  await client.query(anyApi.app.load, { profileId: "unknown", sessionToken: "x".repeat(64) });
} catch { unauthenticatedRejected = true; }

const firstName = `Security Test One ${stamp}`;
const secondName = `Security Test Two ${stamp}`;
const first = await register(firstName);
const second = await register(secondName);
const firstAuth = { profileId:first.profileId, sessionToken:first.sessionToken };
const secondAuth = { profileId:second.profileId, sessionToken:second.sessionToken };
const resolvedFirst = await client.query(anyApi.auth.resolveByName, { profileName:`  ${firstName.toUpperCase().replaceAll(' ', '   ')}  ` });
const freshDeviceToken = randomBytes(32).toString("hex");
await client.mutation(anyApi.auth.login, {
  profileId: resolvedFirst.profileId,
  pinProof: first.pinProof,
  sessionToken: freshDeviceToken,
});
const firstLoad = await client.query(anyApi.app.load, firstAuth);
const secondLoad = await client.query(anyApi.app.load, secondAuth);
const freshDeviceLoad = await client.query(anyApi.app.load, {
  profileId: resolvedFirst.profileId,
  sessionToken: freshDeviceToken,
});

const base = firstLoad.version;
const firstState = { ...(firstLoad.state || {}), securityTestMarker: "newer-write" };
const accepted = await client.mutation(anyApi.app.save, { ...firstAuth, state: firstState, baseVersion: base });
const stale = await client.mutation(anyApi.app.save, {
  ...firstAuth, state: { securityTestMarker: "stale-write" }, baseVersion: base,
});
const finalLoad = await client.query(anyApi.app.load, firstAuth);

const report = {
  unauthenticatedRejected,
  profileResolvedByName: resolvedFirst?.profileId === first.profileId,
  freshDeviceLoginWorks: freshDeviceLoad.version === firstLoad.version,
  firstProfileAccessible: Number.isInteger(firstLoad.version),
  secondProfileIsIsolated: secondLoad.state === null,
  acceptedWrite: accepted.conflict === false,
  staleWriteRejected: stale.conflict === true,
  newerStatePreserved: finalLoad.state?.securityTestMarker === "newer-write",
};
console.log(JSON.stringify(report, null, 2));
if (Object.values(report).some((value) => value !== true)) process.exitCode = 1;
