import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const [projectUrlArg, serviceRoleKey, outputRootArg = "backups"] = process.argv.slice(2);
if (!projectUrlArg || !serviceRoleKey) {
  throw new Error("Usage: node scripts/export-supabase.mjs <project-url> <service-role-key> [output-root]");
}

const projectUrl = projectUrlArg.replace(/\/$/, "");
const outputRoot = path.resolve(outputRootArg);
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const snapshotName = `supabase-${stamp}`;
const tempDir = path.join(outputRoot, `.${snapshotName}.tmp`);
const finalDir = path.join(outputRoot, snapshotName);
const pageSize = 1000;
const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
};

const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");

async function getJson(url, extraHeaders = {}) {
  const response = await fetch(url, { headers: { ...headers, ...extraHeaders } });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} from ${url}: ${await response.text()}`);
  }
  return { value: await response.json(), response };
}

fs.mkdirSync(outputRoot, { recursive: true });
fs.mkdirSync(tempDir, { recursive: true });

try {
  const { value: schema } = await getJson(`${projectUrl}/rest/v1/`, {
    Accept: "application/openapi+json",
  });
  const tables = Object.keys(schema.definitions ?? {}).sort();
  if (tables.length === 0) throw new Error("Supabase schema returned no tables; export aborted.");
  fs.writeFileSync(path.join(tempDir, "openapi-schema.json"), `${JSON.stringify(schema, null, 2)}\n`);

  const manifestTables = [];
  for (const table of tables) {
    const rows = [];
    let offset = 0;
    while (true) {
      const query = new URLSearchParams({ select: "*", limit: String(pageSize), offset: String(offset) });
      const { value: page } = await getJson(
        `${projectUrl}/rest/v1/${encodeURIComponent(table)}?${query}`,
        { Prefer: "count=exact" },
      );
      if (!Array.isArray(page)) throw new Error(`${table} returned a non-array response.`);
      rows.push(...page);
      if (page.length < pageSize) break;
      offset += page.length;
    }

    const json = `${JSON.stringify(rows, null, 2)}\n`;
    const filename = `${table}.json`;
    fs.writeFileSync(path.join(tempDir, filename), json);
    manifestTables.push({
      table,
      rows: rows.length,
      file: filename,
      bytes: Buffer.byteLength(json),
      sha256: sha256(json),
    });
    process.stdout.write(`${table}: ${rows.length} rows\n`);
  }

  const manifest = {
    formatVersion: 1,
    source: projectUrl,
    exportedAtUtc: new Date().toISOString(),
    tableCount: manifestTables.length,
    totalRows: manifestTables.reduce((sum, table) => sum + table.rows, 0),
    tables: manifestTables,
  };
  fs.writeFileSync(path.join(tempDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.renameSync(tempDir, finalDir);
  process.stdout.write(`SNAPSHOT=${path.relative(process.cwd(), finalDir)}\n`);
  process.stdout.write(`TABLES=${manifest.tableCount}\n`);
  process.stdout.write(`ROWS=${manifest.totalRows}\n`);
} catch (error) {
  process.stderr.write(`Incomplete export retained at ${tempDir}\n`);
  throw error;
}
