import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const url = process.argv[2] || "https://determined-marlin-458.convex.cloud";
const client = new ConvexHttpClient(url);
let rejected = false;
try {
  await client.query(anyApi.app.load, {
    profileId: "anonymous_probe",
    sessionToken: "0".repeat(64),
  });
} catch (error) {
  // Production Convex intentionally redacts application error details.
  rejected = true;
}
console.log(JSON.stringify({ unauthenticatedReadRejected: rejected }));
if (!rejected) process.exitCode = 1;
