/* SuiviKcal — logique de l'app : accès sur invitation, profil et objectif (Mifflin-St Jeor + garde-fous),
   saisie des repas (écrire, dicter, photo, code-barres, base d'aliments, habituels), activités, humeur du jour,
   semaine et récap, poids, sauvegarde, hors ligne et mise à jour automatique.
   Référence : cahier des charges du projet. */
'use strict';
const ENV = window.SK_ENV || 'local';
const VERSION = self.SUIVIKCAL_VERSION || '?';
const KEY = 'suivikcal.' + ENV + '.donnees';

/* ================== Outils ================== */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => Math.round(n || 0).toLocaleString('fr-FR');
const fmt1 = n => (n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const norm = s => String(s).toLowerCase().replace(/œ/g, 'oe').normalize('NFD').replace(/[̀-ͯ]/g, '');
const pick = a => a[Math.floor(Math.random() * a.length)];
const uid = () => 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function toD(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(s, n) { const d = toD(s); d.setDate(d.getDate() + n); return iso(d); }
function dow(s) { return (toD(s).getDay() + 6) % 7; }
function monday(s) { return addDays(s, -dow(s)); }
const today = () => iso(new Date());
const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const JOURS_LONG = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
function longDate(s) { return toD(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); }
function shortDate(s) { return toD(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); }
function mealByHour() { const n = new Date(), h = n.getHours() + n.getMinutes() / 60; return h < 10.5 ? 'pdj' : h < 15 ? 'dej' : h < 18 ? 'col' : 'din'; }

/* ================== Données (sur le téléphone uniquement) ================== */
const VIDE = () => ({ profile: null, entries: [], acts: [], weights: [], feels: {}, favs: [], recaps: {}, lastBackup: '', reglages: { theme: 'auto', fs: 1 }, lastV: '' });
let D;
try { D = Object.assign(VIDE(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { D = VIDE(); }
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(D)); }
  catch (e) { toast('Mémoire du téléphone pleine : fais une sauvegarde puis supprime d\'anciennes photos en attente.'); }
}
(function migrer() {
  const favs = [];
  (D.favs || []).forEach(f => {
    const items = Array.isArray(f.items) ? f.items : [f];
    items.forEach(e => { if (e && e.name && !favs.some(x => norm(x.name) === norm(e.name))) favs.push({ id: uid(), name: e.name, qty: e.qty || '1 portion', kcal: Math.round(e.kcal || 0), p: e.p || 0, g: e.g || 0, l: e.l || 0, cat: e.cat || '', veg: !!e.veg, fruit: !!e.fruit, n: e.n || 0 }); });
  });
  D.favs = favs;
  D.entries.forEach(enrich);
})();
const U = { tab: 'today', day: today(), weekOff: 0, wRange: '3m', weighLater: false };

function entryFrom(f, mult, meal, date, src) {
  mult = mult || 1; const g = f.pg * mult;
  return { id: uid(), date, meal, name: f.n,
    qty: mult === 1 ? f.pl : (Number.isInteger(mult) ? mult + ' × ' + (f.pl.startsWith('1 ') ? f.pl.slice(2) : f.pl) : Math.round(g) + ' g'),
    kcal: Math.round(f.kc * g / 100), p: f.p * g / 100, g: f.g * g / 100, l: f.l * g / 100, cat: f.cat, src: src || 'ciqual', mEst: !!f.mEst };
}
function entryFromApi(a, meal, date) {
  return enrich({ id: uid(), date, meal, name: a.nom || 'Aliment', qty: a.portion || '1 portion', kcal: Math.round(a.kcal || 0), p: a.p || 0, g: a.g || 0, l: a.l || 0, cat: a.cat || '', veg: !!a.veg, fruit: !!a.fruit, src: 'ia' });
}
/* Légumes et fruits reconnus dans le nom (« Penne aux légumes », « salade de fruits »…). */
const RX_VEG = /legume|salade|soupe|veloute|potage|ratatouille|tomate|courgette|carotte|haricot vert|brocoli|epinard|poivron|aubergine|champignon|crudite|chou|poireau|petits pois|concombre|radis|betterave|asperge|artichaut|navet|potiron|courge|butternut|endive|fenouil|celeri|oignon|wok|poelee|gaspacho|taboule/;
const RX_FRUIT = /fruit|pomme(?! de terre| de terres)|poire|banane|orange|clementine|mandarine|kiwi|fraise|framboise|myrtille|raisin|peche|abricot|prune|cerise|ananas|mangue|melon|pasteque|compote|agrume|pamplemousse|figue|grenade|litchi/;
function hasVegE(e) { return e.cat === 'veg' || e.veg || RX_VEG.test(norm(e.name)); }
function hasFruitE(e) { return e.cat === 'fruit' || e.fruit || RX_FRUIT.test(norm(e.name)); }
/* Macros absentes (saisie manuelle, valeur donnée par l'utilisateur, aliment inconnu) : estimation.
   1) d'après un aliment proche de la base, au prorata des calories ; 2) sinon répartition moyenne 15 / 50 / 35 %. */
function enrich(e) {
  if (!e || e.pending) return e;
  const k = Number(e.kcal) || 0;
  if (k > 0 && (Number(e.p) || 0) + (Number(e.g) || 0) + (Number(e.l) || 0) < 0.5) {
    const n = norm(e.name), hit = KEYS.find(({ k: key }) => new RegExp('(^|[^a-z])' + key + 's?($|[^a-z])').test(n));
    if (hit && hit.f.kc > 0) { const r = k / hit.f.kc; e.p = hit.f.p * r; e.g = hit.f.g * r; e.l = hit.f.l * r; }
    else { e.p = k * .15 / 4; e.g = k * .50 / 4; e.l = k * .35 / 9; }
    e.mEst = true;
  }
  return e;
}

/* ================== Objectif (Mifflin-St Jeor + garde-fous) ================== */
function goalInfo(p = D.profile) {
  const year = new Date().getFullYear();
  const age = year - p.annee, notes = [];
  const bmr = 10 * p.poids + 6.25 * p.taille - 5 * age + (p.sexe === 'H' ? 5 : -161);
  const tdee = bmr * ACTIVITY[p.act].f;
  let deficit = 0;
  const young = age <= 20;
  if (p.vise < p.poids) deficit = tdee * PACE[p.pace].pct; else notes.push('Poids visé atteint : on vise la stabilité.');
  if (young) { deficit = Math.min(deficit, tdee * 0.10); notes.push('En tant que jeune, tu as une marge 😉 Avant 21 ans, le rythme reste doux quel que soit ton choix.'); }
  let goal = tdee - deficit; const floor = p.sexe === 'F' ? 1200 : 1500;
  if (goal < floor) { goal = floor; notes.push('Objectif remonté au minimum de ' + fmt(floor) + ' kcal.'); }
  goal = Math.round(goal / 10) * 10;
  return { age, bmr, tdee, deficit: Math.max(0, tdee - goal), goal, notes, young, perWeek: Math.max(0, tdee - goal) * 7 / 7700,
    pT: goal * .2 / 4, gT: goal * .5 / 4, lT: goal * .3 / 9 };
}
function minKg(taille) { return Math.ceil(18.5 * (taille / 100) ** 2 * 2) / 2; }
function bmi(kg, taille) { return kg / ((taille / 100) ** 2); }

const dayEntries = d => D.entries.filter(e => e.date === d);
const eaten = d => dayEntries(d).filter(e => !e.pending).reduce((a, e) => a + e.kcal, 0);
const burned = d => D.acts.filter(a => a.date === d).reduce((a, x) => a + x.kcal, 0);
const sortedWeights = () => [...D.weights].sort((a, b) => a.date < b.date ? -1 : 1);
const lastWeight = () => { const w = sortedWeights(); return w[w.length - 1]; };
const currentKg = () => (lastWeight() || {}).kg || (D.profile && D.profile.poids) || 70;

/* ================== Rendu ================== */
const main = $('#main');
function render() {
  if (!D.profile) return;
  $('#netPill').hidden = navigator.onLine;
  document.querySelectorAll('.tabs [data-tab]').forEach(b => b.setAttribute('aria-current', b.dataset.tab === U.tab ? 'page' : 'false'));
  ({ today: renderToday, week: renderWeek, weight: renderWeight, profile: renderProfile })[U.tab]();
}

function ring(pct) {
  const r = 56, c = 2 * Math.PI * r, v = Math.min(pct, 100) / 100;
  return `<svg viewBox="0 0 132 132" aria-hidden="true"><circle cx="66" cy="66" r="${r}" fill="none" stroke="var(--line)" stroke-width="11"/>
  <circle cx="66" cy="66" r="${r}" fill="none" stroke="var(--accent)" stroke-width="11" stroke-linecap="round" stroke-dasharray="${c * v} ${c}"/></svg>`;
}

function dayLabel(d) { const t = today(); return d === t ? 'Aujourd\'hui' : d === addDays(t, -1) ? 'Hier' : longDate(d).replace(/^./, c => c.toUpperCase()); }

function renderToday() {
  const T = today(), day = U.day, g = goalInfo(), b = burned(day), budget = g.goal + b, ate = eaten(day), rest = budget - ate, pct = Math.round(ate / budget * 100);
  const es = dayEntries(day).filter(e => !e.pending);
  const P = es.reduce((a, e) => a + e.p, 0), G = es.reduce((a, e) => a + e.g, 0), L = es.reduce((a, e) => a + e.l, 0);
  const pend = dayEntries(day).filter(e => e.pending).length;
  const lw = lastWeight(); const needWeigh = day === T && dow(T) === 0 && !U.weighLater && (!lw || lw.date < monday(T));
  let h = `<div class="head-row"><div><p class="muted">${day === T ? longDate(T) : 'Rattrapage'}</p><h1>${dayLabel(day)}</h1></div>
    <div class="daynav"><button class="round" data-act="dayPrev" aria-label="Jour précédent" ${day <= addDays(T, -60) ? 'disabled' : ''}>‹</button><button class="round" data-act="dayNext" aria-label="Jour suivant" ${day >= T ? 'disabled' : ''}>›</button></div></div>
  <div class="card"><div class="hero row">
    <div class="ring">${ring(pct)}<div class="in"><span class="big num">${fmt(ate)}</span><span class="sub num">sur ${fmt(budget)} kcal</span><span class="pct num">${pct} %</span></div></div>
    <div class="kvs">
      <div class="kv"><span>🍽️ Mangé</span><b class="num">${fmt(ate)}</b></div>
      <div class="kv burn"><span>🔥 Brûlé</span><b class="num">+${fmt(b)}</b></div>
      <div class="kv"><span>${rest >= 0 ? '✨ Reste' : '🌙 Au-delà'}</span><b class="num">${fmt(Math.abs(rest))}</b></div>
      <button class="link" data-act="addAct" style="align-self:flex-start;padding:0">+ Une activité</button>
    </div></div>
    <div class="macros">${[['Protéines', P, g.pT], ['Glucides', G, g.gT], ['Lipides', L, g.lT]].map(([n, v, t]) => `<div class="mac"><span>${n} · ${fmt(v)} g</span><div class="bar"><i style="width:${Math.min(100, v / t * 100)}%"></i></div></div>`).join('')}</div>
  </div>`;
  if (pend) h += `<div class="card soft"><p class="note" style="color:var(--text)">⏳ <b>${pend} saisie${pend > 1 ? 's' : ''} à estimer</b> dès le retour du réseau. Le total se complète tout seul.</p></div>`;
  if (needWeigh) h += `<div class="card sage"><p class="h3">⚖️ C'est lundi, on se pèse ?</p><p class="note">Facultatif.</p>
    <div class="row"><button class="small acc" data-act="weigh">Me peser</button><button class="small" data-act="weighLater">Pas cette fois</button></div></div>`;
  MEALS.forEach(m => {
    const list = dayEntries(day).filter(e => e.meal === m.id), kc = list.reduce((a, e) => a + (e.pending ? 0 : e.kcal), 0);
    h += `<div class="card" style="gap:4px"><div class="meal-h"><span>${m.e}</span><span class="t">${m.n}</span><span class="k grow num">${list.length ? fmt(kc) + ' kcal' : ''}</span>
      <button class="icon-btn" data-act="add" data-meal="${m.id}" aria-label="Ajouter au ${m.n}">＋</button></div>
      ${list.length ? list.map(e => { const fv = isFav(e); return `<div class="lrow"><button class="line ${e.pending ? 'pending' : ''}" data-act="edit" data-id="${e.id}"><span class="grow"><span class="n">${esc(e.name)}</span><span class="q">${esc(e.qty)}${e.own ? ' · ta valeur' : ''}</span></span><span class="kc num">${e.pending ? '⏳ à estimer' : fmt(e.kcal)}</span></button>${e.pending ? '' : `<button class="star ${fv ? 'on' : ''}" data-act="favItem" data-id="${e.id}" aria-label="${fv ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${fv ? '★' : '☆'}</button>`}</div>`; }).join('')
      : `<button class="empty-meal" data-act="add" data-meal="${m.id}">Rien de noté. Touche pour ajouter.</button>`}</div>`;
  });
  const acts = D.acts.filter(a => a.date === day);
  if (acts.length) h += `<div class="card" style="gap:4px"><div class="meal-h"><span>🔥</span><span class="t grow">Activités</span><span class="k num">+${fmt(b)} kcal</span></div>
    ${acts.map(a => `<button class="line" data-act="delAct" data-id="${a.id}"><span class="grow"><span class="n">${a.e} ${esc(a.name)}</span><span class="q">${a.min ? a.min + ' min' : 'valeur de la montre'} · toucher pour retirer</span></span><span class="kc num" style="color:var(--sage)">+${fmt(a.kcal)}</span></button>`).join('')}</div>`;
  h += adviceCard(g, P, day);
  const fe = D.feels[day];
  if (fe || day < T || new Date().getHours() >= 19) {
    h += `<div class="card"><div class="head-row"><p class="h3">${fe ? 'Ta journée : ' + fe : 'Comment s\'est passée ta journée ?'}</p>${fe ? '<button class="link" data-act="feelReset">Modifier</button>' : ''}</div>
    ${fe ? '' : `<div class="feel">${['😊', '😐', '😕'].map(f => `<button data-act="feel" data-f="${f}" aria-label="${f}">${f}</button>`).join('')}</div><p class="note">Facultatif, une fois par jour.</p>`}</div>`;
  }
  h += `<div class="card"><div class="head-row"><p class="h3">Ma semaine</p><button class="link" data-act="goWeek">Voir le détail</button></div>${strip()}</div>`;
  main.innerHTML = h;
}

function adviceCard(g, P, day) {
  const es = dayEntries(day).filter(e => !e.pending), tips = [];
  if (!es.length) return '';
  const hasVeg = es.some(hasVegE), hasFruit = es.some(hasFruitE);
  if (P < g.pT * .45) tips.push('Il te manque des <b>protéines</b> : 2 œufs, un yaourt ou une tranche de jambon complètent bien.');
  if (!hasVeg) tips.push('Pas encore de <b>légumes</b> : une soupe ou une salade au prochain repas ?');
  if (!hasFruit) tips.push('Un <b>fruit</b> en collation, c\'est léger et ça fait du bien.');
  if (!tips.length) tips.push('Journée bien équilibrée, rien à ajouter 👌');
  return `<div class="card sage"><p class="h3">💡 Pour équilibrer ta journée</p>${tips.slice(0, 2).map(t => `<p class="note" style="color:var(--text);font-size:.88em">${t}</p>`).join('')}
    ${day === today() ? '<button class="link" data-act="idea" style="align-self:flex-start;padding:0;color:var(--sage)">Une idée de repas ?</button>' : ''}</div>`;
}
function missing(day) {
  const es = dayEntries(day).filter(e => !e.pending), g = goalInfo(), m = [];
  if (es.reduce((a, e) => a + e.p, 0) < g.pT * .45) m.push('protéines');
  if (!es.some(hasVegE)) m.push('légumes');
  if (!es.some(hasFruitE)) m.push('fruits');
  return m.join(', ');
}

function strip() {
  const g = goalInfo().goal, T = today(), mon = monday(T);
  return `<div class="strip">${JOURS.map((j, i) => {
    const d = addDays(mon, i), fut = d > T, ate = eaten(d), bud = g + burned(d), p = ate / bud * 100;
    return `<button class="dcell ${d === U.day ? 'today' : ''} ${fut ? 'future' : ''}" ${fut ? 'disabled' : `data-act="goDay" data-d="${d}"`}><span class="l">${j}</span><span class="col"><i class="${p > 105 ? 'over' : ''}" style="height:${fut ? 0 : Math.min(100, p)}%"></i></span><span class="p num">${fut || !ate ? '·' : Math.round(p) + '%'}</span></button>`;
  }).join('')}</div>`;
}

function weekStats(mon) {
  const g = goalInfo().goal, T = today(), fin = addDays(mon, 7), days = [];
  for (let i = 0; i < 7; i++) { const d = addDays(mon, i); const ate = eaten(d), br = burned(d); days.push({ d, ate, brule: br, bud: g + br, fut: d > T, has: ate > 0 }); }
  const done = days.filter(x => x.has && x.d <= T);
  const avg = done.length ? done.reduce((a, x) => a + x.ate, 0) / done.length : 0;
  const ok = done.filter(x => x.ate <= x.bud * 1.05).length;
  const net = done.reduce((a, x) => a + (x.bud - x.ate), 0);
  const sweets = D.entries.filter(e => e.date >= mon && e.date < fin && e.cat === 'sweet');
  const acts = D.acts.filter(a => a.date >= mon && a.date < fin);
  const actMin = acts.reduce((a, x) => a + (x.min || 0), 0), actKcal = acts.reduce((a, x) => a + x.kcal, 0);
  const feels = [0, 1, 2, 3, 4, 5, 6].map(i => D.feels[addDays(mon, i)] || '');
  const best = done.length ? done.reduce((a, x) => Math.abs(x.bud - x.ate) < Math.abs(a.bud - a.ate) ? x : a) : null;
  return { g, days, done, avg, ok, net, sweets, actMin, actKcal, feels, best };
}
const dayName = d => toD(d).toLocaleDateString('fr-FR', { weekday: 'long' });
function recapStats(mon) {
  const s = weekStats(mon), parJour = {};
  s.sweets.forEach(e => parJour[e.date] = (parJour[e.date] || 0) + 1);
  const top = Object.entries(parJour).sort((a, b) => b[1] - a[1])[0];
  return { jours_notes: s.done.length, jours_objectif: s.ok, moyenne_kcal: Math.round(s.avg), objectif: s.g, douceurs: s.sweets.length,
    jour_le_plus_gourmand: top ? dayName(top[0]) + ' (' + top[1] + ')' : '', activite_min: s.actMin, kcal_brulees: s.actKcal,
    humeurs: s.feels.join(''), journee_la_plus_equilibree: s.best ? dayName(s.best.d) : '' };
}
function recapLocal(mon) {
  const s = weekStats(mon), st = recapStats(mon);
  if (!s.done.length) return 'Pas assez de repas notés pour un récap. On se retrouve lundi prochain 🙂';
  const parts = [];
  parts.push(s.ok >= 5 ? `${s.ok} jours sur ${s.done.length} dans l'objectif. Franchement, chapeau 🎩` : `${s.ok} jours sur ${s.done.length} dans l'objectif. La régularité arrive, on garde le cap 🌱`);
  if (st.douceurs) parts.push(st.douceurs >= 4 ? `${st.douceurs} douceurs cette semaine, mention spéciale à ${st.jour_le_plus_gourmand.split(' ')[0]}. On a vu 👀` : `${st.douceurs} petit${st.douceurs > 1 ? 's' : ''} plaisir${st.douceurs > 1 ? 's' : ''} sucré${st.douceurs > 1 ? 's' : ''}. Raisonnable, on valide 🍫`);
  parts.push(s.actMin ? `Tu as bougé ${s.actMin} minutes. Tes baskets te remercient 👟` : 'Tes baskets se demandent où tu étais cette semaine 👟');
  if (s.best) parts.push(`Ta journée la plus équilibrée : ${dayName(s.best.d)}.`);
  return parts.join(' ');
}
let recapBusy = false;
async function fetchRecap(mon) {
  if (recapBusy || D.recaps[mon] || !navigator.onLine || !weekStats(mon).done.length) return;
  recapBusy = true;
  try {
    const j = await SKApi.appel('bilan', { stats: recapStats(mon) });
    if (j.texte) { D.recaps[mon] = j.texte; save(); if (U.tab === 'week') render(); }
  } catch (e) { handleAccessError(e); }
  finally { recapBusy = false; }
}

function renderWeek() {
  const T = today(), mon = addDays(monday(T), 7 * U.weekOff), s = weekStats(mon), g = s.g;
  const W = 320, H = 150, top = 12, bot = 24, max = Math.max(g * 1.4, ...s.days.map(x => x.ate));
  const y = v => top + (H - top - bot) * (1 - v / max), bw = 26, gap = W / 7;
  /* Barre = tout ce qui a été mangé. Bas (corail) : le « net » ; haut (vert sauge) : la part compensée par le sport. */
  const bars = s.days.map((x, i) => {
    const cx = gap * i + gap / 2, ph = v => (H - top - bot) * (v / max);
    const brule = Math.min(x.brule, x.ate), net = x.ate - brule, hNet = ph(net), hB = ph(brule), h = hNet + hB;
    const over = x.ate > x.bud * 1.05;
    return `<clipPath id="cb${i}"><rect x="${cx - bw / 2}" y="${H - bot - h}" width="${bw}" height="${Math.max(h, 0)}" rx="7"/></clipPath>
    <g clip-path="url(#cb${i})"><rect x="${cx - bw / 2}" y="${H - bot - hNet}" width="${bw}" height="${Math.max(hNet, 0)}" fill="${over ? 'var(--peach)' : 'var(--accent)'}"/>
    ${hB > 0 ? `<rect x="${cx - bw / 2}" y="${H - bot - h}" width="${bw}" height="${hB}" fill="var(--sage)" opacity=".85"/>` : ''}</g>
    <text x="${cx}" y="${H - 8}" text-anchor="middle">${JOURS_LONG[i]}</text>${x.ate ? `<text x="${cx}" y="${H - bot - h - 4}" text-anchor="middle">${fmt(x.ate)}</text>` : ''}`;
  }).join('');
  const legende = s.days.some(x => x.brule > 0 && x.ate > 0) ? `<div class="legend"><span><i style="background:var(--accent)"></i>Mangé, une fois le sport déduit</span><span><i style="background:var(--sage)"></i>Compensé par le sport</span></div>` : '';
  const label = U.weekOff === 0 ? 'Cette semaine' : U.weekOff === -1 ? 'Semaine dernière' : 'Il y a ' + (-U.weekOff) + ' semaines';
  const recapMon = U.weekOff === 0 ? addDays(mon, -7) : mon;
  const recap = D.recaps[recapMon];
  main.innerHTML = `<div class="head-row"><div><p class="muted">${shortDate(mon)} → ${shortDate(addDays(mon, 6))}</p><h1>${label}</h1></div>
    <div class="row"><button class="round" data-act="wk" data-d="-1" ${U.weekOff <= -26 ? 'disabled' : ''} aria-label="Semaine précédente">‹</button><button class="round" data-act="wk" data-d="1" ${U.weekOff >= 0 ? 'disabled' : ''} aria-label="Semaine suivante">›</button></div></div>
  <div class="card"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Calories par jour">
    <line x1="0" x2="${W}" y1="${y(g)}" y2="${y(g)}" stroke="var(--sage)" stroke-dasharray="4 4" stroke-width="1.5"/>
    <text x="${W}" y="${y(g) - 4}" text-anchor="end" style="fill:var(--sage)">objectif ${fmt(g)}</text>${bars}</svg>${legende}</div>
  <div class="stats">
    <div class="stat"><b class="num">${fmt(s.avg)}</b><span>kcal par jour en moyenne</span></div>
    <div class="stat"><b class="num">${s.ok}/${s.done.length}</b><span>jours dans l'objectif</span></div>
    <div class="stat"><b class="num" style="color:var(--sage)">${s.net >= 0 ? '−' : '+'}${fmt1(Math.abs(s.net) / 7700)} kg</b><span>effet estimé de la semaine</span></div>
    <div class="stat"><b class="num" style="color:var(--sage)">${fmt(s.actKcal)} kcal</b><span>brûlées · ${s.actMin} min d'activité</span></div>
  </div>
  <div class="card soft recap"><p class="h3">🗞️ Le récap ${U.weekOff === 0 ? 'de la semaine dernière' : 'de cette semaine'}</p>
    <p>${esc(recap || recapLocal(recapMon))}</p>${recap ? '<span class="ai-badge">Rédigé par l\'IA</span>' : ''}</div>
  <div class="card"><p class="h3">Humeur de la semaine</p><div class="strip">${s.feels.map((f, i) => `<div class="dcell"><span class="l">${JOURS[i]}</span><span style="font-size:1.4em;min-height:1.5em">${f || '·'}</span></div>`).join('')}</div></div>`;
  if (recapMon < monday(T)) fetchRecap(recapMon);
}

function renderWeight() {
  const p = D.profile, ws = sortedWeights(), lw = ws[ws.length - 1];
  if (!lw) { main.innerHTML = `<div class="head-row"><h1>Mon poids</h1><button class="small acc" data-act="weigh">+ Me peser</button></div><p class="note">Aucune pesée pour l'instant.</p>`; return; }
  const T = today(), since = { '1m': addDays(T, -31), '3m': addDays(T, -92), 'all': '0000' }[U.wRange];
  let pts = ws.filter(w => w.date >= since); if (!pts.length) pts = [lw];
  const W = 320, H = 180, L = 34, R = 10, Tp = 14, B = 24;
  const vals = pts.map(w => w.kg).concat([p.vise]); const lo = Math.floor(Math.min(...vals) - 1), hi = Math.ceil(Math.max(...vals) + .5);
  const t0 = toD(pts[0].date).getTime(), t1 = Math.max(toD(pts[pts.length - 1].date).getTime(), t0 + 864e5);
  const x = d => pts.length === 1 ? (L + W - R) / 2 : L + (W - L - R) * ((toD(d).getTime() - t0) / (t1 - t0)), y = v => Tp + (H - Tp - B) * (1 - (v - lo) / (hi - lo));
  const path = pts.map((w, i) => (i ? 'L' : 'M') + x(w.date).toFixed(1) + ' ' + y(w.kg).toFixed(1)).join(' ');
  const area = path + ` L${x(pts[pts.length - 1].date)} ${H - B} L${x(pts[0].date)} ${H - B} Z`;
  const ticks = [lo, (lo + hi) / 2, hi].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${fmt1(v)}</text>`).join('');
  const first = ws[0];
  main.innerHTML = `<div class="head-row"><div><p class="muted">Pesée du lundi, facultative</p><h1>Mon poids</h1></div><button class="small acc" data-act="weigh">+ Me peser</button></div>
  <div class="stats">
    <div class="stat"><b class="num">${fmt1(lw.kg)} kg</b><span>dernière pesée · ${shortDate(lw.date)}</span></div>
    <div class="stat"><b class="num" style="color:var(--sage)">${lw.kg <= first.kg ? '−' : '+'}${fmt1(Math.abs(first.kg - lw.kg))} kg</b><span>depuis le ${shortDate(first.date)}</span></div>
  </div>
  <div class="card">
    <div class="seg" role="group" aria-label="Période">${[['1m', '1 mois'], ['3m', '3 mois'], ['all', 'Tout']].map(([k, n]) => `<button class="${U.wRange === k ? 'sel' : ''}" data-act="wr" data-r="${k}">${n}</button>`).join('')}</div>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Courbe de poids">${ticks}
      <line x1="${L}" x2="${W - R}" y1="${y(p.vise)}" y2="${y(p.vise)}" stroke="var(--sage)" stroke-dasharray="4 4" stroke-width="1.5"/>
      <text x="${W - R}" y="${y(p.vise) - 4}" text-anchor="end" style="fill:var(--sage)">objectif ${fmt1(p.vise)} kg</text>
      ${pts.length > 1 ? `<path d="${area}" fill="var(--accent-soft)" opacity=".7"/><path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
      ${pts.map((w, i) => `<circle cx="${x(w.date)}" cy="${y(w.kg)}" r="${i === pts.length - 1 ? 5 : 3}" fill="${i === pts.length - 1 ? 'var(--accent)' : 'var(--surface)'}" stroke="var(--accent)" stroke-width="2"/>`).join('')}
      <text x="${L}" y="${H - 6}">${shortDate(pts[0].date)}</text><text x="${W - R}" y="${H - 6}" text-anchor="end">${shortDate(pts[pts.length - 1].date)}</text>
    </svg>
    <p class="note">${lw.kg > p.vise ? 'Encore ' + fmt1(lw.kg - p.vise) + ' kg avant l\'objectif' : 'Objectif atteint 🎉'} · IMC ${fmt1(bmi(lw.kg, p.taille))}, repère indicatif</p>
  </div>
  <div class="card wlist" style="gap:0"><p class="h3" style="margin-bottom:6px">Historique</p>
    ${ws.slice().reverse().slice(0, 12).map((w, i, a) => { const prev = a[i + 1]; const d = prev ? w.kg - prev.kg : 0; return `<button class="line" data-act="delWeight" data-d="${w.date}"><span class="grow"><span class="n">${fmt1(w.kg)} kg</span><span class="q">${longDate(w.date)}</span></span><span class="kc num">${prev ? (d <= 0 ? '−' : '+') + fmt1(Math.abs(d)) : ''}</span></button>`; }).join('')}</div>`;
}

function renderProfile() {
  const p = D.profile, g = goalInfo();
  const days = D.lastBackup ? Math.round((toD(today()) - toD(D.lastBackup)) / 864e5) : null;
  main.innerHTML = `<div><p class="muted">${p.sexe === 'H' ? 'Homme' : 'Femme'} · ${g.age} ans · ${p.taille} cm</p><h1>Mon profil</h1></div>
  <div class="card soft"><div class="head-row"><p class="h3">🎯 Mon objectif du jour</p><b class="num" style="font-family:var(--display);font-size:1.4em;color:var(--accent)">${fmt(g.goal)} kcal</b></div>
    <div class="kv"><span>Métabolisme de base</span><b class="num">${fmt(g.bmr)}</b></div>
    <div class="kv"><span>Avec l'activité (${ACTIVITY[p.act].n.toLowerCase()})</span><b class="num">${fmt(g.tdee)}</b></div>
    <div class="kv"><span>Déficit (${PACE[p.pace].n.toLowerCase()}, ≈ ${fmt1(g.perWeek)} kg / sem.)</span><b class="num">−${fmt(g.deficit)}</b></div>
    ${g.notes.map(n => `<p class="note">${n}</p>`).join('')}
    <button class="ghost" data-act="editProfile">Modifier mon profil</button></div>
  <div class="card"><p class="h3">⭐ Mes favoris</p>
    ${favsTries().map(f => `<div class="line"><span class="grow"><span class="n">${esc(f.name)}</span><span class="q">${esc(f.qty)} · ${fmt(f.kcal)} kcal</span></span><button class="link" data-act="renFav" data-id="${f.id}">Renommer</button><button class="link danger" data-act="delFav" data-id="${f.id}">Retirer</button></div>`).join('') || '<p class="note">Touche l\'étoile ☆ à côté d\'un aliment pour l\'ajouter ici.</p>'}</div>
  <div class="card"><p class="h3">Affichage</p>
    <div class="field"><span class="label">Thème</span><div class="seg">${[['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']].map(([k, n]) => `<button class="${D.reglages.theme === k ? 'sel' : ''}" data-act="theme" data-v="${k}">${n}</button>`).join('')}</div></div>
    <div class="field"><span class="label">Taille du texte</span><div class="seg">${['A−', 'A', 'A+'].map((n, i) => `<button class="${D.reglages.fs === i ? 'sel' : ''}" data-act="fs" data-v="${i}">${n}</button>`).join('')}</div></div>
  </div>
  <div class="card"><p class="h3">💾 Sauvegarde</p>
    <p class="note">${days == null ? '<b style="color:var(--accent)">Aucune sauvegarde pour l\'instant.</b> ' : days > 30 ? `<b style="color:var(--accent)">Dernière sauvegarde il y a ${days} jours.</b> ` : 'Sauvegarde à jour. '}Tes données ne sont que sur ce téléphone : garde une copie, surtout sur iPhone.</p>
    <div class="row"><button class="small acc" data-act="export">Exporter</button><button class="small" data-act="import">Importer</button></div></div>
  <div class="card"><p class="h3">Application</p>
    <p class="note" id="updInfo">SuiviKcal v${VERSION}${ENV !== 'prod' ? ' · ' + ENV.toUpperCase() : ''}</p>
    <button class="ghost" data-act="upd">Rechercher une mise à jour</button></div>`;
}

/* ================== Feuilles ================== */
const sheet = $('#sheet'), scrim = $('#scrim');
function openSheet(title, body, mount) {
  sheet.innerHTML = `<div class="sheet-head"><h2>${title}</h2><button class="round" data-close aria-label="Fermer">✕</button></div><div class="sheet-body">${body}</div>`;
  sheet.hidden = scrim.hidden = false; sheet.scrollTop = 0; mount && mount(sheet);
}
function closeSheet() { sheet.hidden = scrim.hidden = true; sheet.innerHTML = ''; if (reloadPending) location.reload(); }
scrim.onclick = closeSheet;
sheet.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });

let toastT;
function toast(msg, btn, fn, ms) {
  $('#toastText').innerHTML = msg; const b = $('#toastBtn'); b.hidden = !btn; b.textContent = btn || '';
  b.onclick = () => { fn && fn(); $('#toast').classList.remove('on'); };
  $('#toast').classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => $('#toast').classList.remove('on'), ms || 3200);
}

function mealSeg(sel) { return `<div class="seg" id="mealSeg" role="group" aria-label="Repas">${MEALS.map(m => `<button class="${m.id === sel ? 'sel' : ''}" data-meal="${m.id}">${m.e} ${m.n.replace('Petit-déj', 'P-déj')}</button>`).join('')}</div>`; }
function bindMealSeg(root, st) { root.querySelectorAll('#mealSeg button').forEach(b => b.onclick = () => { st.meal = b.dataset.meal; root.querySelectorAll('#mealSeg button').forEach(x => x.classList.toggle('sel', x === b)); }); }
function thinking(root, img, msg) { root.querySelector('.sheet-body').innerHTML = `${img ? `<img class="thumb" src="${img}" alt="Photo du repas">` : ''}<div class="think"><span class="dots"><i></i><i></i><i></i></span>${msg || 'L\'IA regarde ça…'}</div>`; }

/* Erreurs communes des appels n8n. Renvoie true si l'erreur a été traitée. */
function handleAccessError(e) {
  if (!e || !e.code) return false;
  if (e.code === 401 || (e.code === 403 && (e.erreur === 'revoque' || e.erreur === 'refuse'))) { closeSheet(); showGate(); return true; }
  if (e.code === 429) { closeSheet(); toast(e.erreur === 'quota_global' ? 'Le service est très sollicité aujourd\'hui. Utilise la recherche d\'aliments, ça marche toujours.' : 'Tu as utilisé tes 20 analyses du jour. La recherche d\'aliments marche toujours 🙂', null, null, 5000); return true; }
  return false;
}

function openAdd(meal) {
  const st = { meal: meal || (U.day === today() ? mealByHour() : 'dej') };
  const y = addDays(U.day, -1);
  openSheet(addTitle(), `${addTabs('repas')}${mealSeg(st.meal)}
    <div class="ways">
      <button class="way" data-w="write"><em>✍️</em>Écrire</button>
      <button class="way" data-w="voice"><em>🎙️</em>Dicter</button>
      <button class="way" data-w="photo"><em>📷</em>Photo</button>
      <button class="way" data-w="scan"><em>▦</em>Code-barres</button>
    </div>
    <div class="field"><span class="label">Mes favoris</span><div class="chips">
      ${favsTries().slice(0, 12).map(f => `<button class="chip fav" data-fav="${f.id}">⭐ ${esc(f.name)}</button>`).join('')}
      <button class="chip" data-same>↺ Comme la veille</button></div>
      ${D.favs.length ? '' : '<p class="note">Touche l\'étoile ☆ à côté d\'un aliment pour le retrouver ici.</p>'}</div>
    <div class="field"><label class="label" for="q">Chercher un aliment (marche hors ligne)</label><input class="input" id="q" placeholder="ex. yaourt, pâtes, pomme…" autocomplete="off"><div class="search-list" id="ql"></div></div>
`, root => {
    bindMealSeg(root, st); bindAddTabs(root, st.meal);
    root.querySelectorAll('[data-w]').forEach(b => b.onclick = () => ({ write: () => openWrite(st.meal, false), voice: () => openWrite(st.meal, true), photo: () => openPhoto(st.meal), scan: () => openScan(st.meal) })[b.dataset.w]());
    root.querySelectorAll('[data-fav]').forEach(b => b.onclick = () => addFav(b.dataset.fav, st.meal));
    root.querySelector('[data-same]').onclick = () => { const l = D.entries.filter(e => e.date === y && e.meal === st.meal && !e.pending); if (!l.length) { toast('Rien de noté la veille pour ce repas'); return; } addEntries(l.map(e => ({ ...e, id: uid() })), st.meal, 'Comme la veille, c\'est noté ↺'); };
    const q = root.querySelector('#q'), ql = root.querySelector('#ql');
    q.oninput = () => {
      const v = norm(q.value.trim()); if (v.length < 2) { ql.innerHTML = ''; return; }
      const fh = favsTries().filter(f => norm(f.name).includes(v)).slice(0, 5);
      const hits = FOODS.filter(f => norm(f.n).includes(v) || f.keys.some(k => k.includes(v))).slice(0, 8 - Math.min(3, fh.length));
      ql.innerHTML = fh.map(f => `<button class="line" data-qf="${f.id}"><span class="grow"><span class="n">⭐ ${esc(f.name)}</span><span class="q">${esc(f.qty)} · favori</span></span><span class="kc num">${fmt(f.kcal)}</span></button>`).join('') + hits.map(f => `<button class="line" data-f="${f.id}"><span class="grow"><span class="n">${f.n}</span><span class="q">${f.pl} · ${fmt(f.kc)} kcal / 100 g</span></span><span class="kc num">${fmt(f.kc * f.pg / 100)}</span></button>`).join('') || '<p class="note">Pas trouvé. Essaie « Écrire » : l\'IA estimera.</p>';
      ql.querySelectorAll('[data-f]').forEach(b => b.onclick = () => openPortion(FOOD[b.dataset.f], st.meal, 'ciqual'));
      ql.querySelectorAll('[data-qf]').forEach(b => b.onclick = () => addFav(b.dataset.qf, st.meal));
    };
  });
}

function addTitle() { return U.day === today() ? 'Ajouter' : 'Ajouter · ' + dayLabel(U.day).toLowerCase(); }
function addTabs(sel) {
  return `<div class="seg kind" id="addTabs" role="tablist" aria-label="Que veux-tu ajouter ?">
    <button role="tab" class="${sel === 'repas' ? 'sel' : ''}" data-k="repas" aria-selected="${sel === 'repas'}">🍽️ Un repas</button>
    <button role="tab" class="${sel === 'act' ? 'sel act' : ''}" data-k="act" aria-selected="${sel === 'act'}">🔥 Une activité</button></div>`;
}
function bindAddTabs(root, meal) {
  root.querySelectorAll('#addTabs button').forEach(b => b.onclick = () => { if (b.classList.contains('sel')) return; if (b.dataset.k === 'act') openActivity(meal); else openAdd(meal); });
}
function favsTries() { return [...D.favs].sort((a, b) => (b.n || 0) - (a.n || 0) || a.name.localeCompare(b.name, 'fr')); }
function isFav(e) { const n = norm(e.name); return D.favs.some(f => norm(f.name) === n); }
function addFav(id, meal) {
  const f = D.favs.find(x => x.id === id); if (!f) return;
  f.n = (f.n || 0) + 1;
  addEntries([{ id: uid(), name: f.name, qty: f.qty, kcal: f.kcal, p: f.p, g: f.g, l: f.l, cat: f.cat, veg: f.veg, fruit: f.fruit, src: 'favori' }], meal, '⭐ ' + esc(f.name) + ' ajouté');
}

function openWrite(meal, voice) {
  const st = { meal };
  openSheet(voice ? 'Dicter' : 'Écrire', `${mealSeg(meal)}
    ${voice ? '<div class="card sage"><p class="note" style="color:var(--text)">🎙️ Touche le <b>micro de ton clavier</b> et dis ce que tu as mangé. Le texte s\'écrit tout seul.</p></div>' : ''}
    <div class="field"><label class="label" for="txt">Qu'as-tu mangé ?</label>
    <textarea class="input" id="txt" placeholder="ex. 2 œufs, une tartine beurre et un café&#10;ou : salade césar 450 kcal"></textarea>
    <p class="note">Si tu connais le nombre de calories, écris-le : c'est ta valeur qui compte.</p></div>
    <button class="primary" id="go">Analyser</button>`, root => {
    bindMealSeg(root, st); const t = root.querySelector('#txt'); setTimeout(() => t.focus(), 50);
    root.querySelector('#go').onclick = async () => {
      const v = t.value.trim(); if (!v) { t.focus(); return; }
      if (!navigator.onLine) { queuePending(v, 'texte', st.meal); return; }
      thinking(root);
      try { const j = await SKApi.appel('texte', { texte: v }); openResult(j.items || [], st.meal, 'Estimation de l\'IA'); }
      catch (e) { if (!handleAccessError(e)) queuePending(v, 'texte', st.meal); }
    };
  });
}

function resizeImage(file, max) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('image')); };
    img.src = url;
  });
}

function openPhoto(meal) {
  const st = { meal };
  openSheet('Photo du repas', `${mealSeg(meal)}
    <label class="primary" for="ph" style="display:flex;align-items:center;justify-content:center">📷 Prendre ou choisir une photo</label>
    <input type="file" id="ph" accept="image/*" capture="environment" hidden>
    <div class="field"><label class="label" for="leg">Une précision ? (facultatif)</label><input class="input" id="leg" placeholder="ex. sauce à la crème, demi-portion…"></div>
    <p class="note">La photo est réduite, envoyée pour l'analyse puis effacée. Elle n'est jamais gardée.</p>`, root => {
    bindMealSeg(root, st);
    root.querySelector('#ph').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      const leg = root.querySelector('#leg').value.trim();
      let img; try { img = await resizeImage(f, 1024); } catch (err) { toast('Impossible de lire cette photo'); return; }
      if (!navigator.onLine) { queuePending({ image: img, texte: leg }, 'photo', st.meal); return; }
      thinking(root, img);
      try { const j = await SKApi.appel('photo', { image: img, texte: leg }, 70000); openResult(j.items || [], st.meal, 'Vu sur la photo'); }
      catch (err) { if (!handleAccessError(err)) queuePending({ image: img, texte: leg }, 'photo', st.meal); }
    };
  });
}

let scanStream = null;
function stopScan() { if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; } }
function openScan(meal) {
  const st = { meal };
  const live = 'BarcodeDetector' in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
  openSheet('Code-barres', `${mealSeg(meal)}
    ${live ? '<video class="scan" id="cam" playsinline muted></video>' : '<p class="note">Sur ce téléphone, le scan par caméra arrive dans une prochaine version. Tape les chiffres sous le code-barres.</p>'}
    <div class="field"><label class="label" for="ean">${live ? 'Ou tape les chiffres' : 'Chiffres du code-barres'}</label><input class="input num" id="ean" inputmode="numeric" placeholder="ex. 3017620422003"></div>
    <button class="primary" id="go">Chercher le produit</button>
    <p class="note">Les infos produit viennent d'Open Food Facts.</p>`, async root => {
    bindMealSeg(root, st);
    const found = async ean => {
      stopScan();
      if (!navigator.onLine) { queuePending(ean, 'code', st.meal); return; }
      thinking(root, null, 'Recherche du produit…');
      try {
        const j = await SKApi.appel('code', { ean });
        if (!j.ok || !j.produit) { closeSheet(); toast('Produit inconnu d\'Open Food Facts. Essaie « Écrire » 🙂', null, null, 4500); return; }
        const p = j.produit;
        openPortion({ id: 'off', n: p.nom, kc: p.kcal100, p: p.p, g: p.g, l: p.l, pg: p.portion_g || 100, pl: (p.portion_g || 100) + ' g', cat: '' }, st.meal, 'scan', 'Open Food Facts');
      } catch (e) { if (!handleAccessError(e)) queuePending(ean, 'code', st.meal); }
    };
    root.querySelector('#go').onclick = () => { const v = root.querySelector('#ean').value.replace(/\D/g, ''); if (v.length >= 8) found(v); else toast('Il faut au moins 8 chiffres'); };
    if (live) {
      try {
        scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        const v = root.querySelector('#cam'); v.srcObject = scanStream; await v.play();
        const det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
        const tick = async () => {
          if (!scanStream || sheet.hidden) { stopScan(); return; }
          try { const r = await det.detect(v); if (r.length) { found(r[0].rawValue); return; } } catch (e) {}
          setTimeout(tick, 250);
        };
        tick();
      } catch (e) { const v = root.querySelector('#cam'); if (v) v.replaceWith(Object.assign(document.createElement('p'), { className: 'note', textContent: 'Caméra indisponible : tape les chiffres.' })); }
    }
  });
}

function openPortion(f, meal, src, origin) {
  stopScan();
  const st = { meal, g: f.pg };
  const kc = () => Math.round(f.kc * st.g / 100);
  openSheet(esc(f.n), `<span class="ai-badge">${origin || 'Base Ciqual'} · ${fmt(f.kc)} kcal / 100 g</span>
    ${mealSeg(meal)}
    <div class="field"><label class="label" for="gr">Quantité (g)</label>
      <div class="stepper"><button class="round" id="m" aria-label="Moins 10 g">−</button><input class="input num" id="gr" inputmode="decimal" value="${st.g}"><button class="round" id="p" aria-label="Plus 10 g">+</button></div>
      <p class="note">Portion type : ${esc(f.pl)}</p></div>
    <div class="total"><span>Total</span><span class="num" id="tot">${fmt(kc())} kcal</span></div>
    <button class="primary" id="ok">Ajouter</button>`, root => {
    bindMealSeg(root, st); const gr = root.querySelector('#gr'), tot = root.querySelector('#tot');
    const upd = () => { st.g = Math.max(0, parseFloat(gr.value.replace(',', '.')) || 0); tot.textContent = fmt(kc()) + ' kcal'; };
    gr.oninput = upd; root.querySelector('#m').onclick = () => { gr.value = Math.max(0, st.g - 10); upd(); }; root.querySelector('#p').onclick = () => { gr.value = st.g + 10; upd(); };
    root.querySelector('#ok').onclick = () => { const e = entryFrom(f, st.g / f.pg, st.meal, U.day, src); e.qty = Math.round(st.g) + ' g'; addEntries([e], st.meal, 'Ajouté 👍'); };
  });
}

function openResult(items, meal, title) {
  const st = { meal, items: items.map(a => entryFromApi(a, meal, U.day)) };
  if (!st.items.length) { closeSheet(); toast('L\'IA n\'a rien reconnu. Essaie de préciser 🙂'); return; }
  const draw = root => {
    const body = root.querySelector('#rows');
    body.innerHTML = st.items.map((e, i) => `<div class="res-row" data-i="${i}">
      <input class="input" aria-label="Aliment" data-k="name" value="${esc(e.name)}">
      <input class="input num" aria-label="Calories" data-k="kcal" inputmode="numeric" value="${e.kcal}">
      <button class="round" style="width:40px;height:42px;border-radius:12px" data-del aria-label="Retirer">✕</button>
      <span class="sub"><input class="input" aria-label="Portion" data-k="qty" value="${esc(e.qty)}" style="height:34px;font-size:.95em"></span></div>`).join('');
    const sum = () => root.querySelector('#rt').textContent = fmt(st.items.reduce((a, e) => a + (+e.kcal || 0), 0)) + ' kcal';
    body.querySelectorAll('input').forEach(inp => inp.oninput = () => {
      const e = st.items[inp.closest('[data-i]').dataset.i]; const k = inp.dataset.k;
      if (k === 'kcal') { const old = e.kcal || 1; const v = parseInt(inp.value) || 0; const r = v / old; e.p *= r; e.g *= r; e.l *= r; e.kcal = v; e.own = true; } else e[k] = inp.value;
      sum();
    });
    body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { st.items.splice(+b.closest('[data-i]').dataset.i, 1); draw(root); });
    sum();
  };
  openSheet(title, `<span class="ai-badge">✓ Vérifie les portions, tout se modifie</span>${mealSeg(meal)}
    <div class="res" id="rows"></div>
    <button class="link" id="addr" style="align-self:flex-start">+ Ajouter une ligne</button>
    <div class="total"><span>Total</span><span class="num" id="rt"></span></div>
    <button class="primary" id="val">Valider</button>`, root => {
    bindMealSeg(root, st); draw(root);
    root.querySelector('#addr').onclick = () => { st.items.push({ id: uid(), name: '', qty: '1 portion', kcal: 0, p: 0, g: 0, l: 0, cat: '', src: 'manuel' }); draw(root); root.querySelectorAll('[data-k="name"]')[st.items.length - 1].focus(); };
    root.querySelector('#val').onclick = () => { if (!st.items.length) { closeSheet(); return; } addEntries(st.items.map(e => ({ ...e, id: uid(), name: e.name || 'Aliment', kcal: +e.kcal || 0 })), st.meal, null); };
  });
}

function addEntries(list, meal, msg) {
  list.forEach(e => { e.date = U.day; e.meal = meal; enrich(e); D.entries.push(e); });
  save(); U.tab = 'today'; render(); closeSheet();
  toast(msg || pick(['C\'est noté 👍', 'Bien noté, continue comme ça ✨', 'Et un repas de plus dans le carnet 📒']));
}

/* ================== Hors ligne : saisies en attente ================== */
function queuePending(raw, kind, meal) {
  const label = kind === 'photo' ? 'Photo du repas' : kind === 'code' ? 'Produit ' + raw : raw;
  D.entries.push({ id: uid(), date: U.day, meal, name: label.length > 40 ? label.slice(0, 40) + '…' : label, qty: 'en attente de réseau', kcal: 0, p: 0, g: 0, l: 0, cat: '', pending: true, raw, kind });
  save(); closeSheet(); U.tab = 'today'; render(); toast('Pas de réseau : ce sera estimé au retour ⏳');
}
let resolving = false;
async function resolvePending() {
  if (resolving || !navigator.onLine || SKApi.statut() !== 'actif') return;
  const pend = D.entries.filter(e => e.pending); if (!pend.length) return;
  resolving = true; let n = 0;
  try {
    for (const p of pend) {
      let items;
      try {
        if (p.kind === 'texte') items = (await SKApi.appel('texte', { texte: p.raw })).items || [];
        else if (p.kind === 'photo') items = (await SKApi.appel('photo', p.raw, 70000)).items || [];
        else { const j = await SKApi.appel('code', { ean: p.raw }); items = j.ok && j.produit ? [{ nom: j.produit.nom, portion: (j.produit.portion_g || 100) + ' g', kcal: j.produit.kcal100 * (j.produit.portion_g || 100) / 100, p: j.produit.p, g: j.produit.g, l: j.produit.l }] : [{ nom: 'Produit ' + p.raw + ' (inconnu)', portion: '1 portion', kcal: 0 }]; }
      } catch (e) { if (handleAccessError(e) || e.code === 429 || e.code === 0) break; continue; }
      const i = D.entries.indexOf(p); if (i < 0) continue;
      D.entries.splice(i, 1, ...items.map(a => entryFromApi(a, p.meal, p.date))); n++; save();
    }
  } finally { resolving = false; }
  if (n) { render(); toast(`Réseau revenu : ${n} saisie${n > 1 ? 's' : ''} estimée${n > 1 ? 's' : ''}. Vérifie les quantités ✨`, null, null, 4500); }
}

function openEdit(eid) {
  const e = D.entries.find(x => x.id === eid); if (!e) return; const st = { meal: e.meal };
  openSheet('Modifier', `${mealSeg(e.meal)}
    <div class="field"><label class="label" for="en">Aliment</label><input class="input" id="en" value="${esc(e.name)}"></div>
    <div class="two"><div class="field"><label class="label" for="eq">Portion</label><input class="input" id="eq" value="${esc(e.qty)}"></div>
    <div class="field"><label class="label" for="ek">Calories</label><input class="input num" id="ek" inputmode="numeric" value="${e.pending ? '' : e.kcal}" placeholder="${e.pending ? 'à estimer' : ''}"></div></div>
    <button class="primary" id="sv">Enregistrer</button><button class="ghost danger" id="dl">Supprimer</button>`, root => {
    bindMealSeg(root, st);
    root.querySelector('#sv').onclick = () => {
      e.name = root.querySelector('#en').value || e.name; e.qty = root.querySelector('#eq').value;
      const k = root.querySelector('#ek').value;
      if (k !== '') { const v = parseInt(k) || 0; if (!e.pending && e.kcal) { const r = v / e.kcal; e.p *= r; e.g *= r; e.l *= r; } e.kcal = v; e.pending = false; delete e.raw; e.own = true; }
      if (e.mEst) { e.p = e.g = e.l = 0; } enrich(e);
      e.meal = st.meal; save(); closeSheet(); render(); toast('Modifié ✓');
    };
    root.querySelector('#dl').onclick = () => {
      const i = D.entries.indexOf(e); D.entries.splice(i, 1); save(); closeSheet(); render();
      toast('Supprimé', 'Annuler', () => { D.entries.splice(i, 0, e); save(); render(); }, 5000);
    };
  });
}

function openActivity(meal) {
  const w = currentKg(); const st = { s: 3, min: 30, watch: '' };
  const est = () => st.watch !== '' ? (parseInt(st.watch) || 0) : Math.round(SPORTS[st.s][2] * w * st.min / 60);
  openSheet(addTitle(), `${addTabs('act')}<p class="note">Une activité physique : les calories brûlées s'ajoutent à ton budget du jour.</p><div class="chips" id="sp">${SPORTS.map((s, i) => `<button class="chip ${i === st.s ? 'sel' : ''}" data-i="${i}">${s[0]} ${s[1]}</button>`).join('')}</div>
    <div class="field"><span class="label">Durée</span><div class="seg" id="du">${[15, 30, 45, 60, 90].map(m => `<button class="${m === st.min ? 'sel' : ''}" data-m="${m}">${m} min</button>`).join('')}</div></div>
    <div class="field"><label class="label" for="wt">Ou la valeur de ta montre (kcal)</label><input class="input num" id="wt" inputmode="numeric" placeholder="ex. 320"></div>
    <div class="total"><span>Calories brûlées</span><span class="num" id="es" style="color:var(--sage)"></span></div>
    <p class="note">Estimation hors ligne d'après ton poids et l'intensité de l'activité.</p>
    <button class="primary" id="ok" style="background:var(--sage)">Ajouter l'activité</button>`, root => {
    bindAddTabs(root, typeof meal === 'string' ? meal : undefined);
    const upd = () => root.querySelector('#es').textContent = '+' + fmt(est()) + ' kcal'; upd();
    root.querySelectorAll('#sp [data-i]').forEach(b => b.onclick = () => { st.s = +b.dataset.i; root.querySelectorAll('#sp .chip').forEach(x => x.classList.toggle('sel', x === b)); upd(); });
    root.querySelectorAll('#du [data-m]').forEach(b => b.onclick = () => { st.min = +b.dataset.m; root.querySelectorAll('#du button').forEach(x => x.classList.toggle('sel', x === b)); upd(); });
    root.querySelector('#wt').oninput = e => { st.watch = e.target.value.trim(); upd(); };
    root.querySelector('#ok').onclick = () => {
      const sp = SPORTS[st.s], montre = st.watch !== '';
      D.acts.push({ id: uid(), date: U.day, name: montre ? 'Montre connectée' : sp[1], e: montre ? '⌚' : sp[0], min: montre ? 0 : st.min, kcal: est() });
      save(); closeSheet(); U.tab = 'today'; render(); toast('Bravo, ça compte ! 🔥');
    };
  });
}

function openWeigh() {
  const st = { kg: currentKg() };
  openSheet('Me peser', `<p class="note">${longDate(today())}. Le matin, à jeun, c'est plus régulier.</p>
    <div class="stepper"><button class="round" id="m" aria-label="Moins 100 g">−</button><input class="input num" id="kg" inputmode="decimal" value="${fmt1(st.kg)}"><button class="round" id="p" aria-label="Plus 100 g">+</button></div>
    <button class="primary" id="ok">Enregistrer</button>`, root => {
    const kg = root.querySelector('#kg'); const set = v => { st.kg = Math.round(v * 10) / 10; kg.value = fmt1(st.kg); };
    kg.oninput = () => { st.kg = parseFloat(kg.value.replace(',', '.')) || st.kg; };
    root.querySelector('#m').onclick = () => set(st.kg - .1); root.querySelector('#p').onclick = () => set(st.kg + .1);
    root.querySelector('#ok').onclick = () => {
      if (st.kg < 30 || st.kg > 300) { toast('Ce poids semble incorrect'); return; }
      const prev = lastWeight(); const T = today();
      D.weights = D.weights.filter(w => w.date !== T); D.weights.push({ date: T, kg: st.kg }); D.profile.poids = st.kg;
      save(); closeSheet(); render();
      const d = prev ? st.kg - prev.kg : 0;
      toast(!prev ? 'Première pesée notée 🌱' : d < 0 ? `−${fmt1(-d)} kg, bien joué 🌱` : d === 0 ? 'Stable, c\'est une victoire aussi 🙂' : 'Noté. Une semaine ne fait pas une tendance 💛', null, null, 4000);
    };
  });
}

function openIdea() {
  if (!navigator.onLine) { toast('Les idées de repas ont besoin du réseau'); return; }
  openSheet('Une idée de repas', `<div class="think"><span class="dots"><i></i><i></i><i></i></span>L'IA cherche…</div>`, async root => {
    const g = goalInfo(), rest = Math.max(0, g.goal + burned(U.day) - eaten(U.day));
    const mange = dayEntries(U.day).filter(e => !e.pending).map(e => e.name).join(', ');
    try {
      const j = await SKApi.appel('idee', { reste: rest, mange, manque: missing(U.day), repas: MEAL[mealByHour()].n });
      if (sheet.hidden) return;
      root.querySelector('.sheet-body').innerHTML = `<span class="ai-badge">Selon ce qu'il te reste : ${fmt(rest)} kcal</span>
        ${(j.idees || []).map(x => `<div class="card"><p class="h3">${esc(x.titre)}</p><p class="note">≈ ${fmt(x.kcal)} kcal · ${esc(x.pourquoi)}</p></div>`).join('') || '<p class="note">Pas d\'idée cette fois, réessaie plus tard.</p>'}`;
    } catch (e) { if (!handleAccessError(e)) { closeSheet(); toast('Pas de réponse pour l\'instant, réessaie plus tard'); } }
  });
}

/* ================== Inscription / profil ================== */
function openOnboarding(edit) {
  const o = $('#onb'), YEAR = new Date().getFullYear();
  const p = Object.assign({ sexe: '', annee: YEAR - 35, taille: 170, poids: 75, vise: 70, act: 1, pace: 1 }, D.profile || {});
  const years = []; for (let y = YEAR - 16; y >= YEAR - 95; y--) years.push(y);
  o.innerHTML = `<div class="onb-in">
    <div class="hello">🌱</div><h1>${edit ? 'Mon profil' : 'Bienvenue'}</h1>
    <p class="intro">Quelques questions, sans jugement, pour calculer ton objectif. Tout reste sur ton téléphone.</p>
    <div class="field"><span class="label">Je suis</span><div class="seg" id="o-sx"><button data-v="F">Une femme</button><button data-v="H">Un homme</button></div></div>
    <div class="two">
      <div class="field"><label class="label" for="o-an">Année de naissance</label><select class="input" id="o-an">${years.map(y => `<option ${y === p.annee ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
      <div class="field"><label class="label" for="o-ta">Taille (cm)</label><input class="input num" id="o-ta" inputmode="numeric" value="${p.taille}"></div>
      <div class="field"><label class="label" for="o-po">Poids (kg)</label><input class="input num" id="o-po" inputmode="decimal" value="${fmt1(p.poids)}"></div>
      <div class="field"><label class="label" for="o-vi">Poids visé (kg)</label><input class="input num" id="o-vi" inputmode="decimal" value="${fmt1(p.vise)}"></div>
    </div>
    <p class="note" id="o-min" hidden></p>
    <div class="field"><span class="label">Mon activité</span><div class="opt-list" id="o-ac">${ACTIVITY.map((a, i) => `<button class="opt" data-v="${i}"><b>${a.n}</b><span>${a.d}</span></button>`).join('')}</div></div>
    <div class="field"><span class="label">Mon rythme</span><div class="seg" id="o-pa">${PACE.map((a, i) => `<button data-v="${i}">${a.n}</button>`).join('')}</div><p class="note" id="o-pas"></p></div>
    <p class="note">L'app est faite pour les 16 ans et plus. Elle ne remplace pas l'avis d'un médecin ou d'un diététicien.</p>
    <div class="preview"><div class="goalbox"><span class="label">Ton objectif</span><b class="num" id="o-goal"></b></div><p class="note" id="o-notes"></p>
      <p class="err" id="o-err"></p>
      <button class="primary" id="o-ok">${edit ? 'Enregistrer' : 'C\'est parti'}</button>${edit ? '<button class="link" id="o-cancel">Annuler</button>' : ''}</div>
  </div>`;
  o.hidden = false; o.scrollTop = 0;
  const num = v => parseFloat(String(v).replace(',', '.'));
  const seg = (sel, key, cast) => o.querySelectorAll(sel + ' button').forEach(b => { b.classList.toggle('sel', String(p[key]) === b.dataset.v); b.onclick = () => { p[key] = cast ? +b.dataset.v : b.dataset.v; upd(); }; });
  function upd() {
    p.annee = +o.querySelector('#o-an').value; p.taille = num(o.querySelector('#o-ta').value) || p.taille; p.poids = num(o.querySelector('#o-po').value) || p.poids;
    const viseIn = num(o.querySelector('#o-vi').value) || p.vise, mk = minKg(p.taille);
    p.vise = Math.max(viseIn, mk); const mn = o.querySelector('#o-min'); mn.hidden = viseIn >= mk;
    mn.textContent = `On vise au minimum ${fmt1(mk)} kg (IMC 18,5) pour rester en bonne santé : ton objectif est ajusté.`;
    seg('#o-sx', 'sexe'); seg('#o-pa', 'pace', 1);
    o.querySelectorAll('#o-ac .opt').forEach(b => { b.classList.toggle('sel', +b.dataset.v === p.act); b.onclick = () => { p.act = +b.dataset.v; upd(); }; });
    if (!p.sexe) { o.querySelector('#o-goal').textContent = '—'; o.querySelector('#o-pas').textContent = ''; o.querySelector('#o-notes').textContent = 'Choisis « Une femme » ou « Un homme » : la formule en dépend.'; return; }
    const g = goalInfo(p);
    o.querySelector('#o-pas').textContent = g.perWeek > 0 ? '≈ ' + fmt1(g.perWeek) + ' kg perdus par semaine (−' + fmt(g.deficit) + ' kcal / jour)' : 'Pas de déficit : on stabilise.';
    o.querySelector('#o-goal').textContent = fmt(g.goal) + ' kcal / jour'; o.querySelector('#o-notes').textContent = g.notes.join(' ');
  }
  o.querySelectorAll('input,select').forEach(i => i.addEventListener('input', upd)); upd();
  o.querySelector('#o-ok').onclick = () => {
    const err = o.querySelector('#o-err'); err.textContent = '';
    if (!p.sexe) { err.textContent = 'Indique si tu es une femme ou un homme.'; return; }
    if (p.taille < 120 || p.taille > 230) { err.textContent = 'Vérifie ta taille (en centimètres).'; return; }
    if (p.poids < 30 || p.poids > 300) { err.textContent = 'Vérifie ton poids (en kilos).'; return; }
    D.profile = p; const T = today(), lw = lastWeight();
    if (!lw || Math.abs(lw.kg - p.poids) > .05) { D.weights = D.weights.filter(w => w.date !== T); D.weights.push({ date: T, kg: p.poids }); }
    save(); o.hidden = true; render(); toast(edit ? 'Profil mis à jour 🎯' : 'Profil prêt, objectif calculé 🎯');
  };
  if (edit) o.querySelector('#o-cancel').onclick = () => { o.hidden = true; };
}

/* ================== Accès sur invitation ================== */
let gateTimer = null;
function gateHtml(icon, title, text, extra) {
  return `<div class="onb-in gate"><div class="big">${icon}</div><h1>${title}</h1><p class="intro">${text}</p>${extra || ''}</div>`;
}
function showGate(msg) {
  clearInterval(gateTimer);
  const o = $('#onb'), st = SKApi.statut();
  const exp = (D.entries.length || D.profile) ? '<button class="ghost" data-gate="export">Exporter mes données</button>' : '';
  o.hidden = false;
  if (st === 'attente') {
    o.innerHTML = gateHtml('⏳', 'Presque prêt', 'Ton téléphone attend la validation de l\'administrateur. Ça ne prend en général que quelques minutes.',
      `<div class="spin" aria-hidden="true"></div><button class="ghost" data-gate="check">Vérifier maintenant</button><p class="err">${esc(msg || '')}</p>`);
    gateTimer = setInterval(() => { if (document.visibilityState === 'visible') checkAccess(true); }, 15000);
  } else if (st === 'revoque' || st === 'refuse') {
    o.innerHTML = gateHtml('🔒', 'Accès fermé', st === 'refuse' ? 'Ce téléphone n\'a pas été validé. Demande une nouvelle invitation.' : 'L\'accès de ce téléphone a été retiré. Tes données sont toujours là : tu peux les exporter.', exp);
  } else if (st === 'utilisee') {
    o.innerHTML = gateHtml('✋', 'Invitation déjà utilisée', 'Chaque invitation ne fonctionne que sur un seul téléphone. Demande ta propre invitation.', '');
  } else {
    o.innerHTML = gateHtml('🎟️', 'SuiviKcal est sur invitation', st === 'invalide' ? 'Ce lien d\'invitation n\'est pas (ou plus) valable. Demande-en un nouveau.' : 'Ouvre ton lien d\'invitation sur ce téléphone, ou colle-le ci-dessous.',
      `<div class="field" style="text-align:left"><label class="label" for="g-lien">Lien d'invitation</label><input class="input" id="g-lien" placeholder="Colle le lien ici" autocomplete="off"></div>
      <button class="primary" data-gate="lien">Valider le lien</button><p class="err">${esc(msg || '')}</p>`);
  }
  o.onclick = e => {
    const b = e.target.closest('[data-gate]'); if (!b) return;
    if (b.dataset.gate === 'check') checkAccess(false);
    else if (b.dataset.gate === 'export') exportData();
    else if (b.dataset.gate === 'lien') { const l = SKApi.lireLien(o.querySelector('#g-lien').value); if (l && l.serveur) startAccess(l); else showGate('Ce n\'est pas un lien d\'invitation SuiviKcal complet.'); }
  };
}
function enterApp() {
  clearInterval(gateTimer);
  const o = $('#onb'); o.hidden = true; o.onclick = null;
  if (!D.profile) openOnboarding(false); else render();
  resolvePending();
}
async function checkAccess(quiet) {
  try {
    const j = await SKApi.activer(null, !quiet);
    if (j.ok && j.statut === 'actif') { toast('C\'est validé, bienvenue 🎉'); enterApp(); }
    else if (!quiet) showGate('Pas encore validé. On revérifie toutes les 15 secondes.');
  } catch (e) { if (e.code) showGate(); else if (!quiet) showGate('Pas de réseau pour l\'instant.'); }
}
/* iPhone : Safari et l'app installée n'ont pas la même mémoire. On installe d'abord, puis on colle le lien dans l'app. */
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const STANDALONE = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
function showIosInstall(lien) {
  const o = $('#onb'); o.hidden = false;
  o.innerHTML = gateHtml('📲', 'D\'abord, installe l\'app', 'Sur iPhone, l\'invitation doit être ouverte depuis l\'app installée.',
    `<div class="card" style="text-align:left"><p class="note" style="color:var(--text)"><b>1.</b> Copie ton lien d'invitation avec le bouton ci-dessous.<br><b>2.</b> Touche <b>Partager</b> puis <b>Sur l'écran d'accueil</b>.<br><b>3.</b> Ouvre SuiviKcal depuis l'écran d'accueil et colle le lien.</p></div>
    <button class="primary" data-ios="copy">Copier mon lien d'invitation</button>`);
  o.onclick = e => { if (!e.target.closest('[data-ios]')) return;
    (navigator.clipboard ? navigator.clipboard.writeText(lien) : Promise.reject()).then(() => toast('Lien copié ✓'), () => toast('Copie impossible : garde le message qui contient le lien')); };
}
async function startAccess(lien) {
  $('#onb').hidden = false;
  $('#onb').innerHTML = gateHtml('🎟️', 'Connexion…', 'Vérification de ton invitation.', '<div class="spin" aria-hidden="true"></div>');
  try {
    const j = await SKApi.activer(lien);
    if (j.ok && j.statut === 'actif') enterApp(); else showGate();
  } catch (e) { showGate(e.code ? '' : 'Pas de réseau : reconnecte-toi puis rouvre le lien.'); }
}

/* ================== Sauvegarde ================== */
async function exportData() {
  const name = 'suivikcal-' + (ENV === 'prod' ? '' : ENV + '-') + today() + '.json';
  const blob = new Blob([JSON.stringify(Object.assign({ app: 'SuiviKcal', version: VERSION, exporte: new Date().toISOString() }, D), null, 1)], { type: 'application/json' });
  try {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Sauvegarde SuiviKcal' }); }
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
    D.lastBackup = today(); save(); if (U.tab === 'profile') render(); toast('Sauvegarde prête 💾');
  } catch (e) { if (e && e.name !== 'AbortError') toast('Export impossible sur ce téléphone'); }
}
$('#importFile').onchange = e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    let j; try { j = JSON.parse(r.result); } catch (err) { toast('Ce fichier n\'est pas une sauvegarde SuiviKcal'); return; }
    if (!j || j.app !== 'SuiviKcal' || !Array.isArray(j.entries)) { toast('Ce fichier n\'est pas une sauvegarde SuiviKcal'); return; }
    openSheet('Importer la sauvegarde', `<p class="note">Sauvegarde du ${esc(String(j.exporte || '').slice(0, 10))} : ${j.entries.length} aliments notés, ${(j.weights || []).length} pesées.</p>
      <p class="note"><b>Elle remplace toutes les données actuelles de ce téléphone.</b></p>
      <button class="primary" id="ok">Remplacer mes données</button><button class="ghost" data-close>Annuler</button>`, root => {
      root.querySelector('#ok').onclick = () => {
        const keep = D.reglages; D = Object.assign(VIDE(), j); delete D.app; delete D.version; delete D.exporte; D.reglages = keep;
        save(); closeSheet(); render(); toast('Données importées ✓');
      };
    });
  };
  r.readAsText(f);
};

/* ================== Actions ================== */
const ACT = {
  add: el => openAdd(el.dataset.meal), edit: el => openEdit(el.dataset.id), addAct: openActivity, weigh: openWeigh, idea: openIdea,
  dayPrev: () => { U.day = addDays(U.day, -1); render(); }, dayNext: () => { if (U.day < today()) { U.day = addDays(U.day, 1); render(); } },
  goDay: el => { U.day = el.dataset.d; U.tab = 'today'; render(); main.scrollTop = 0; },
  weighLater: () => { U.weighLater = true; render(); }, goWeek: () => { U.tab = 'week'; U.weekOff = 0; render(); main.scrollTop = 0; },
  delAct: el => { const a = D.acts.find(x => x.id === el.dataset.id); const i = D.acts.indexOf(a); D.acts.splice(i, 1); save(); render(); toast('Activité retirée', 'Annuler', () => { D.acts.splice(i, 0, a); save(); render(); }, 5000); },
  delWeight: el => {
    const w = D.weights.find(x => x.date === el.dataset.d); if (!w) return;
    openSheet('Pesée du ' + shortDate(w.date), `<p class="note">${fmt1(w.kg)} kg</p><button class="ghost danger" id="dl">Supprimer cette pesée</button>`, root => {
      root.querySelector('#dl').onclick = () => { D.weights = D.weights.filter(x => x !== w); save(); closeSheet(); render(); toast('Pesée supprimée', 'Annuler', () => { D.weights.push(w); save(); render(); }, 5000); };
    });
  },
  favItem: el => {
    const e = D.entries.find(x => x.id === el.dataset.id); if (!e) return;
    const n = norm(e.name), f = D.favs.find(x => norm(x.name) === n);
    if (f) { D.favs = D.favs.filter(x => x !== f); save(); render(); toast('Retiré des favoris', 'Annuler', () => { D.favs.push(f); save(); render(); }, 5000); return; }
    D.favs.push({ id: uid(), name: e.name, qty: e.qty, kcal: e.kcal, p: e.p, g: e.g, l: e.l, cat: e.cat || '', veg: hasVegE(e), fruit: hasFruitE(e), n: 1 });
    save(); render(); toast('⭐ ' + esc(e.name) + ' est dans tes favoris');
  },
  renFav: el => {
    const f = D.favs.find(x => x.id === el.dataset.id); if (!f) return;
    openSheet('Renommer', `<input class="input" id="nm" value="${esc(f.name)}" maxlength="40"><button class="primary" id="ok">Enregistrer</button>`, root => {
      root.querySelector('#ok').onclick = () => { f.name = root.querySelector('#nm').value.trim() || f.name; save(); closeSheet(); render(); };
    });
  },
  delFav: el => { D.favs = D.favs.filter(f => f.id !== el.dataset.id); save(); render(); },
  wk: el => { U.weekOff += +el.dataset.d; render(); }, wr: el => { U.wRange = el.dataset.r; render(); },
  feel: el => { D.feels[U.day] = el.dataset.f; save(); render(); toast(pick(PHRASES[el.dataset.f]), null, null, 4000); },
  feelReset: () => { delete D.feels[U.day]; save(); render(); },
  theme: el => { D.reglages.theme = el.dataset.v; save(); applyLook(); render(); },
  fs: el => { D.reglages.fs = +el.dataset.v; save(); applyLook(); render(); },
  export: exportData, import: () => $('#importFile').click(),
  editProfile: () => openOnboarding(true), upd: () => checkUpdate($('#updInfo'))
};
main.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (el && !el.disabled && ACT[el.dataset.act]) ACT[el.dataset.act](el); });
document.querySelectorAll('.tabs [data-tab]').forEach(b => b.onclick = () => { U.tab = b.dataset.tab; if (U.tab === 'today') U.day = today(); closeSheet(); render(); main.scrollTop = 0; });
$('#fab').onclick = () => openAdd();

function applyLook() {
  const r = document.documentElement, t = D.reglages.theme;
  if (t === 'light' || t === 'dark') r.dataset.theme = t; else delete r.dataset.theme;
  r.dataset.fs = String(D.reglages.fs);
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.content = dark ? '#1C1716' : '#FFF8F3');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyLook);

/* ================== Réseau, hors ligne et mises à jour ================== */
addEventListener('online', () => { render(); resolvePending(); });
addEventListener('offline', render);
let swReg = null, reloadPending = false;
function applyUpdate() { if (!sheet.hidden) { reloadPending = true; return; } location.reload(); }
async function checkUpdate(out) {
  if (!swReg) { if (out) out.textContent = 'Mises à jour indisponibles ici.'; return; }
  if (out) out.textContent = 'Recherche…';
  try { await swReg.update(); } catch (e) { if (out) out.textContent = 'Pas de réseau. SuiviKcal v' + VERSION; return; }
  setTimeout(() => { if (out && !swReg.installing && !swReg.waiting) out.textContent = 'SuiviKcal v' + VERSION + ' est à jour.'; }, 1500);
}
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => { swReg = r; }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) applyUpdate(); });
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (swReg) swReg.update().catch(() => {});
  if (U.day > today()) U.day = today();
  resolvePending();
});
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}

/* ================== Démarrage ================== */
if (ENV !== 'prod') { const t = $('#envTag'); t.textContent = ENV.toUpperCase(); t.hidden = false; t.classList.add('env-' + ENV); }
applyLook();
if (D.lastV && D.lastV !== VERSION) setTimeout(() => toast('SuiviKcal mis à jour (v' + VERSION + ')'), 600);
D.lastV = VERSION; save();
function invitFromHash() {
  const brut = location.href, l = SKApi.lireLien(location.hash);
  if (!l) return false;
  history.replaceState(null, '', location.pathname);   // le lien ne reste pas dans l'adresse
  if (IOS && !STANDALONE) showIosInstall(brut); else startAccess(l);
  return true;
}
addEventListener('hashchange', () => { if (SKApi.statut() !== 'actif') invitFromHash(); });
(function start() {
  if (invitFromHash()) return;
  if (SKApi.statut() === 'actif') {
    enterApp();
    if (navigator.onLine) SKApi.appel('etat').catch(e => handleAccessError(e));   // vérifie que l'accès n'a pas été retiré
    return;
  }
  showGate();
  if (SKApi.statut() === 'attente') checkAccess(true);
})();
