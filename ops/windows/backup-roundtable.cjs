/* eslint-disable no-console -- backup status is intentionally logged by this maintenance CLI */
// Safe hot backup of the local RoundTable SQLite database.
// No API keys, HTTP traffic, cloud storage, or production edits.
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync, backup } = require("node:sqlite");

const root = path.resolve(__dirname, "..", "..");
const envFile = path.join(root, ".env.local");

function databasePath() {
  let configured = process.env.ROUNDTABLE_DB_PATH || "";
  if (!configured && fs.existsSync(envFile)) {
    const match = fs.readFileSync(envFile, "utf8").match(/^ROUNDTABLE_DB_PATH=(.+)$/m);
    if (match) configured = match[1].trim().replace(/^['"]|['"]$/g, "");
  }
  return configured ? path.resolve(root, configured) : path.join(root, "data", "roundtable.sqlite");
}

async function main() {
  const source = databasePath();
  if (!fs.existsSync(source)) {
    console.log("BACKUP_SKIPPED_NO_DATABASE");
    return;
  }

  const directory = path.resolve(root, "..", "backups", "roundtable");
  fs.mkdirSync(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = path.join(directory, `roundtable-${stamp}-${process.pid}.sqlite`);
  const sourceDb = new DatabaseSync(source, { readOnly: true });
  try {
    await backup(sourceDb, destination);
  } catch (error) {
    try { fs.rmSync(destination, { force: true }); } catch {}
    throw error;
  } finally {
    sourceDb.close();
  }

  let integrity;
  const checkDb = new DatabaseSync(destination, { readOnly: true });
  try {
    integrity = checkDb.prepare("PRAGMA integrity_check").get()?.integrity_check;
  } finally {
    checkDb.close();
  }
  if (integrity !== "ok") {
    fs.rmSync(destination, { force: true });
    throw new Error("Backup integrity check failed");
  }

  const keep = 14;
  const files = fs.readdirSync(directory)
    .filter((name) => /^roundtable-\d{4}-\d{2}-\d{2}T.*\.sqlite$/.test(name))
    .sort()
    .reverse();
  for (const oldName of files.slice(keep)) {
    fs.rmSync(path.join(directory, oldName), { force: true });
  }
  console.log("ROUND_TABLE_BACKUP_OK=true");
  console.log("ROUND_TABLE_BACKUP_INTEGRITY=ok");
  console.log("ROUND_TABLE_BACKUP_FILES_RETAINED=" + Math.min(files.length, keep));
}

main().catch((error) => {
  console.error("ROUND_TABLE_BACKUP_FAILED=" + error.message);
  process.exitCode = 1;
});
