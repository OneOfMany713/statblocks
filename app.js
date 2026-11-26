/* Stat Blocks — personal D&D 5e / 2024 stat block tracker.
   All data lives in this browser (localStorage). Use Library → Export to back up. */
'use strict';

const STORE_KEY = 'statblocks.v1';
const MAX_INSTANCES = 10;
const ABILS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const ABIL_NAMES = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };

/* ============================== state ============================== */
let db = load();
let ui = { tab: db.encounters.length ? 'encounter' : 'library', libSel: null, picker: false, logOpen: false, collapsed: {},
  search: { q: '', min: '', max: '', sort: 'name' } };
let log = [];

function blankDb() {
  return { version: 1, library: {}, encounters: [], activeEnc: null, settings: { mode: 'play', adv: 'normal' } };
}
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { const d = JSON.parse(raw); return Object.assign(blankDb(), d); }
  } catch (e) { console.warn('load failed', e); }
  return blankDb();
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
  catch (e) { toast('Could not save — storage full or blocked'); }
}
function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
}
function slug(s) { return String(s || 'monster').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 60) || 'monster'; }

/* ============================== helpers ============================== */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mod = score => Math.floor((Number(score) - 10) / 2);
const sgn = n => (n >= 0 ? '+' : '') + n;
const num = (v, d = 0) => { const n = parseInt(v, 10); return isNaN(n) ? d : n; };
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2200);
}
/* light markup: **bold**, *italic*, line breaks, bullet/numbered lines */
function fmt(text) {
  return String(text || '').split('\n').map(line => {
    let h = esc(line).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
    const isLi = /^\s*(•|-|\d+\.)\s/.test(line);
    return `<p${isLi ? ' class="li"' : ''}>${h}</p>`;
  }).join('');
}

/* ============================== monster model ============================== */
function normalize(m) {
  const n = {
    schema: 'statblock/1', id: m.id || slug(m.name), edition: m.edition === '2024' ? '2024' : '2014',
    name: m.name || 'Unnamed', size: m.size || '', type: m.type || '', alignment: m.alignment || '', description: m.description || '',
    ac: num(m.ac, 10), acNote: m.acNote || '', hp: { max: num(m.hp && m.hp.max, 1), formula: (m.hp && m.hp.formula) || '' },
    speed: m.speed || '', initiative: m.initiative,
    abilities: {}, saves: {}, skills: Array.isArray(m.skills) ? m.skills.map(s => ({ name: s.name, mod: num(s.mod) })) : [],
    vulnerabilities: m.vulnerabilities || '', resistances: m.resistances || '', immunities: m.immunities || '', conditionImmunities: m.conditionImmunities || '',
    senses: m.senses || '', languages: m.languages || '', cr: m.cr != null ? String(m.cr) : '', xp: m.xp != null ? num(m.xp) : '', pb: m.pb != null ? num(m.pb) : '',
    extras: Array.isArray(m.extras) ? m.extras : [],
    sections: Array.isArray(m.sections) ? m.sections.map(s => ({ title: s.title || 'Section', intro: s.intro || '', entries: (s.entries || []).map(e => ({ name: e.name || '', text: e.text || '', roll: e.roll })) })) : [],
  };
  ABILS.forEach(a => { n.abilities[a] = num(m.abilities && m.abilities[a], 10); });
  if (m.saves) ABILS.forEach(a => { if (m.saves[a] != null && m.saves[a] !== '') n.saves[a] = num(m.saves[a]); });
  if (n.initiative == null || n.initiative === '') n.initiative = mod(n.abilities.dex); else n.initiative = num(n.initiative);
  // entries with no roll key at all get auto-detected (e.g. from a future text importer)
  n.sections.forEach(s => s.entries.forEach(e => { if (e.roll === undefined) e.roll = detectRolls(e.name, e.text); }));
  return n;
}
function blankMonster() {
  return normalize({ name: 'New Monster', id: 'new-monster-' + uid(), hp: { max: 10, formula: '' },
    sections: [{ title: 'Traits', entries: [] }, { title: 'Actions', entries: [{ name: 'Attack', text: '', roll: {} }] }] });
}
function saveMod(m, a) { return m.saves[a] != null ? m.saves[a] : mod(m.abilities[a]); }

/* ============================== dice ============================== */
function d(n) {
  if (window.crypto && crypto.getRandomValues) { const a = new Uint32Array(1); crypto.getRandomValues(a); return 1 + (a[0] % n); }
  return 1 + Math.floor(Math.random() * n);
}
function rollD20(bonus) {
  const mode = db.settings.adv;
  const a = d(20), b = mode === 'normal' ? null : d(20);
  let kept = a;
  if (mode === 'adv') kept = Math.max(a, b); else if (mode === 'dis') kept = Math.min(a, b);
  let dice;
  if (b == null) dice = `[${a}]`;
  else {
    const keptIdx = kept === a ? 0 : 1;
    dice = `[${[a, b].map((v, i) => `<span class="${i === keptIdx ? 'kept' : 'drop'}">${v}</span>`).join(', ')}]`;
  }
  const label = mode === 'adv' ? 'd20 (adv)' : mode === 'dis' ? 'd20 (dis)' : 'd20';
  return { nat: kept, total: kept + bonus, html: `${label} ${dice} ${bonus ? sgn(bonus) : ''} = <span class="tot">${kept + bonus}</span>${kept === 20 ? ' <span class="crit">NAT 20</span>' : kept === 1 ? ' <span class="fumble">NAT 1</span>' : ''}` };
}
/* "4d8+4", "2d6 + 1d4 - 1", "5" */
function rollExpr(expr, crit = false) {
  const s = String(expr).replace(/\s+/g, '');
  const re = /([+-]?)(?:(\d*)d(\d+)|(\d+))/gi;
  let m, total = 0, bits = [], ok = false;
  while ((m = re.exec(s))) {
    if (!m[0]) { re.lastIndex++; continue; }
    ok = true;
    const sign = m[1] === '-' ? -1 : 1;
    if (m[3]) {
      let count = num(m[2] || '1', 1); const sides = num(m[3], 6);
      if (crit) count *= 2;
      const rolls = Array.from({ length: Math.min(count, 200) }, () => d(sides));
      const sum = rolls.reduce((x, y) => x + y, 0);
      total += sign * sum;
      bits.push(`${bits.length ? (sign < 0 ? ' − ' : ' + ') : (sign < 0 ? '−' : '')}${count}d${sides} [${rolls.join(', ')}]`);
    } else {
      const v = num(m[4]); total += sign * v;
      bits.push(`${bits.length ? (sign < 0 ? ' − ' : ' + ') : (sign < 0 ? '−' : '')}${v}`);
    }
  }
  return ok ? { total, html: bits.join('') } : null;
}
/* "8d6 force + 8d6 poison" -> [{dice:'8d6', type:'force'}, ...] */
function parseDamage(spec) {
  if (!spec || !String(spec).trim()) return [];
  return String(spec).split(/\s+\+\s+(?=\d*d\d)/i).map(part => {
    const m = part.match(/^\s*((?:\d*d\d+|\d+)(?:\s*[+-]\s*(?:\d*d\d+|\d+))*)\s*(.*)$/i);
    return m ? { dice: m[1], type: m[2].trim() } : null;
  }).filter(Boolean);
}
function rollDamage(spec, crit) {
  const comps = parseDamage(spec);
  if (!comps.length) return null;
  let total = 0; const lines = [];
  comps.forEach(c => {
    const r = rollExpr(c.dice, crit); if (!r) return;
    total += r.total;
    lines.push(`${/d/.test(r.html) ? r.html + ' = ' : ''}<b>${r.total}</b> ${esc(c.type)}`);
  });
  return { total, lines };
}

/* ============================== auto-detect rolls from text ============================== */
function detectRolls(name, text) {
  const t = String(text || '').replace(/\*+/g, '');
  const r = {};
  const atk = t.match(/([+-]\d+)\s*to hit/i) || t.match(/Attack Roll:?\s*([+-]\d+)/i);
  if (atk) r.attack = num(atk[1]);
  const AB = '(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)';
  let sv = t.match(new RegExp('DC\\s*(\\d+)\\s+' + AB + '\\s+saving throw', 'i'));
  if (sv) r.save = `DC ${sv[1]} ${sv[2]}`;
  else if ((sv = t.match(new RegExp(AB + '\\s+Saving Throw:?\\s*DC\\s*(\\d+)', 'i')))) r.save = `DC ${sv[2]} ${sv[1]}`;
  // split into sentences; first sentence that contains damage = primary damage
  const sentences = t.split('\n').flatMap(l => l.split(/\.\s+(?=[A-Z])/));
  const dmgRe = /\d+\s*\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)\s*([A-Za-z]+)?\s*damage/gi;
  let primaryDone = false; const extras = [];
  sentences.forEach(sn => {
    const found = [...sn.matchAll(dmgRe)].map(m => ({ dice: m[1].replace(/\s+/g, ''), type: (m[2] || '').toLowerCase() }));
    if (!found.length) return;
    const spec = found.map(f => `${f.dice}${f.type ? ' ' + f.type : ''}`).join(' + ');
    if (!primaryDone) { r.damage = spec; primaryDone = true; } else extras.push({ label: 'Also', dice: spec });
  });
  const rc = (name + ' ' + t).match(/Recharge\s*(\d)/i);
  if (rc) r.recharge = num(rc[1]);
  if (/chosen at random|at random/i.test(t)) {
    const items = (t.match(/^\s*\d+\.\s/gm) || []).length;
    if (items > 1) extras.push({ label: 'Random effect', dice: '1d' + items });
  }
  if (extras.length) r.extras = extras;
  return r;
}
function isRollable(e) { const r = e.roll || {}; return r.attack != null && r.attack !== '' || !!(r.damage && String(r.damage).trim()); }

/* ============================== roll actions ============================== */
function pushLog(who, title, lines) {
  log.unshift({ who, title, lines, t: Date.now() });
  if (log.length > 60) log.pop();
  renderLog();
  const lb = $('#logBody'); if (lb) lb.scrollTop = 0;
}
function rollEntry(m, e) {
  const r = e.roll || {}; const lines = [];
  let crit = false;
  if (r.attack != null && r.attack !== '') {
    const a = rollD20(num(r.attack));
    crit = a.nat === 20;
    lines.push(`To hit: ${a.html}`);
  }
  if (r.damage) {
    const dm = rollDamage(r.damage, crit);
    if (dm) {
      const half = r.save && /half/i.test(e.text) ? ` <span class="dim">(half: ${Math.floor(dm.total / 2)})</span>` : '';
      const label = `Damage${crit ? ' (crit, dice doubled)' : ''}`;
      if (dm.lines.length === 1) lines.push(`${label}: ${dm.lines[0].replace(/<b>(-?\d+)<\/b>/, '<span class="tot">$1</span>')}${half}`);
      else { dm.lines.forEach(l => lines.push(`${label}: ${l}`)); lines.push(`Total damage: <span class="tot">${dm.total}</span>${half}`); }
    }
  }
  if (r.save) lines.push(`<span class="dim">Target save: ${esc(r.save)}</span>`);
  pushLog(m.name, e.name, lines);
}
function rollExtra(m, e, x) {
  const lines = []; let crit = false;
  if (x.attack != null && x.attack !== '') {
    const a = rollD20(num(x.attack)); crit = a.nat === 20;
    lines.push(`To hit: ${a.html}`);
  }
  if (x.dice) {
    const comps = parseDamage(x.dice);
    const dm = rollDamage(x.dice, crit);
    if (!dm) return toast('Could not read dice: ' + x.dice);
    const dl = dm.lines.map(l => (crit ? 'Damage (crit, dice doubled): ' : lines.length ? 'Damage: ' : '') + l);
    if (comps.length > 1) { lines.push(...dl); lines.push(`Total: <span class="tot">${dm.total}</span>`); }
    else lines.push(dl[0].replace(/<b>(-?\d+)<\/b>/, '<span class="tot">$1</span>'));
  }
  pushLog(m.name, `${e.name} — ${x.label}`, lines);
}
function rollRecharge(m, e) {
  const need = num(e.roll.recharge, 6), v = d(6);
  pushLog(m.name, `${e.name} — Recharge ${need}${need < 6 ? '–6' : ''}`, [`d6 [${v}] → ${v >= need ? '<span class="crit">Recharged!</span>' : '<span class="fumble">Not recharged</span>'}`]);
}
function rollSimple(m, label, bonus) {
  const a = rollD20(bonus);
  pushLog(m.name, label, [a.html]);
}

/* ============================== HP logic ============================== */
function applyHpInput(inst, max, raw, which) {
  const s = String(raw).replace(/\s+/g, '');
  if (!s) return false;
  const m = s.match(/^([+-])(\d+)$/), setv = s.match(/^(\d+)$/);
  if (!m && !setv) { toast('Use -5, +10 or a number'); return false; }
  if (which === 'temp') {
    if (setv) inst.temp = num(setv[1]);
    else inst.temp = Math.max(0, inst.temp + (m[1] === '+' ? 1 : -1) * num(m[2]));
    return true;
  }
  if (setv) { inst.hp = num(setv[1]); return true; }
  const n = num(m[2]);
  if (m[1] === '-') {
    const absorbed = Math.min(inst.temp, n);
    inst.temp -= absorbed;
    inst.hp = Math.max(0, inst.hp - (n - absorbed));
    if (absorbed) toast(`${absorbed} absorbed by temp HP`);
  } else {
    inst.hp = Math.min(max, inst.hp + n);
  }
  return true;
}

/* ============================== encounters ============================== */
function activeEnc() {
  let e = db.encounters.find(x => x.id === db.activeEnc);
  if (!e && db.encounters.length) { e = db.encounters[0]; db.activeEnc = e.id; }
  return e || null;
}
function newEncounter(name) {
  const e = { id: uid(), name: name || `Encounter ${db.encounters.length + 1}`, groups: [] };
  db.encounters.push(e); db.activeEnc = e.id; save(); return e;
}
function addToEncounter(monsterId, count = 1) {
  const enc = activeEnc() || newEncounter();
  const m = db.library[monsterId]; if (!m) return;
  let g = enc.groups.find(x => x.monsterId === monsterId);
  if (!g) { g = { id: uid(), monsterId, next: 1, instances: [] }; enc.groups.push(g); }
  for (let i = 0; i < count; i++) addInstance(g, m);
  save();
}
function addInstance(g, m) {
  if (g.instances.length >= MAX_INSTANCES) { toast(`Max ${MAX_INSTANCES} of one monster`); return false; }
  g.instances.push({ id: uid(), label: String(g.next++), hp: m.hp.max, temp: 0 });
  return true;
}

/* ============================== import / export ============================== */
function importObject(obj, report) {
  if (Array.isArray(obj)) { obj.forEach(o => importObject(o, report)); return; }
  if (!obj || typeof obj !== 'object') return;
  if (obj.kind === 'statblocks-backup') {
    Object.values(obj.library || {}).forEach(m => importObject(m, report));
    (obj.encounters || []).forEach(enc => {
      const i = db.encounters.findIndex(x => x.id === enc.id);
      if (i >= 0) db.encounters[i] = enc; else db.encounters.push(enc);
      report.enc++;
    });
    return;
  }
  if (!obj.name) return;
  const m = normalize(obj);
  if (db.library[m.id]) report.updated.push(m.name); else report.added.push(m.name);
  db.library[m.id] = m;
}
async function importFiles(files) {
  const report = { added: [], updated: [], enc: 0, bad: [] };
  for (const f of files) {
    try { importObject(JSON.parse(await f.text()), report); }
    catch (e) { report.bad.push(f.name); }
  }
  // drop encounter groups whose monster is missing
  db.encounters.forEach(e => { e.groups = (e.groups || []).filter(g => db.library[g.monsterId]); });
  save();
  const parts = [];
  if (report.added.length) parts.push(`Added ${report.added.length}`);
  if (report.updated.length) parts.push(`Updated ${report.updated.length}`);
  if (report.enc) parts.push(`${report.enc} encounter(s)`);
  if (report.bad.length) parts.push(`Couldn't read: ${report.bad.join(', ')}`);
  toast(parts.join(' · ') || 'Nothing to import');
  if (report.added.length + report.updated.length === 1 && ui.tab === 'library') {
    const name = report.added[0] || report.updated[0];
    const m = Object.values(db.library).find(x => x.name === name); if (m) ui.libSel = m.id;
  }
  render();
}
function isTouchApple() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
async function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  // iPhone / iPad: share sheet → "Save to Files" (lets you pick iCloud Drive)
  if (isTouchApple() && navigator.canShare) {
    const file = new File([blob], filename, { type: 'application/json' });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function stamp() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function exportAll() {
  downloadJson(`statblocks-backup-${stamp()}.json`, { kind: 'statblocks-backup', version: 1, exported: new Date().toISOString(), library: db.library, encounters: db.encounters });
}

/* ============================== rendering: stat block ============================== */
function renderStatBlock(m, opts = {}) {
  const edit = db.settings.mode === 'edit';
  return edit ? renderEdit(m, opts) : renderPlay(m, opts);
}
function line(label, val) { return val !== '' && val != null ? `<div class="sb-line"><b>${label}</b> ${esc(val)}</div>` : ''; }
function renderPlay(m, opts) {
  const mid = esc(m.id);
  const subtitle = m.edition === '2024'
    ? (m.description ? `<div class="sb-sub">${esc(m.description)}</div>` : '')
    : `<div class="sb-sub">${esc([m.size, m.type].filter(Boolean).join(' '))}${m.alignment ? ', ' + esc(m.alignment) : ''}</div>`;
  const crText = m.cr !== '' ? `CR ${esc(m.cr)}` : '';
  const top = m.edition === '2024'
    ? `<div class="sb-top two">
        <div>
          <div class="sb-line"><b>AC</b> ${m.ac}${m.acNote ? ` (${esc(m.acNote)})` : ''}</div>
          <div class="sb-line"><b>HP</b> ${m.hp.max}${m.hp.formula ? ` (${esc(m.hp.formula)})` : ''}</div>
          ${line('Speed', m.speed)}
        </div>
        <div>
          <div class="sb-line rollable" data-act="rollInit" data-mid="${mid}"><b>Initiative</b> ${sgn(m.initiative)} (${10 + m.initiative})</div>
          ${line('Size', m.size)}${line('Type', [m.type, m.alignment].filter(Boolean).join(', '))}
        </div></div>`
    : `<div class="sb-line"><b>Armor Class</b> ${m.ac}${m.acNote ? ` (${esc(m.acNote)})` : ''}</div>
       <div class="sb-line"><b>Hit Points</b> ${m.hp.max}${m.hp.formula ? ` (${esc(m.hp.formula)})` : ''}</div>
       ${line('Speed', m.speed)}
       <div class="sb-line rollable" data-act="rollInit" data-mid="${mid}"><b>Initiative</b> ${sgn(m.initiative)}</div>`;
  const abil = `<div class="abil">${ABILS.map(a => {
    const sc = m.abilities[a], md = mod(sc), sv = saveMod(m, a), prof = m.saves[a] != null && sv !== md;
    return `<div class="ab"><div class="k">${a.toUpperCase()}</div>
      <button class="sc rollable" data-act="rollCheck" data-mid="${mid}" data-ab="${a}" title="${ABIL_NAMES[a]} check">${sc} (${sgn(md)})</button>
      <button class="sv rollable ${prof ? 'prof' : ''}" data-act="rollSave" data-mid="${mid}" data-ab="${a}" title="${ABIL_NAMES[a]} save">save ${sgn(sv)}</button></div>`;
  }).join('')}</div>`;
  const skills = m.skills.length ? `<div class="sb-line"><b>Skills</b> ${m.skills.map((s, i) =>
    `<button class="chip rollable" data-act="rollSkill" data-mid="${mid}" data-i="${i}">${esc(s.name)} ${sgn(s.mod)}</button>`).join('')}</div>` : '';
  const props = [
    skills,
    line(m.edition === '2024' ? 'Vulnerabilities' : 'Damage Vulnerabilities', m.vulnerabilities),
    line(m.edition === '2024' ? 'Resistances' : 'Damage Resistances', m.resistances),
    line(m.edition === '2024' ? 'Immunities' : 'Damage Immunities', m.immunities),
    line('Condition Immunities', m.conditionImmunities),
    line('Senses', m.senses), line('Languages', m.languages),
    ...m.extras.map(x => line(esc(x.label), x.text)),
    (m.cr !== '' || m.xp !== '' || m.pb !== '') ? `<div class="sb-line">${m.edition === '2024'
      ? `${m.xp !== '' ? `<b>XP</b> ${Number(m.xp).toLocaleString()}` : ''}${m.pb !== '' ? ` &nbsp; <b>Proficiency Bonus</b> ${sgn(m.pb)}` : ''}`
      : `<b>Challenge</b> ${esc(m.cr)}${m.xp !== '' ? ` (${Number(m.xp).toLocaleString()} XP)` : ''}${m.pb !== '' ? ` &nbsp; <b>Proficiency Bonus</b> ${sgn(m.pb)}` : ''}`}</div>` : ''
  ].join('');
  const secs = m.sections.map((s, si) => `<div class="sb-sec">
      ${s.title && !(si === 0 && /^traits$/i.test(s.title) && m.edition === '2014') ? `<h4>${esc(s.title)}</h4>` : (si === 0 ? '<hr class="sb-rule">' : '')}
      ${s.intro ? `<div class="entry">${fmt(s.intro)}</div>` : ''}
      ${s.entries.map((e, ei) => renderEntry(m, e, si, ei)).join('')}
    </div>`).join('');
  return `<div class="sb play ${opts.solo ? 'solo' : ''}">
    <div class="sb-name"><h3>${esc(m.name)}</h3>${m.edition === '2024' ? `<span class="sb-cr">${crText}</span>` : ''}</div>
    ${subtitle}
    <hr class="sb-rule">${top}
    <hr class="sb-rule">${abil}
    <hr class="sb-rule">${props}
    <div class="sb-body ${opts.wide ? 'cols' : ''}">${secs}</div>
  </div>`;
}
function renderEntry(m, e, si, ei) {
  const r = e.roll || {}, rollable = isRollable(e);
  const paras = String(e.text || '').split('\n');
  const first = paras.shift() || '';
  const firstHtml = fmt(first).replace(/^<p>/, `<p><span class="en">${esc(e.name)}.</span> `);
  const hint = rollable ? `<span class="dice-hint"> 🎲</span>` : '';
  const xs = [];
  if (r.recharge) xs.push(`<button class="xchip" data-act="rollRecharge" data-mid="${esc(m.id)}" data-si="${si}" data-ei="${ei}">Recharge ${r.recharge}${r.recharge < 6 ? '–6' : ''}</button>`);
  (r.extras || []).forEach((x, xi) => xs.push(`<button class="xchip" data-act="rollExtra" data-mid="${esc(m.id)}" data-si="${si}" data-ei="${ei}" data-xi="${xi}">🎲 ${esc(x.label)}${x.attack != null && x.attack !== '' ? ` (${sgn(num(x.attack))} to hit)` : `: ${esc(x.dice)}`}</button>`));
  return `<div class="entry ${rollable ? 'rollable' : ''}" ${rollable ? `data-act="rollEntry" data-mid="${esc(m.id)}" data-si="${si}" data-ei="${ei}"` : ''}>
    ${firstHtml.replace(/<\/p>$/, hint + '</p>')}${paras.length ? fmt(paras.join('\n')) : ''}
    ${xs.length ? `<div class="xchips">${xs.join('')}</div>` : ''}
  </div>`;
}

/* ---------- edit mode ---------- */
function inp(path, val, type = 'text', extra = '') {
  return `<input data-path="${path}" data-type="${type}" value="${esc(val)}" ${type === 'num' ? 'inputmode="numeric"' : ''} ${extra}>`;
}
function ta(path, val, type = 'text', rows = 3) { return `<textarea data-path="${path}" data-type="${type}" rows="${rows}">${esc(val)}</textarea>`; }
function renderEdit(m, opts) {
  const P = `m:${m.id}:`;
  const savesTxt = ABILS.filter(a => m.saves[a] != null).map(a => `${a.toUpperCase()} ${sgn(m.saves[a])}`).join(', ');
  const skillsTxt = m.skills.map(s => `${s.name} ${sgn(s.mod)}`).join(', ');
  const extrasTxt = m.extras.map(x => `${x.label}: ${x.text}`).join('\n');
  const secs = m.sections.map((s, si) => `<div class="sec">
      <div class="g2"><div><label>Section title</label>${inp(P + `sections.${si}.title`, s.title)}</div>
        <div class="ent-tools" style="align-items:flex-end">
          <button class="btn small" data-act="secMove" data-mid="${esc(m.id)}" data-si="${si}" data-dir="-1">↑</button>
          <button class="btn small" data-act="secMove" data-mid="${esc(m.id)}" data-si="${si}" data-dir="1">↓</button>
          <button class="btn small danger" data-act="secDel" data-mid="${esc(m.id)}" data-si="${si}">Delete section</button></div></div>
      <label>Section intro (optional)</label>${ta(P + `sections.${si}.intro`, s.intro, 'text', 2)}
      ${s.entries.map((e, ei) => {
        const r = e.roll || {}; const EP = P + `sections.${si}.entries.${ei}.`;
        return `<div class="ent">
          <label>Name</label>${inp(EP + 'name', e.name)}
          <label>Text</label>${ta(EP + 'text', e.text, 'text', Math.min(14, Math.max(4, Math.ceil(String(e.text).length / 45) + String(e.text).split('\n').length)))}
          <div class="hint">*italic*, **bold**, new line = new paragraph</div>
          <div class="g4">
            <div><label>To hit</label>${inp(EP + 'roll.attack', r.attack ?? '', 'optnum', 'placeholder="none"')}</div>
            <div><label>Damage</label>${inp(EP + 'roll.damage', r.damage || '', 'text', 'placeholder="2d6+3 slashing + 1d6 fire"')}</div>
            <div><label>Target save</label>${inp(EP + 'roll.save', r.save || '', 'text', 'placeholder="DC 15 Dexterity"')}</div>
            <div><label>Recharge on</label>${inp(EP + 'roll.recharge', r.recharge ?? '', 'optnum', 'placeholder="5 = 5–6"')}</div>
          </div>
          <label>Extra roll buttons (one per line — Label: dice, or Label: +to-hit | dice)</label>${ta(EP + 'roll.extras', (r.extras || []).map(x => `${x.label}: ${x.attack != null && x.attack !== '' ? sgn(num(x.attack)) + ' | ' : ''}${x.dice || ''}`).join('\n'), 'extras', 2)}
          <div class="ent-tools">
            <button class="btn small" data-act="entDetect" data-mid="${esc(m.id)}" data-si="${si}" data-ei="${ei}">Auto-fill rolls from text</button>
            <button class="btn small" data-act="entMove" data-mid="${esc(m.id)}" data-si="${si}" data-ei="${ei}" data-dir="-1">↑</button>
            <button class="btn small" data-act="entMove" data-mid="${esc(m.id)}" data-si="${si}" data-ei="${ei}" data-dir="1">↓</button>
            <button class="btn small danger" data-act="entDel" data-mid="${esc(m.id)}" data-si="${si}" data-ei="${ei}">Delete</button>
          </div></div>`;
      }).join('')}
      <button class="btn small" data-act="entAdd" data-mid="${esc(m.id)}" data-si="${si}">+ Add entry to ${esc(s.title)}</button>
    </div>`).join('');
  return `<div class="sb ed ${opts.solo ? 'solo' : ''}">
    <div class="g2"><div><label>Name</label>${inp(P + 'name', m.name)}</div>
      <div><label>Format</label><select data-path="${P}edition" data-type="text">
        <option value="2014" ${m.edition === '2014' ? 'selected' : ''}>2014 (5e)</option>
        <option value="2024" ${m.edition === '2024' ? 'selected' : ''}>2024 (5.5e)</option></select></div></div>
    <div class="g3"><div><label>Size</label>${inp(P + 'size', m.size)}</div><div><label>Type</label>${inp(P + 'type', m.type)}</div><div><label>Alignment</label>${inp(P + 'alignment', m.alignment)}</div></div>
    <label>Description / flavor</label>${ta(P + 'description', m.description, 'text', 2)}
    <div class="g4">
      <div><label>AC</label>${inp(P + 'ac', m.ac, 'num')}</div><div><label>AC note</label>${inp(P + 'acNote', m.acNote)}</div>
      <div><label>Max HP</label>${inp(P + 'hp.max', m.hp.max, 'maxhp')}</div><div><label>HP formula</label>${inp(P + 'hp.formula', m.hp.formula)}</div>
    </div>
    <div class="g2"><div><label>Speed</label>${inp(P + 'speed', m.speed)}</div><div><label>Initiative bonus</label>${inp(P + 'initiative', m.initiative, 'num')}</div></div>
    <div class="g6">${ABILS.map(a => `<div><label>${a.toUpperCase()}</label>${inp(P + 'abilities.' + a, m.abilities[a], 'num')}</div>`).join('')}</div>
    <label>Saving throws (only those that differ from the modifier)</label>${inp(P + 'saves', savesTxt, 'saves', 'placeholder="DEX +6, INT +9"')}
    <label>Skills</label>${inp(P + 'skills', skillsTxt, 'skills', 'placeholder="Perception +5, Stealth +4"')}
    <div class="g2"><div><label>Vulnerabilities</label>${inp(P + 'vulnerabilities', m.vulnerabilities)}</div><div><label>Resistances</label>${inp(P + 'resistances', m.resistances)}</div>
      <div><label>Immunities</label>${inp(P + 'immunities', m.immunities)}</div><div><label>Condition immunities</label>${inp(P + 'conditionImmunities', m.conditionImmunities)}</div></div>
    <label>Senses</label>${inp(P + 'senses', m.senses)}
    <label>Languages</label>${inp(P + 'languages', m.languages)}
    <div class="g3"><div><label>CR</label>${inp(P + 'cr', m.cr)}</div><div><label>XP</label>${inp(P + 'xp', m.xp, 'optnum')}</div><div><label>Prof. bonus</label>${inp(P + 'pb', m.pb, 'optnum')}</div></div>
    <label>Other lines (one per line — Label: text)</label>${ta(P + 'extras', extrasTxt, 'lines', 2)}
    ${secs}
    <div class="ent-tools"><button class="btn" data-act="secAdd" data-mid="${esc(m.id)}">+ Add section</button>
      <button class="btn" data-act="detectAll" data-mid="${esc(m.id)}">Auto-fill rolls for every entry</button></div>
  </div>`;
}
function setPath(obj, path, val) {
  const ks = path.split('.'); let o = obj;
  for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null) o[ks[i]] = {}; o = o[ks[i]]; }
  o[ks[ks.length - 1]] = val;
}
function onEditChange(el) {
  const [, id, path] = el.dataset.path.match(/^m:(.+?):(.+)$/) || [];
  const m = db.library[id]; if (!m) return;
  const type = el.dataset.type, v = el.value;
  if (type === 'num') setPath(m, path, num(v));
  else if (type === 'optnum') setPath(m, path, v.trim() === '' ? '' : num(v));
  else if (type === 'maxhp') {
    const old = m.hp.max, nv = Math.max(1, num(v, old)); m.hp.max = nv;
    db.encounters.forEach(enc => enc.groups.filter(g => g.monsterId === id).forEach(g => g.instances.forEach(inst => {
      if (inst.hp === old || inst.hp > nv) inst.hp = Math.min(nv, inst.hp === old ? nv : inst.hp);
    })));
  }
  else if (type === 'saves') {
    m.saves = {}; for (const x of v.matchAll(/(str|dex|con|int|wis|cha)[a-z]*\s*([+-]?\d+)/gi)) m.saves[x[1].toLowerCase()] = num(x[2]);
  }
  else if (type === 'skills') {
    m.skills = v.split(',').map(s => s.trim().match(/^(.+?)\s*([+-]\d+)$/)).filter(Boolean).map(x => ({ name: x[1], mod: num(x[2]) }));
  }
  else if (type === 'lines') {
    m.extras = v.split('\n').map(l => l.match(/^\s*([^:]+):\s*(.*)$/)).filter(Boolean).map(x => ({ label: x[1].trim(), text: x[2].trim() }));
  }
  else if (type === 'extras') {
    const xs = v.split('\n').map(l => l.match(/^\s*([^:]+):\s*(.+)$/)).filter(Boolean).map(x => {
      const body = x[2].trim(), at = body.match(/^([+-]?\d+)\s*\|\s*(.*)$/);
      return at ? { label: x[1].trim(), attack: num(at[1]), dice: at[2].trim() } : { label: x[1].trim(), dice: body };
    });
    setPath(m, path, xs);
  }
  else setPath(m, path, v);
  if (path.startsWith('abilities.dex') && m.edition === '2014') { /* keep initiative in step with Dex for 2014 blocks */
    const prevDex = mod(num(el.defaultValue)); if (m.initiative === prevDex) m.initiative = mod(m.abilities.dex);
    el.defaultValue = v;
  }
  save();
}

/* ============================== rendering: views ============================== */
function render() {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === db.settings.mode));
  document.querySelectorAll('#advSeg button').forEach(b => b.classList.toggle('on', b.dataset.adv === db.settings.adv));
  const main = $('#main');
  const y = window.scrollY;
  main.innerHTML = ui.tab === 'library' ? viewLibrary() : ui.tab === 'help' ? viewHelp() : viewEncounter();
  window.scrollTo(0, y);
  renderLog();
}
function wide() { return window.innerWidth >= 900; }
function viewEncounter() {
  const enc = activeEnc();
  const editBanner = db.settings.mode === 'edit' ? `<div class="edit-banner">Edit mode — changes to a stat block apply everywhere it's used. Switch back to Play to roll.</div>` : '';
  if (!enc) return `${editBanner}<div class="panel empty"><p>No encounters yet.</p><button class="btn primary" data-act="encNew">+ New encounter</button></div>`;
  const encOpts = db.encounters.map(e => `<option value="${esc(e.id)}" ${e.id === enc.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('');
  const picker = ui.picker ? `<div class="picker">${searchBar()}<div id="pickList">${pickerListHtml()}</div></div>` : '';
  const groups = enc.groups.map(g => {
    const m = db.library[g.monsterId]; if (!m) return '';
    const col = ui.collapsed[g.id];
    const trackers = g.instances.map(inst => {
      const pct = Math.max(0, Math.min(100, Math.round(inst.hp / m.hp.max * 100)));
      const cls = pct <= 25 ? 'low' : pct <= 50 ? 'mid' : '';
      const lbl = db.settings.mode === 'edit'
        ? `<input class="lbl-in" data-act-change="instLabel" data-gid="${esc(g.id)}" data-iid="${esc(inst.id)}" value="${esc(inst.label)}">`
        : `<span class="lbl">#${esc(inst.label)}</span>`;
      return `<div class="tracker ${inst.hp <= 0 ? 'down' : ''}">
        ${lbl}
        <div class="hpbox"><span class="cap">HP ${inst.hp <= 0 ? '<span class="tag-down">down</span>' : ''}</span>
          <button class="hpbtn" data-act="hpEdit" data-gid="${esc(g.id)}" data-iid="${esc(inst.id)}" data-which="hp">${inst.hp} <span class="max">/ ${m.hp.max}</span></button>
          <div class="hpbar"><i class="${cls}" style="width:${pct}%"></i></div></div>
        <div class="hpbox"><span class="cap">Temp</span>
          <button class="hpbtn temp" data-act="hpEdit" data-gid="${esc(g.id)}" data-iid="${esc(inst.id)}" data-which="temp">${inst.temp}</button><div class="hpbar" style="visibility:hidden"></div></div>
        <button class="x" data-act="instDel" data-gid="${esc(g.id)}" data-iid="${esc(inst.id)}" title="Remove this one">×</button>
      </div>`;
    }).join('');
    return `<section class="group">
      <div class="group-head">
        <button class="gname" data-act="collapse" data-gid="${esc(g.id)}">${col ? '▸' : '▾'} ${esc(m.name)}${g.instances.length ? ` <span class="gstats">×${g.instances.length}</span>` : ''}</button>
        <span class="gstats">AC ${m.ac} · Init ${sgn(m.initiative)}</span>
        <span class="grow"></span>
        <button class="btn small" data-act="instAdd" data-gid="${esc(g.id)}" ${g.instances.length >= MAX_INSTANCES ? 'disabled' : ''}>+ Add one</button>
        <button class="btn small" data-act="groupDel" data-gid="${esc(g.id)}">Remove</button>
      </div>
      <div class="trackers">${trackers || '<span class="muted" style="color:#8a6d4c">None left — tap “+ Add one”.</span>'}</div>
      ${col ? '' : renderStatBlock(m, { wide: wide() })}
    </section>`;
  }).join('');
  return `${editBanner}<div class="panel"><div class="row">
      <select class="dark grow" data-act-change="encSelect">${encOpts}</select>
      <button class="btn small" data-act="encNew">New</button>
      <button class="btn small" data-act="encRename">Rename</button>
      <button class="btn small danger" data-act="encDel">Delete</button>
    </div>
    <div class="row" style="margin-top:8px"><button class="btn primary" data-act="togglePicker">${ui.picker ? 'Close' : '+ Add monster'}</button>
      ${enc.groups.length ? `<button class="btn" data-act="resetEnc">Reset HP</button>` : ''}</div>${picker}</div>
    ${groups || '<div class="empty">This encounter is empty. Tap “+ Add monster”.</div>'}`;
}

/* ============================== search ============================== */
const CR_STEPS = ['0', '1/8', '1/4', '1/2', ...Array.from({ length: 30 }, (_, i) => String(i + 1))];
function crValue(cr) {
  const s = String(cr ?? '').trim().replace(/^[A-Za-z]+\s*/, ''); if (s === '') return null; // "M2" (minion) counts as 2
  const f = s.match(/^(\d+)\s*\/\s*(\d+)$/); if (f) return num(f[1]) / num(f[2], 1);
  const n = parseFloat(s); return isNaN(n) ? null : n;
}
function searchResults() {
  const { q, min, max, sort } = ui.search;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const lo = min === '' ? null : crValue(min), hi = max === '' ? null : crValue(max);
  const list = Object.values(db.library).filter(m => {
    const hay = `${m.name} ${m.type} ${m.size}`.toLowerCase();
    if (!words.every(w => hay.includes(w))) return false;
    const c = crValue(m.cr);
    if (lo != null && (c == null || c < lo)) return false;
    if (hi != null && (c == null || c > hi)) return false;
    return true;
  });
  const byName = (a, b) => a.name.localeCompare(b.name);
  if (sort === 'cr') list.sort((a, b) => ((crValue(a.cr) ?? -1) - (crValue(b.cr) ?? -1)) || byName(a, b));
  else if (sort === 'crdesc') list.sort((a, b) => ((crValue(b.cr) ?? -1) - (crValue(a.cr) ?? -1)) || byName(a, b));
  else list.sort(byName);
  return list;
}
function searchBar() {
  const S = ui.search;
  const opts = sel => `<option value="">Any</option>` + CR_STEPS.map(c => `<option value="${c}" ${sel === c ? 'selected' : ''}>${c}</option>`).join('');
  return `<div class="searchbar">
    <input class="dark grow" type="search" data-search="q" placeholder="Search by name or type…" value="${esc(S.q)}" autocomplete="off" enterkeyhint="search">
    <div class="row">
      <label class="muted">CR</label><select class="dark" data-search="min" aria-label="Minimum CR">${opts(S.min)}</select>
      <span class="muted">to</span><select class="dark" data-search="max" aria-label="Maximum CR">${opts(S.max)}</select>
      <select class="dark" data-search="sort" aria-label="Sort">
        <option value="name" ${S.sort === 'name' ? 'selected' : ''}>A–Z</option>
        <option value="cr" ${S.sort === 'cr' ? 'selected' : ''}>CR low→high</option>
        <option value="crdesc" ${S.sort === 'crdesc' ? 'selected' : ''}>CR high→low</option>
      </select>
      ${S.q || S.min || S.max ? '<button class="link" data-act="searchClear">Clear</button>' : ''}
    </div></div>`;
}
function libListHtml() {
  const all = Object.keys(db.library).length;
  if (!all) return '<div class="empty">No stat blocks yet. Import the .json files I made for you.</div>';
  const lib = searchResults(), sel = ui.libSel;
  if (!lib.length) return '<div class="empty">No monsters match.</div>';
  return `<div class="muted count">${lib.length === all ? `${all} stat blocks` : `${lib.length} of ${all}`}</div><ul class="lib-list">${lib.map(m => `<li class="lib-item ${sel === m.id ? 'sel' : ''}">
      <div class="grow"><button class="nm" data-act="libView" data-mid="${esc(m.id)}">${esc(m.name)}</button>
        <div class="sub">CR ${esc(m.cr || '—')} · ${esc([m.size.split(' ')[0], m.type].filter(Boolean).join(' '))} · ${m.edition}</div></div>
      <button class="btn small primary" data-act="libAdd" data-mid="${esc(m.id)}">+ Encounter</button>
      <button class="btn small" data-act="libDup" data-mid="${esc(m.id)}">Duplicate</button>
      <button class="btn small" data-act="libExport" data-mid="${esc(m.id)}">Export</button>
      <button class="btn small danger" data-act="libDel" data-mid="${esc(m.id)}">Delete</button>
    </li>`).join('')}</ul>`;
}
function pickerListHtml() {
  if (!Object.keys(db.library).length) return '<div class="muted">Library is empty — import stat blocks on the Library tab.</div>';
  const lib = searchResults();
  return lib.length ? lib.map(m => `<button class="btn" data-act="pickMonster" data-mid="${esc(m.id)}">${esc(m.name)} <span class="muted">CR ${esc(m.cr || '—')}</span></button>`).join('')
    : '<div class="muted">No monsters match.</div>';
}
function refreshResults() {
  const l = $('#libList'); if (l) l.innerHTML = libListHtml();
  const p = $('#pickList'); if (p) p.innerHTML = pickerListHtml();
  const bar = $('.searchbar .row'); // show/hide Clear without re-rendering the input
  if (bar) { const S = ui.search, has = S.q || S.min || S.max, btn = bar.querySelector('[data-act=searchClear]');
    if (has && !btn) bar.insertAdjacentHTML('beforeend', '<button class="link" data-act="searchClear">Clear</button>');
    if (!has && btn) btn.remove(); }
}
function viewLibrary() {
  const sel = ui.libSel && db.library[ui.libSel];
  const has = Object.keys(db.library).length;
  return `<div class="panel">
      <h2>Library</h2>
      <div class="dropzone">Drag &amp; drop stat block <code>.json</code> files anywhere on this page, or
        <div class="row" style="justify-content:center;margin-top:10px">
          <button class="btn primary" data-act="import">Import files…</button>
          <button class="btn" data-act="newMonster">New blank monster</button>
          <button class="btn" data-act="exportAll" ${has ? '' : 'disabled'}>Export everything (backup)</button>
        </div></div>
    </div>
    <div class="panel">${has ? searchBar() : ''}<div id="libList">${libListHtml()}</div></div>
    ${sel ? renderStatBlock(sel, { solo: true, wide: wide() }) : ''}`;
}
function viewHelp() {
  return `<div class="panel help">
    <h2>How it works</h2>
    <h3>Rolling (Play mode)</h3>
    <p>Tap an action with a 🎲 to roll it. Attacks roll d20 + to-hit and damage together (a natural 20 doubles the damage dice). Save-based abilities just roll damage and show the half-damage number. Tap an ability score for a check, “save” for a saving throw, a skill, or Initiative. The Dis / Normal / Adv switch applies to every d20 until you change it.</p>
    <h3>Finding monsters</h3>
    <p>On the Library tab (and in “+ Add monster”), type part of a name or type, and narrow by CR range. Sort A–Z or by CR.</p>
    <h3>Hit points</h3>
    <p>Tap HP and type <code>-5</code> (damage — temp HP absorbs it first), <code>+10</code> (healing, stops at max), or <code>45</code> (set exactly). Press Enter or tap away. Temp HP works the same way. Change Max HP in Edit mode.</p>
    <h3>Edit mode</h3>
    <p>Every field becomes editable. Edits save automatically when you leave a field and apply everywhere that monster is used. To make a tuned variant, use Duplicate on the Library tab first.</p>
    <h3>Backups &amp; moving between devices</h3>
    <p>Your data lives only in this browser on this device. Library → <b>Export everything</b> saves a backup file; on another device, Library → <b>Import files…</b> and pick that file. Re-importing a monster with the same name replaces the old version.</p>
    <p class="muted">Stored on this device: ${Object.keys(db.library).length} stat blocks, ${db.encounters.length} encounters.</p>
  </div>`;
}
function renderLog() {
  const body = $('#logBody'); if (!body) return;
  $('#log').classList.toggle('collapsed', !ui.logOpen);
  $('#logCaret').textContent = ui.logOpen ? '▾' : '▴';
  body.innerHTML = log.length ? log.map(r => `<div class="roll"><div class="rh">${esc(r.title)} <span class="who">${esc(r.who)}</span></div>${r.lines.map(l => `<div class="ln">${l}</div>`).join('')}</div>`).join('')
    : '<div class="muted" style="padding:4px 0 8px">Tap an action in Play mode to roll.</div>';
}

/* ============================== HP inline editor ============================== */
function openHpEditor(btn) {
  const enc = activeEnc(); const g = enc.groups.find(x => x.id === btn.dataset.gid); if (!g) return;
  const inst = g.instances.find(x => x.id === btn.dataset.iid); const m = db.library[g.monsterId];
  const which = btn.dataset.which;
  const input = document.createElement('input');
  input.className = 'hpin'; input.type = 'text'; input.autocomplete = 'off'; input.enterKeyHint = 'done';
  input.placeholder = which === 'temp' ? String(inst.temp) : String(inst.hp);
  btn.replaceWith(input); input.focus();
  let done = false;
  const finish = commit => {
    if (done) return; done = true;
    if (commit && applyHpInput(inst, m.hp.max, input.value, which)) save();
    render();
  };
  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
    else if (ev.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

/* ============================== events ============================== */
function findEntry(t) {
  const m = db.library[t.dataset.mid]; if (!m) return {};
  const e = m.sections[num(t.dataset.si)]?.entries[num(t.dataset.ei)];
  return { m, e };
}
document.addEventListener('click', ev => {
  const t = ev.target.closest('[data-act]'); if (!t) return;
  const act = t.dataset.act;
  const play = db.settings.mode === 'play';
  const enc = activeEnc();
  const grp = () => enc && enc.groups.find(x => x.id === t.dataset.gid);
  switch (act) {
    case 'tab': ui.tab = t.dataset.tab; ui.picker = false; window.scrollTo(0, 0); render(); break;
    case 'mode': db.settings.mode = t.dataset.mode; save(); render(); break;
    case 'adv': db.settings.adv = t.dataset.adv; save(); render(); break;
    case 'toggleLog': ui.logOpen = !ui.logOpen; renderLog(); break;
    case 'searchClear': ui.search.q = ''; ui.search.min = ''; ui.search.max = ''; { const i = $('[data-search=q]'); if (i) i.value = ''; document.querySelectorAll('select[data-search=min],select[data-search=max]').forEach(x => x.value = ''); } refreshResults(); break;
    case 'clearLog': log = []; renderLog(); break;
    // rolls (play mode only)
    case 'rollEntry': if (play) { const { m, e } = findEntry(t); if (e) rollEntry(m, e); } break;
    case 'rollExtra': if (play) { ev.stopPropagation(); const { m, e } = findEntry(t); const x = e && e.roll.extras[num(t.dataset.xi)]; if (x) rollExtra(m, e, x); } break;
    case 'rollRecharge': if (play) { ev.stopPropagation(); const { m, e } = findEntry(t); if (e) rollRecharge(m, e); } break;
    case 'rollCheck': if (play) { const m = db.library[t.dataset.mid]; rollSimple(m, `${ABIL_NAMES[t.dataset.ab]} check`, mod(m.abilities[t.dataset.ab])); } break;
    case 'rollSave': if (play) { const m = db.library[t.dataset.mid]; rollSimple(m, `${ABIL_NAMES[t.dataset.ab]} save`, saveMod(m, t.dataset.ab)); } break;
    case 'rollSkill': if (play) { const m = db.library[t.dataset.mid]; const s = m.skills[num(t.dataset.i)]; rollSimple(m, s.name, s.mod); } break;
    case 'rollInit': if (play) { const m = db.library[t.dataset.mid]; rollSimple(m, 'Initiative', m.initiative); } break;
    // HP
    case 'hpEdit': openHpEditor(t); break;
    // encounters
    case 'encNew': { const n = prompt('Encounter name:', `Encounter ${db.encounters.length + 1}`); if (n !== null) { newEncounter(n.trim() || undefined); ui.tab = 'encounter'; render(); } break; }
    case 'encRename': if (enc) { const n = prompt('Rename encounter:', enc.name); if (n) { enc.name = n.trim(); save(); render(); } } break;
    case 'encDel': if (enc && confirm(`Delete encounter “${enc.name}”? (Stat blocks stay in your Library.)`)) { db.encounters = db.encounters.filter(x => x !== enc); db.activeEnc = null; save(); render(); } break;
    case 'togglePicker': ui.picker = !ui.picker; render(); break;
    case 'pickMonster': addToEncounter(t.dataset.mid); ui.picker = false; render(); break;
    case 'resetEnc': if (confirm('Reset every monster in this encounter to full HP and 0 temp HP?')) { enc.groups.forEach(g => { const m = db.library[g.monsterId]; g.instances.forEach(i => { i.hp = m.hp.max; i.temp = 0; }); }); save(); render(); } break;
    case 'instAdd': { const g = grp(); if (g && addInstance(g, db.library[g.monsterId])) { save(); render(); } break; }
    case 'instDel': { const g = grp(); if (g) { g.instances = g.instances.filter(i => i.id !== t.dataset.iid); if (!g.instances.length) g.next = 1; save(); render(); } break; }
    case 'groupDel': { const g = grp(); if (g && confirm(`Remove ${db.library[g.monsterId].name} from this encounter?`)) { enc.groups = enc.groups.filter(x => x !== g); save(); render(); } break; }
    case 'collapse': ui.collapsed[t.dataset.gid] = !ui.collapsed[t.dataset.gid]; render(); break;
    // library
    case 'import': $('#fileInput').click(); break;
    case 'exportAll': exportAll(); break;
    case 'newMonster': { const m = blankMonster(); db.library[m.id] = m; ui.libSel = m.id; db.settings.mode = 'edit'; save(); render(); break; }
    case 'libView': ui.libSel = ui.libSel === t.dataset.mid ? null : t.dataset.mid; render(); break;
    case 'libAdd': addToEncounter(t.dataset.mid); toast(`Added to “${activeEnc().name}”`); break;
    case 'libDup': {
      const src = db.library[t.dataset.mid]; const c = JSON.parse(JSON.stringify(src));
      c.name = src.name + ' (copy)'; c.id = slug(c.name) + '-' + uid(); db.library[c.id] = c; ui.libSel = c.id; save(); render(); toast('Duplicated — switch to Edit to tune it'); break;
    }
    case 'libExport': { const m = db.library[t.dataset.mid]; downloadJson(`${m.id}.json`, m); break; }
    case 'libDel': {
      const m = db.library[t.dataset.mid];
      const used = db.encounters.some(e => e.groups.some(g => g.monsterId === m.id));
      if (confirm(`Delete “${m.name}” from your Library?${used ? ' It will also be removed from your encounters.' : ''}`)) {
        delete db.library[m.id]; db.encounters.forEach(e => { e.groups = e.groups.filter(g => g.monsterId !== m.id); });
        if (ui.libSel === m.id) ui.libSel = null; save(); render();
      } break;
    }
    // edit-mode structure
    case 'entAdd': { const m = db.library[t.dataset.mid]; m.sections[num(t.dataset.si)].entries.push({ name: 'New entry', text: '', roll: {} }); save(); render(); break; }
    case 'entDel': { const m = db.library[t.dataset.mid]; const s = m.sections[num(t.dataset.si)]; if (confirm(`Delete “${s.entries[num(t.dataset.ei)].name}”?`)) { s.entries.splice(num(t.dataset.ei), 1); save(); render(); } break; }
    case 'entMove': { const m = db.library[t.dataset.mid]; const a = m.sections[num(t.dataset.si)].entries; const i = num(t.dataset.ei), j = i + num(t.dataset.dir); if (j >= 0 && j < a.length) { [a[i], a[j]] = [a[j], a[i]]; save(); render(); } break; }
    case 'entDetect': { const { m, e } = findEntry(t); if (e) { e.roll = detectRolls(e.name, e.text); save(); render(); toast(isRollable(e) ? 'Rolls filled in — check them' : 'No attack or damage found'); } break; }
    case 'detectAll': { const m = db.library[t.dataset.mid]; if (confirm('Replace the roll settings on every entry with what the text says?')) { m.sections.forEach(s => s.entries.forEach(e => { e.roll = detectRolls(e.name, e.text); })); save(); render(); } break; }
    case 'secAdd': { const m = db.library[t.dataset.mid]; const n = prompt('Section title (e.g. Bonus Actions, Legendary Actions):', 'Bonus Actions'); if (n) { m.sections.push({ title: n, intro: '', entries: [] }); save(); render(); } break; }
    case 'secDel': { const m = db.library[t.dataset.mid]; const s = m.sections[num(t.dataset.si)]; if (confirm(`Delete the whole “${s.title}” section?`)) { m.sections.splice(num(t.dataset.si), 1); save(); render(); } break; }
    case 'secMove': { const m = db.library[t.dataset.mid]; const a = m.sections; const i = num(t.dataset.si), j = i + num(t.dataset.dir); if (j >= 0 && j < a.length) { [a[i], a[j]] = [a[j], a[i]]; save(); render(); } break; }
  }
});
document.addEventListener('input', ev => {
  const k = ev.target.dataset && ev.target.dataset.search;
  if (k === 'q') { ui.search.q = ev.target.value; refreshResults(); }
});
document.addEventListener('change', ev => {
  const el = ev.target;
  if (el.dataset.search) { if (el.dataset.search !== 'q') { ui.search[el.dataset.search] = el.value; refreshResults(); } return; }
  if (el.dataset.path) { onEditChange(el); return; }
  if (el.dataset.actChange === 'encSelect') { db.activeEnc = el.value; save(); render(); }
  if (el.dataset.actChange === 'instLabel') {
    const g = activeEnc().groups.find(x => x.id === el.dataset.gid); const i = g && g.instances.find(x => x.id === el.dataset.iid);
    if (i) { i.label = el.value.trim() || i.label; save(); }
  }
});
$('#fileInput').addEventListener('change', ev => { const f = [...ev.target.files]; ev.target.value = ''; if (f.length) importFiles(f); });

// drag & drop anywhere
let dragDepth = 0;
window.addEventListener('dragenter', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { dragDepth++; $('#dropOverlay').classList.add('on'); } });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('#dropOverlay').classList.remove('on'); });
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => {
  e.preventDefault(); dragDepth = 0; $('#dropOverlay').classList.remove('on');
  const files = [...(e.dataTransfer?.files || [])].filter(f => /\.json$/i.test(f.name) || f.type === 'application/json');
  if (files.length) importFiles(files); else toast('Only .json stat block files can be imported (for now)');
});
let lastWide = wide();
window.addEventListener('resize', () => { if (wide() !== lastWide) { lastWide = wide(); render(); } });

// keep data from being evicted, and cache the app for offline use
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});

render();
