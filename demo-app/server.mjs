#!/usr/bin/env node
// Local demo system under test: multi-tenant UI + REST API + file exports + a Salesforce REST/SOQL mock,
// all backed by PostgreSQL. Lets every framework layer run end to end on a laptop or CI runner.
//   DEMO_PORT (4400) · DEMO_DB_URL · DEMO_PASSWORD · DEMO_SF_CLIENT_ID/SECRET · DEMO_DRIFT=1 (rename test ids)
import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import ExcelJS from 'exceljs';

const PORT = Number(process.env.DEMO_PORT ?? 4400);
const BASE = `http://localhost:${PORT}`;
const PASSWORD = process.env.DEMO_PASSWORD ?? 'demo-pass-123';
const SF_ID = process.env.DEMO_SF_CLIENT_ID ?? 'demo-client-id';
const SF_SECRET = process.env.DEMO_SF_CLIENT_SECRET ?? 'demo-client-secret';
const DRIFT = process.env.DEMO_DRIFT === '1';
const pool = new pg.Pool({ connectionString: process.env.DEMO_DB_URL ?? 'postgres://qa_app:localdev@localhost:5432/appdb' });
await pool.query(readFileSync(fileURLToPath(new URL('./schema.sql', import.meta.url)), 'utf8'));

const sessions = new Map(); // token -> { tenant, user, exp }
const sfTokens = new Set();

// ---------------- helpers ----------------
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(body === undefined ? '' : JSON.stringify(body)); };
const html = (res, body, status = 200) => { res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' }); res.end(body); };
const readBody = (req) => new Promise((resolve) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => resolve(d)); });
const parseBody = (raw, type = '') => type.includes('json') ? JSON.parse(raw || '{}') : Object.fromEntries(new URLSearchParams(raw));
const cookie = (req, name) => (req.headers.cookie ?? '').split(/;\s*/).find((c) => c.startsWith(name + '='))?.split('=')[1];
function session(req) {
  const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const s = sessions.get(bearer || cookie(req, 'session'));
  if (!s || s.exp < Date.now()) return null;
  const headerTenant = req.headers['x-tenant-id'];
  if (headerTenant && headerTenant !== s.tenant) return null; // a token is valid for exactly one tenant
  return s;
}
const login = (username, password, tenant) => {
  if (username !== 'demo.user' || password !== PASSWORD || !['acme', 'globex'].includes(tenant)) return null;
  const token = randomBytes(24).toString('hex');
  sessions.set(token, { tenant, user: username, exp: Date.now() + 3600_000 });
  return token;
};
const ref = () => 'APT-' + randomBytes(3).toString('hex').toUpperCase();
const mrn = () => 'MRN-' + randomBytes(4).toString('hex').toUpperCase();

// ---------------- mock SOQL: SELECT f1, f2 FROM Obj [WHERE a = 'x' AND b = true] [LIMIT n] ----------------
function runSoql(q) {
  const m = q.match(/^\s*SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?(?:\s+LIMIT\s+(\d+))?\s*$/is);
  if (!m) throw new Error('MALFORMED_QUERY: mock supports SELECT ... FROM ... [WHERE a = b AND ...] [LIMIT n]');
  const [, fieldList, object, where, limit] = m;
  const fields = fieldList.split(',').map((f) => f.trim());
  const conds = where ? where.split(/\s+AND\s+/i).map((c) => {
    const cm = c.match(/^\s*(\w+)\s*=\s*(?:'((?:\\'|[^'])*)'|(\d+(?:\.\d+)?)|(true|false))\s*$/i);
    if (!cm) throw new Error(`MALFORMED_QUERY: unsupported condition "${c}"`);
    return [cm[1], cm[2] !== undefined ? cm[2].replace(/\\'/g, "'") : cm[3] !== undefined ? Number(cm[3]) : cm[4].toLowerCase() === 'true'];
  }) : [];
  return { object, fields, conds, limit: limit ? Number(limit) : undefined };
}

// ---------------- pages ----------------
const layout = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><style>
body{font-family:system-ui,sans-serif;margin:0;padding:16px;max-width:960px}
.toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.table-wrap{overflow-x:auto}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px;text-align:left}
[role=dialog]{position:fixed;inset:10% 5%;background:#fff;border:1px solid #888;padding:16px;max-width:520px;margin:auto;overflow:auto}
.field{display:flex;flex-direction:column;margin:8px 0}[role=listbox]{border:1px solid #888;list-style:none;padding:0;margin:0}
[role=option]{padding:6px;cursor:pointer}[role=option]:hover{background:#eef}
.toast{position:fixed;right:16px;bottom:16px;background:#1b5e20;color:#fff;padding:12px;border-radius:6px}
.error{color:#b00020}</style></head><body>${body}</body></html>`;

const loginPage = (error = '') => layout('Sign in', `
<h1>Sign in</h1>${error ? `<div role="alert" class="error">${error}</div>` : ''}
<form method="post" action="/login">
 <div class="field"><label for="username">Username</label><input id="username" name="username" autocomplete="username"></div>
 <div class="field"><label for="password">Password</label><input id="password" name="password" type="password"></div>
 <div class="field"><label for="tenant">Organization</label><select id="tenant" name="tenant">
   <option value="acme">Acme Health</option><option value="globex">Globex Clinics</option></select></div>
 <button type="submit" data-testid="login-submit">Log in</button>
</form>`);

const saveId = DRIFT ? 'appointment-save-v2' : 'appointment-save';
const appointmentsPage = (s, tenantName) => layout('Appointments', `
<header><h1>Appointments</h1><p data-testid="tenant-name">${tenantName}</p></header>
<div class="toolbar">
 <button type="button" id="new-appt">New appointment</button>
 <a href="/api/appointments/export.csv" download data-testid="export-csv">Export CSV</a>
 <a href="/api/appointments/export.xlsx" download data-testid="export-xlsx">Export Excel</a>
</div>
<div class="table-wrap"><table aria-label="Appointments"><thead><tr>
 <th>Reference</th><th>Patient MRN</th><th>Facility</th><th>Visit date</th><th>Status</th></tr></thead><tbody></tbody></table></div>
<div role="dialog" aria-modal="true" aria-labelledby="dlg-title" hidden>
 <h2 id="dlg-title">New appointment</h2><div role="alert" class="error" hidden></div>
 <div class="field"><label for="mrn">Patient MRN</label><input id="mrn"></div>
 <div class="field"><span id="facility-label">Facility</span>
  <button type="button" role="combobox" aria-labelledby="facility-label" aria-haspopup="listbox" aria-expanded="false" id="facility">Select a facility</button>
  <ul role="listbox" aria-labelledby="facility-label" hidden></ul></div>
 <div class="field"><label for="visit">Visit date</label><input id="visit" type="date"></div>
 <div class="field"><label for="comment">Comment</label><textarea id="comment"></textarea></div>
 <div class="toolbar"><button type="button" id="cancel">Cancel</button><button type="button" data-testid="${saveId}">Save</button></div>
</div>
<script>
const $ = (s) => document.querySelector(s);
const dlg = $('[role=dialog]'), combo = $('#facility'), list = $('[role=listbox]'), tbody = $('tbody');
let facility = null;
const row = (a) => '<tr><td>' + a.reference + '</td><td>' + a.patientMrn + '</td><td>' + a.facilityName + '</td><td>' + a.visitDate + '</td><td>' + a.status + '</td></tr>';
const load = async () => { const r = await fetch('/api/appointments'); tbody.innerHTML = (await r.json()).map(row).join(''); };
const toast = (msg) => { const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg; document.body.append(t); setTimeout(() => t.remove(), 5000); };
$('#new-appt').onclick = async () => {
  const f = await (await fetch('/api/facilities')).json();
  list.innerHTML = f.map((x) => '<li role="option" data-code="' + x.code + '" aria-selected="false">' + x.name + '</li>').join('');
  facility = null; combo.textContent = 'Select a facility'; $('#mrn').value = ''; $('#visit').value = ''; $('#comment').value = '';
  dlg.querySelector('[role=alert]').hidden = true; dlg.hidden = false;
};
combo.onclick = () => { list.hidden = !list.hidden; combo.setAttribute('aria-expanded', String(!list.hidden)); };
list.onclick = (e) => { const o = e.target.closest('[role=option]'); if (!o) return;
  facility = o.dataset.code; combo.textContent = o.textContent; list.hidden = true; combo.setAttribute('aria-expanded', 'false'); };
$('#cancel').onclick = () => { dlg.hidden = true; };
document.querySelector('[data-testid=${saveId}]').onclick = async () => {
  // Simulate a slow backend so tests must wait on conditions, not on fixed sleeps.
  const r = await fetch('/api/appointments', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ patientMrn: $('#mrn').value, facilityCode: facility, visitDate: $('#visit').value, comment: $('#comment').value }) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) { const a = dlg.querySelector('[role=alert]'); a.textContent = body.error || 'Save failed'; a.hidden = false; return; }
  dlg.hidden = true; await load(); toast('Appointment ' + body.reference + ' created');
};
load();
</script>`);

// ---------------- data access ----------------
async function facilities(tenant) {
  const { rows } = await pool.query(`SELECT id, fields FROM sf_records WHERE object = 'Facility__c' AND fields->>'Tenant__c' = $1 AND (fields->>'Active__c')::boolean ORDER BY fields->>'Name'`, [tenant]);
  return rows.map((r) => ({ id: r.id, code: r.fields.Code__c, name: r.fields.Name }));
}
async function listAppointments(tenant) {
  const fac = Object.fromEntries((await facilities(tenant)).map((f) => [f.code, f.name]));
  const { rows } = await pool.query(`SELECT a.reference, p.mrn, a.facility_code, to_char(a.visit_date,'YYYY-MM-DD') AS visit_date, a.status, a.comment
    FROM appointments a JOIN patients p ON p.id = a.patient_id WHERE a.tenant_id = $1 ORDER BY a.id DESC`, [tenant]);
  return rows.map((r) => ({ reference: r.reference, patientMrn: r.mrn, facilityCode: r.facility_code, facilityName: fac[r.facility_code] ?? r.facility_code, visitDate: r.visit_date, status: r.status, comment: r.comment }));
}

// ---------------- router ----------------
async function handle(req, res) {
  const url = new URL(req.url, BASE);
  const p = url.pathname;
  const type = req.headers['content-type'] ?? '';

  // UI
  if (req.method === 'GET' && (p === '/' || p === '/login')) return html(res, loginPage());
  if (req.method === 'POST' && p === '/login') {
    const b = parseBody(await readBody(req), type);
    const token = login(b.username, b.password, b.tenant);
    if (!token) return html(res, loginPage('Invalid username or password'), 401);
    res.writeHead(303, { location: '/appointments', 'set-cookie': `session=${token}; HttpOnly; Path=/; SameSite=Lax` });
    return res.end();
  }
  if (req.method === 'GET' && p === '/appointments') {
    const s = session(req);
    if (!s) { res.writeHead(303, { location: '/login' }); return res.end(); }
    const { rows } = await pool.query('SELECT name FROM tenants WHERE id = $1', [s.tenant]);
    return html(res, appointmentsPage(s, rows[0]?.name ?? s.tenant));
  }

  // Salesforce mock (OAuth + REST)
  if (req.method === 'POST' && p === '/services/oauth2/token') {
    const b = parseBody(await readBody(req), type);
    if (b.grant_type !== 'client_credentials' || b.client_id !== SF_ID || b.client_secret !== SF_SECRET) return json(res, 400, { error: 'invalid_client', error_description: 'invalid client credentials' });
    const t = '00Dmock!' + randomBytes(20).toString('hex'); sfTokens.add(t);
    return json(res, 200, { access_token: t, instance_url: BASE, token_type: 'Bearer', issued_at: String(Date.now()) });
  }
  if (p.startsWith('/services/data/')) {
    if (!sfTokens.has((req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''))) return json(res, 401, [{ errorCode: 'INVALID_SESSION_ID', message: 'Session expired or invalid' }]);
    if (/\/limits$/.test(p)) return json(res, 200, { DailyApiRequests: { Max: 15000, Remaining: 14990 } });
    if (/\/query\/?$/.test(p)) {
      try {
        const q = runSoql(url.searchParams.get('q') ?? '');
        const params = [q.object]; let sql = 'SELECT id, fields FROM sf_records WHERE object = $1';
        for (const [f, v] of q.conds) {
          if (f === 'Id') { params.push(String(v)); sql += ` AND id = $${params.length}`; continue; }
          params.push(f, String(v)); sql += ` AND fields->>$${params.length - 1} = $${params.length}`;
        }
        if (q.limit) sql += ` LIMIT ${q.limit}`;
        const { rows } = await pool.query(sql, params);
        const records = rows.map((r) => ({ attributes: { type: q.object, url: `/services/data/v62.0/sobjects/${q.object}/${r.id}` },
          ...Object.fromEntries(q.fields.map((f) => [f, f === 'Id' ? r.id : r.fields[f] ?? null])) }));
        return json(res, 200, { totalSize: records.length, done: true, records });
      } catch (e) { return json(res, 400, [{ errorCode: 'MALFORMED_QUERY', message: e.message }]); }
    }
    return json(res, 404, [{ errorCode: 'NOT_FOUND', message: 'mock endpoint not implemented' }]);
  }

  // REST API
  if (req.method === 'GET' && p === '/api/health') {
    await pool.query('SELECT 1');
    return json(res, 200, { status: 'ok', db: 'ok', time: new Date().toISOString() });
  }
  if (req.method === 'POST' && p === '/api/auth/token') {
    const b = parseBody(await readBody(req), type);
    const token = login(b.username, b.password, b.tenant);
    return token ? json(res, 200, { access_token: token, token_type: 'Bearer', expires_in: 3600 }) : json(res, 401, { error: 'invalid_credentials' });
  }
  if (!p.startsWith('/api/')) return json(res, 404, { error: 'not_found' });
  const s = session(req);
  if (!s) return json(res, 401, { error: 'unauthorized' });

  if (req.method === 'GET' && p === '/api/facilities') return json(res, 200, await facilities(s.tenant));

  if (req.method === 'POST' && p === '/api/patients') {
    const b = parseBody(await readBody(req), type);
    if (!b.fullName || !b.insuranceCode) return json(res, 400, { error: 'fullName and insuranceCode are required' });
    const plan = await pool.query('SELECT active FROM insurance_plans WHERE tenant_id = $1 AND code = $2', [s.tenant, b.insuranceCode]);
    if (!plan.rows[0]?.active) return json(res, 422, { error: `insurance plan ${b.insuranceCode} is not active for this tenant` });
    const { rows } = await pool.query(`INSERT INTO patients (tenant_id, mrn, full_name, insurance_code) VALUES ($1,$2,$3,$4)
      RETURNING id, mrn, full_name AS "fullName", insurance_code AS "insuranceCode", tenant_id AS "tenantId", created_at AS "createdAt"`, [s.tenant, mrn(), b.fullName, b.insuranceCode]);
    return json(res, 201, rows[0]);
  }
  const pm = p.match(/^\/api\/patients\/([\w-]+)$/);
  if (pm && req.method === 'GET') {
    const { rows } = await pool.query(`SELECT id, mrn, full_name AS "fullName", insurance_code AS "insuranceCode", tenant_id AS "tenantId", created_at AS "createdAt" FROM patients WHERE mrn = $1 AND tenant_id = $2`, [pm[1], s.tenant]);
    return rows[0] ? json(res, 200, rows[0]) : json(res, 404, { error: 'not_found' });
  }
  if (pm && req.method === 'DELETE') {
    const del = await pool.query(`DELETE FROM patients WHERE mrn = $1 AND tenant_id = $2 RETURNING id`, [pm[1], s.tenant]);
    await pool.query(`DELETE FROM sf_records WHERE object = 'Appointment__c' AND fields->>'Patient_MRN__c' = $1`, [pm[1]]);
    return del.rowCount ? json(res, 204) : json(res, 404, { error: 'not_found' });
  }

  if (req.method === 'GET' && p === '/api/appointments') return json(res, 200, await listAppointments(s.tenant));
  if (req.method === 'POST' && p === '/api/appointments') {
    const b = parseBody(await readBody(req), type);
    const patient = (await pool.query('SELECT id FROM patients WHERE mrn = $1 AND tenant_id = $2', [b.patientMrn, s.tenant])).rows[0];
    const fac = (await facilities(s.tenant)).find((f) => f.code === b.facilityCode);
    if (!patient) return json(res, 422, { error: `Unknown patient MRN ${b.patientMrn}` });
    if (!fac) return json(res, 422, { error: 'Select a facility' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.visitDate ?? '')) return json(res, 422, { error: 'Visit date is required' });
    await new Promise((r) => setTimeout(r, 400)); // realistic latency
    const reference = ref();
    await pool.query(`INSERT INTO appointments (reference, tenant_id, patient_id, facility_code, visit_date, comment, status) VALUES ($1,$2,$3,$4,$5,$6,'SCHEDULED')`,
      [reference, s.tenant, patient.id, fac.code, b.visitDate, b.comment ?? '']);
    // Integration: sync to "Salesforce" asynchronously, as a real middleware would.
    setTimeout(() => pool.query(`INSERT INTO sf_records VALUES ($1, 'Appointment__c', $2)`, ['a0A' + randomUUID().replace(/-/g, '').slice(0, 15),
      JSON.stringify({ Reference__c: reference, Status__c: 'Scheduled', Facility__c: fac.id, Patient_MRN__c: b.patientMrn, Tenant__c: s.tenant })]).catch(() => {}), 1200);
    return json(res, 201, { reference, status: 'SCHEDULED', patientMrn: b.patientMrn, facilityCode: fac.code, visitDate: b.visitDate });
  }
  if (req.method === 'GET' && p === '/api/appointments/export.csv') {
    const rows = await listAppointments(s.tenant);
    const esc = (v) => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
    const csv = ['Reference,Patient MRN,Facility,Visit Date,Status', ...rows.map((r) => [r.reference, r.patientMrn, r.facilityName, r.visitDate, r.status].map(esc).join(','))].join('\n');
    res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="appointments-${s.tenant}.csv"` });
    return res.end(csv);
  }
  if (req.method === 'GET' && p === '/api/appointments/export.xlsx') {
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Appointments');
    ws.addRow(['Reference', 'Patient MRN', 'Facility', 'Visit Date', 'Status']);
    for (const r of await listAppointments(s.tenant)) ws.addRow([r.reference, r.patientMrn, r.facilityName, r.visitDate, r.status]);
    res.writeHead(200, { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': `attachment; filename="appointments-${s.tenant}.xlsx"` });
    return res.end(Buffer.from(await wb.xlsx.writeBuffer()));
  }
  return json(res, 404, { error: 'not_found' });
}

http.createServer((req, res) => handle(req, res).catch((e) => { console.error(e); json(res, 500, { error: 'internal_error' }); }))
  .listen(PORT, () => console.log(`demo-app on ${BASE}${DRIFT ? ' (DEMO_DRIFT: test ids renamed)' : ''}`));
