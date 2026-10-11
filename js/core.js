'use strict';
const API = window.API_BASE;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { user: null, token: (() => { try { return localStorage.getItem('te_token'); } catch { return null; } })() };
const STATUT = { nouveau: 'Nouveau', enregistre: 'Présélectionné', entretien: 'Entretien', test: 'Test', accepte: 'Accepté', rejete: 'Rejeté' };
const TIER = { priority: 'PRIORITAIRE', review: 'À REVOIR', low: 'FAIBLE' };
const CRIT = { skills: 'Compétences & stack', experience: 'Expérience pertinente', education: 'Formation & diplômes', availability: 'Disponibilité & préavis', completeness: 'Complétude du dossier' };

async function api(path, { method = 'GET', body, form, blob } = {}) {
  const headers = {}; let payload;
  if (S.token) headers.Authorization = 'Bearer ' + S.token;
  if (form) payload = form; else if (body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res;
  try { res = await fetch(API + path, { method, headers, body: payload }); }
  catch { throw { message: 'Serveur injoignable. Vérifiez que l\'API est démarrée.', errors: {} }; }
  if (blob) { if (!res.ok) throw { message: 'Accès refusé ou fichier introuvable.', errors: {} }; return res.blob(); }
  let j; try { j = await res.json(); } catch { throw { message: 'Réponse invalide du serveur.', errors: {} }; }
  if (res.status === 401 && S.token) { clearSession(); location.hash = '#/login'; }
  if (!j.success) throw { message: j.message, errors: j.errors || {}, status: res.status };
  return j.data;
}
function setSession(token, user) { S.token = token; S.user = user; try { localStorage.setItem('te_token', token); } catch {} }
function clearSession() { S.token = null; S.user = null; try { localStorage.removeItem('te_token'); } catch {} }
async function ensureUser() {
  if (S.user) return true;
  if (!S.token) return false;
  try { S.user = await api('/auth/me'); return true; } catch { return false; }
}
function toast(msg, err = false) {
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' e' : ''); t.textContent = msg;
  $('#toasts').append(t); setTimeout(() => t.remove(), 3800);
}
const fmtDate = d => d ? new Date(d.replace(' ', 'T')).toLocaleDateString('fr-FR') : '';
function ago(d) {
  const s = Math.max(1, (Date.now() - new Date(d.replace(' ', 'T')).getTime()) / 1000);
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`; if (s < 86400) return `il y a ${Math.round(s / 3600)} h`; return `il y a ${Math.round(s / 86400)} j`;
}
const initials = u => ((u.prenom?.[0] || '') + (u.nom?.[0] || '')).toUpperCase();
const fieldErr = (errors, k) => errors?.[k] ? `<div class="err">${esc(errors[k])}</div>` : '';
const scoreBadge = (s, tier) => s == null ? '<span class="muted">—</span>' : `<span class="score ${tier || ''}">${s} <small>${TIER[tier] || ''}</small></span>`;
const statutBadge = s => `<span class="badge ${s}">${esc(STATUT[s] || s)}</span>`;
const debounce = (fn, ms = 350) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
function modal(html) {
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
  document.body.append(bg); return bg;
}

/* ---------- Layouts ---------- */
function publicLayout(inner) {
  const u = S.user;
  $('#app').innerHTML = `<div class="pub">
    <nav class="pubnav"><a class="brand" href="#/" style="text-decoration:none"><div class="logo">TE</div><div><b>Talent Engine</b><span>Recrutement</span></div></a>
      <span class="right"></span>
      ${u ? '<a class="btn" href="#/app/dashboard">Mon espace</a>' : '<a class="btn" href="#/login">Espace recruteur</a>'}</nav>
    <main id="content">${inner}</main>
    <p class="muted small center">Les analyses de CV par IA sont des aides : aucune décision de recrutement n'est prise automatiquement.</p></div>`;
}
function privateLayout(active, title, inner = '<div class="center"><span class="spinner"></span></div>', actions = '') {
  const u = S.user;
  const nav = [['dashboard', 'Tableau de bord'], ['ranking', 'Classement candidats'], ['postes', 'Offres d\'emploi'], ['rules', 'Règles de scoring']];
  if (u.role === 'admin') nav.push(['team', 'Équipe & sécurité']);
  $('#app').innerHTML = `<div class="shell"><aside class="side">
    <a class="brand" href="#/app/dashboard" style="text-decoration:none"><div class="logo">TE</div><div><b>Talent Engine</b><span>Screening Cockpit</span></div></a>
    <nav class="nav" aria-label="Navigation">${nav.map(([k, l]) => `<a href="#/app/${k}" class="${k === active ? 'on' : ''}">${l}</a>`).join('')}</nav>
    <div class="bottom"><a href="#/">Site public</a><button id="logout">Déconnexion</button></div></aside>
    <section class="main"><div class="topbar"><h1 class="page-title">${esc(title)}</h1><div class="row">${actions}</div>
      <div class="who"><div class="avatar">${esc(initials(u))}</div><div><b>${esc(u.prenom)} ${esc(u.nom)}</b><div class="muted small">${u.role === 'admin' ? 'Administrateur' : 'Recruteur'}</div></div></div></div>
      <div id="content">${inner}</div></section></div>`;
  $('#logout').onclick = async () => { try { await api('/auth/logout', { method: 'POST' }); } catch {} clearSession(); location.hash = '#/login'; };
}

/* ---------- Routeur ---------- */
const routes = [];
const route = (re, fn, o = {}) => routes.push({ re, fn, ...o });
async function router() {
  const h = location.hash.slice(1) || '/';
  for (const r of routes) {
    const m = h.match(r.re); if (!m) continue;
    if (r.auth) {
      if (!await ensureUser()) { location.hash = '#/login'; return; }
      if (r.roles && !r.roles.includes(S.user.role)) { location.hash = '#/app/dashboard'; return; }
    } else await ensureUser();
    try { await r.fn(...m.slice(1)); }
    catch (e) { const c = $('#content'); if (c) c.innerHTML = `<div class="card center"><h3>Une erreur est survenue</h3><p class="muted">${esc(e.message || 'Erreur inconnue')}</p><a class="btn" href="#/">Retour</a></div>`; }
    window.scrollTo(0, 0); return;
  }
  publicLayout('<div class="card center"><h3>Page introuvable</h3><a class="btn" href="#/">Accueil</a></div>');
}
window.addEventListener('hashchange', router);
