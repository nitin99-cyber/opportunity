const path = require("path");
const fs = require("fs");

let Database;
let isNodeSqlite = false;

try {
  Database = require("better-sqlite3");
} catch {
  // better-sqlite3 not available (e.g. Node 26+ without C++ build tools)
  const { DatabaseSync } = require("node:sqlite");
  isNodeSqlite = true;

  Database = function (filePath) {
    const raw = new DatabaseSync(filePath);
    raw.pragma = (p) => {
      try {
        return raw.exec("PRAGMA " + p);
      } catch {
        return null;
      }
    };
    raw.transaction = (fn) => (...args) => {
      raw.exec("BEGIN");
      try {
        const res = fn(...args);
        raw.exec("COMMIT");
        return res;
      } catch (e) {
        raw.exec("ROLLBACK");
        throw e;
      }
    };
    const origPrepare = raw.prepare.bind(raw);
    raw.prepare = (sql) => {
      const stmt = origPrepare(sql);
      const paramMatches = sql.match(/[@:][a-zA-Z0-9_]+/g);
      const paramNames = paramMatches ? [...new Set(paramMatches.map(s => s.slice(1)))] : [];

      const cleanArgs = (args) => {
        if (args.length === 1 && args[0] && typeof args[0] === "object" && !Array.isArray(args[0])) {
          if (paramNames.length > 0) {
            const out = {};
            for (const k of paramNames) {
              out[k] = args[0][k] !== undefined ? args[0][k] : null;
            }
            return [out];
          }
        }
        return args;
      };

      return {
        run(...args) {
          const res = stmt.run(...cleanArgs(args));
          return {
            changes: res.changes,
            lastInsertRowid: Number(res.lastInsertRowid)
          };
        },
        get(...args) {
          return stmt.get(...cleanArgs(args));
        },
        all(...args) {
          return stmt.all(...cleanArgs(args));
        }
      };
    };
    return raw;
  };
}

function initDb(customPath) {
  const dbPath = customPath || path.join(__dirname, "data", "radar.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  return db;
}

module.exports = { initDb, Database, isNodeSqlite };
