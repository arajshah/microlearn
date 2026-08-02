#!/usr/bin/env npx tsx
import Database from 'better-sqlite3';
import { loadConfig } from '../server/src/config';
import { repairInvalidReviewMaterial } from '../server/src/retrieval/reviewIntegrityRepair';

const apply = process.argv.includes('--apply');
const config = loadConfig();
const db = new Database(config.dbPath, { readonly: !apply, fileMustExist: true });

try {
  db.pragma('foreign_keys = ON');
  const result = repairInvalidReviewMaterial(db, { apply });
  console.log(JSON.stringify(result, null, 2));
  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to soft-delete the reported records.');
  }
} finally {
  db.close();
}
