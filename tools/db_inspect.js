#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'api', 'prisma', 'dev.db');
const db = new Database(dbPath, { readonly: true });

function run() {
  try {
    const info = db.prepare("PRAGMA table_info('User')").all();
    console.log('PRAGMA_table_info_User:', JSON.stringify(info, null, 2));

    const cols = info.map((r) => r.name.toLowerCase());
    if (!cols.includes('status')) {
      console.log('COLUMN_STATUS_EXISTS: false');
      const sample = db.prepare('SELECT * FROM User LIMIT 10').all();
      console.log('SAMPLE_ROWS:', JSON.stringify(sample, null, 2));
      return;
    }

    console.log('COLUMN_STATUS_EXISTS: true');
    const counts = db
      .prepare(
        `SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status IS NULL THEN 1 ELSE 0 END) as null_status,
      SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN status = 'DISABLED' THEN 1 ELSE 0 END) as disabled
      FROM User`,
      )
      .get();
    console.log('COUNTS:', JSON.stringify(counts, null, 2));

    const rows = db
      .prepare(
        'SELECT id, username, status, enabled, createdAt FROM User ORDER BY createdAt DESC LIMIT 50',
      )
      .all();
    console.log('RECENT_USERS:', JSON.stringify(rows, null, 2));

    const nullRows = db
      .prepare('SELECT id, username, status FROM User WHERE status IS NULL LIMIT 50')
      .all();
    console.log('NULL_STATUS_ROWS:', JSON.stringify(nullRows, null, 2));

    const pendingRows = db
      .prepare(
        "SELECT id, username, status FROM User WHERE status = 'PENDING' ORDER BY createdAt DESC LIMIT 50",
      )
      .all();
    console.log('PENDING_ROWS:', JSON.stringify(pendingRows, null, 2));
  } catch (err) {
    console.error('ERROR:', err && err.message);
    process.exit(1);
  }
}

run();
