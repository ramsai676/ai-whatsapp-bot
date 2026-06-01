// Tiny JSON-file lead store. Appends captured leads to data/leads.json.
// Kept deliberately simple (no DB) so the project runs anywhere with zero setup.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, '..', 'data', 'leads.json');

function readAll() {
  if (!existsSync(FILE)) return [];
  try {
    return JSON.parse(readFileSync(FILE, 'utf8'));
  } catch {
    return [];
  }
}

export function saveLead(lead, { from = 'simulator', at } = {}) {
  const leads = readAll();
  const record = { ...lead, from, capturedAt: at || null, id: `${from}-${leads.length + 1}` };
  leads.push(record);
  try {
    writeFileSync(FILE, JSON.stringify(leads, null, 2));
  } catch {
    /* best-effort; non-fatal */
  }
  return record;
}

export function listLeads() {
  return readAll();
}
