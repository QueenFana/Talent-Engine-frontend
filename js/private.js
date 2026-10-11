'use strict';
const AUTH = { auth: true };

async function setStatut(ids, statut, comment) {
  if (statut === 'rejete' && !confirm(`Rejeter ${ids.length} candidature(s) ? Cette décision est la vôtre : le score n'est qu'une aide.`)) return false;
  const res = await Promise.allSettled(ids.map(id => api(`/candidatures/${id}/statut`, { method: 'PATCH', body: { statut, commentaire: comment || '' } })));
  const ko = res.filter(r => r.status === 'rejected').length;
  toast(ko ? `${ko} échec(s) sur ${ids.length}.` : `${ids.length} candidature(s) → ${STATUT[statut]}`, !!ko); return true;
}

/* ================= Tableau de bord ================= */
route(/^\/app\/dashboard$/, async () => {
  privateLayout('dashboard', 'Tableau de bord');
  const d = await api('/recruteur/dashboard'); const s = d.stats, t = d.regles.tiers;
  const delta = d.semaine.precedente ? Math.round((d.semaine.courante - d.semaine.precedente) / d.semaine.precedente * 100) : null;
  const lab = ['< 40', '40–49', '50–59', '60–69', '70–79', '80–89', '90–100'], starts = [0, 40, 50, 60, 70, 80, 90], max = Math.max(1, ...d.distribution);
  const col = st => st >= t.priority ? '#16a34a' : st >= t.review ? '#fdba74' : '#93c5fd';
  const verb = ico => ({ nouvelle: 'Nouvelle candidature', statut: 'Action recruteur' }[ico]);
  $('#content').innerHTML = `<div class="grid g4">
    <div class="card stat"><div class="l">Candidatures</div><div class="v">${s.total}</div><div class="muted small">${d.semaine.courante} cette semaine${delta !== null ? ` (${delta >= 0 ? '+' : ''}${delta}% vs sem. préc.)` : ''}</div></div>
    <div class="card stat p"><div class="l">Prioritaires (≥ ${t.priority})</div><div class="v">${s.priority}</div><div class="muted small">Prêts pour un entretien</div></div>
    <div class="card stat r"><div class="l">À revoir (${t.review}–${t.priority - 1})</div><div class="v">${s.review}</div><div class="muted small">Examen manuel requis</div></div>
    <div class="card stat b"><div class="l">Score moyen</div><div class="v">${s.avg_score}<small class="muted"> /100</small></div><div class="muted small">${d.postes_actifs} offre(s) active(s)</div></div></div>
  <div class="grid g21" style="margin-top:16px"><div class="card"><h3>Distribution des scores</h3><p class="muted small">Seuils : priorité ≥ ${t.priority} · revue ≥ ${t.review}</p>
    <div class="dist">${d.distribution.map((n, i) => `<div><span>${n}</span><b style="height:${Math.round(n / max * 140)}px;background:${col(starts[i])}"></b><span class="muted">${lab[i]}</span></div>`).join('')}</div></div>
    <div class="card feed"><h3>Activité récente</h3>${d.activite.map(a => `<a class="it" style="display:block;text-decoration:none;color:inherit" href="#/app/candidat/${a.candidature_id}"><div class="row small"><b>${verb(a.type)}</b><span class="right muted">${ago(a.at)}</span></div>
      ${a.type === 'nouvelle' ? `${esc(a.qui)} · ${esc(a.detail)}${a.score != null ? ` · score ${a.score}` : ''}` : `${esc(a.auteur || '')} → ${esc(STATUT[a.detail] || a.detail)} : ${esc(a.qui)}`}</a>`).join('') || '<p class="muted">Rien pour l\'instant.</p>'}</div></div>
  <div class="card" style="margin-top:16px"><div class="row"><h3>Top 5 candidats</h3><a class="btn sm right" href="#/app/ranking">Classement complet →</a></div><div class="tw"><table><thead><tr><th>#</th><th>Candidat</th><th>Score</th><th>Expérience</th><th>Statut</th><th></th></tr></thead><tbody>
    ${d.top.map((c, i) => `<tr><td><span class="rank">${i + 1}</span></td><td><b>${esc(c.prenom)} ${esc(c.nom)}</b><div class="muted small">${esc(c.poste_titre)}</div></td><td>${scoreBadge(c.score, c.score >= t.priority ? 'priority' : c.score >= t.review ? 'review' : 'low')}</td>
      <td>${+c.annees_experience} ans</td><td>${statutBadge(c.statut)}</td><td class="row"><a class="btn sm" href="#/app/candidat/${c.id}">Voir</a><button class="btn sm primary" data-sl="${c.id}" ${c.statut !== 'nouveau' ? 'disabled' : ''}>Présélectionner</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Aucune candidature.</td></tr>'}</tbody></table></div></div>`;
  $$('[data-sl]').forEach(b => b.onclick = async () => { if (await setStatut([b.dataset.sl], 'enregistre')) router(); });
});

/* ================= Classement ================= */
const R = { page: 1, sel: new Set(), f: { q: '', poste_id: '', tier: '', statut: '', min_exp: '', sort: 'score' }, per: 10 };
route(/^\/app\/ranking$/, async () => {
  privateLayout('ranking', 'Classement des candidats', '<div class="center"><span class="spinner"></span></div>', '<button class="btn" id="csv">Exporter CSV</button>');
  const postes = await api('/recruteur/postes');
  $('#content').innerHTML = `<div id="tiers" class="grid g4" style="margin-bottom:16px"></div>
    <div class="card" style="margin-bottom:16px"><div class="filters">
      <input id="fq" type="text" placeholder="Nom, e-mail, compétence…" aria-label="Recherche" value="${esc(R.f.q)}">
      <select id="fp" aria-label="Offre"><option value="">Toutes les offres</option>${postes.map(p => `<option value="${p.id}">${esc(p.titre)}</option>`).join('')}</select>
      <select id="ft" aria-label="Tier"><option value="">Tous les tiers</option><option value="priority">Prioritaire</option><option value="review">À revoir</option><option value="low">Faible</option></select>
      <select id="fs" aria-label="Statut"><option value="">Tous statuts</option>${Object.entries(STATUT).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <select id="fe" aria-label="Expérience"><option value="">Toute expérience</option><option value="3">3+ ans</option><option value="5">5+ ans</option><option value="8">8+ ans</option></select></div>
      <div class="row" style="margin-top:10px"><span class="muted small">Tri :</span><select id="fo" style="width:auto"><option value="score">Meilleur score</option><option value="date">Plus récent</option><option value="nom">Nom</option></select></div></div>
    <div class="card"><div class="tw" id="tbl"></div><div class="pager" id="pager"></div></div><div id="bulk"></div>`;
  $('#fp').value = R.f.poste_id; $('#ft').value = R.f.tier; $('#fs').value = R.f.statut; $('#fe').value = R.f.min_exp; $('#fo').value = R.f.sort;
  const sync = () => { R.f = { q: $('#fq').value, poste_id: $('#fp').value, tier: $('#ft').value, statut: $('#fs').value, min_exp: $('#fe').value, sort: $('#fo').value }; R.page = 1; R.sel.clear(); load(); };
  $('#fq').oninput = debounce(sync); ['fp', 'ft', 'fs', 'fe', 'fo'].forEach(i => $('#' + i).onchange = sync);
  const qs = (extra = {}) => new URLSearchParams(Object.fromEntries(Object.entries({ ...R.f, page: R.page, per_page: R.per, ...extra }).filter(([, v]) => v !== '')));
  async function load() {
    const d = await api('/recruteur/candidatures?' + qs()); const st = d.stats;
    $('#tiers').innerHTML = [['Prioritaire', st.priority, 'p'], ['À revoir', st.review, 'r'], ['Faible', st.low, 'b'], ['Total classé', st.total, '']].map(([l, v, c]) => `<div class="card stat ${c}"><div class="l">${l}</div><div class="v">${v}</div></div>`).join('');
    $('#tbl').innerHTML = `<table><thead><tr><th><input type="checkbox" id="all" aria-label="Tout sélectionner"></th><th>Rang</th><th>Candidat</th><th>Poste</th><th>Score</th><th>Points clés</th><th>Statut</th></tr></thead><tbody>
      ${d.items.map(c => `<tr class="click ${R.sel.has(c.id) ? 'sel' : ''}" data-id="${c.id}"><td><input type="checkbox" class="ck" data-id="${c.id}" ${R.sel.has(c.id) ? 'checked' : ''} aria-label="Sélectionner"></td>
        <td><span class="rank ${c.rang > 3 ? 'o' : ''}">${c.rang}</span></td><td><b>${esc(c.prenom)} ${esc(c.nom)}</b><div class="muted small">${esc(c.email)}<br>${esc(c.addresse || '')}</div></td><td>${esc(c.poste_titre)}</td>
        <td>${scoreBadge(c.score, c.tier)}</td><td>${c.competences.map(k => `<span class="chip ${k.match ? 'm' : ''}">${esc(k.nom)}</span>`).join('')}<span class="chip">${+c.annees_experience} ans</span></td><td>${statutBadge(c.statut)}</td></tr>`).join('') || '<tr><td colspan="7" class="center muted">Aucun résultat.</td></tr>'}</tbody></table>`;
    const pages = Math.max(1, Math.ceil(d.total / d.per_page));
    $('#pager').innerHTML = `<span class="muted">${d.items.length ? (d.page - 1) * d.per_page + 1 : 0}–${(d.page - 1) * d.per_page + d.items.length} sur ${d.total}</span><span class="row"><button class="btn sm" id="pp" ${d.page <= 1 ? 'disabled' : ''}>←</button><span>Page ${d.page}/${pages}</span><button class="btn sm" id="pn" ${d.page >= pages ? 'disabled' : ''}>→</button></span>`;
    $('#pp').onclick = () => { R.page--; load(); }; $('#pn').onclick = () => { R.page++; load(); };
    $$('#tbl tr.click').forEach(tr => tr.onclick = e => { if (e.target.classList.contains('ck')) return; location.hash = '#/app/candidat/' + tr.dataset.id; });
    $$('.ck').forEach(c => c.onchange = () => { c.checked ? R.sel.add(+c.dataset.id) : R.sel.delete(+c.dataset.id); c.closest('tr').classList.toggle('sel', c.checked); bulk(); });
    $('#all').onchange = e => { $$('.ck').forEach(c => { c.checked = e.target.checked; e.target.checked ? R.sel.add(+c.dataset.id) : R.sel.delete(+c.dataset.id); c.closest('tr').classList.toggle('sel', c.checked); }); bulk(); };
    bulk();
  }
  function bulk() {
    const n = R.sel.size; $('#bulk').innerHTML = n ? `<div class="bulk"><b>${n} sélectionné(s)</b><button class="btn primary" id="b1">Présélectionner</button><button class="btn" id="b2">Planifier entretien</button><button class="btn" id="b3">Rejeter…</button><button class="btn" id="b4" aria-label="Fermer">✕</button></div>` : '';
    if (!n) return; const run = async s => { if (await setStatut([...R.sel], s)) { R.sel.clear(); load(); } };
    $('#b1').onclick = () => run('enregistre'); $('#b2').onclick = () => run('entretien'); $('#b3').onclick = () => run('rejete'); $('#b4').onclick = () => { R.sel.clear(); load(); };
  }
  $('#csv').onclick = async () => {
    const d = await api('/recruteur/candidatures?' + qs({ page: 1, per_page: 200 }));
    const cell = v => { v = String(v ?? ''); if (/^[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
    const csv = ['Rang;Prénom;Nom;E-mail;Poste;Score;Tier;Statut;Expérience'].concat(d.items.map(c => [c.rang, c.prenom, c.nom, c.email, c.poste_titre, c.score, c.tier, STATUT[c.statut], c.annees_experience].map(cell).join(';'))).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' })); a.download = 'classement.csv'; a.click(); URL.revokeObjectURL(a.href);
  };
  await load();
}, AUTH);

/* ================= Détail candidat ================= */
route(/^\/app\/candidat\/(\d+)$/, async id => {
  privateLayout('ranking', 'Dossier candidat');
  const c = await api('/candidatures/' + id), k = c.candidat, d = c.detail || { criteria: {}, knockouts: [] };
  const tags = ['Fort potentiel', 'Bonne communication', 'Urgent'];
  $('#content').innerHTML = `<div class="card row" style="margin-bottom:16px"><a class="btn" href="#/app/ranking">← Retour</a><span class="muted">${esc(c.poste.titre)} / <b>${esc(k.prenom)} ${esc(k.nom)}</b> (score ${c.score ?? '—'})</span>
      ${c.rang ? `<span class="badge">Rang #${c.rang}/${c.total_poste}</span>` : ''}<span class="right row"><select id="st" aria-label="Statut">${Object.entries(STATUT).map(([v, l]) => `<option value="${v}" ${v === c.statut ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button class="btn danger" id="rej">Rejeter</button><button class="btn primary" id="sl">Présélectionner</button></span></div>
    <div class="grid g21"><div class="grid" style="align-content:start">
      <div class="card"><div class="row"><h2>${esc(k.prenom)} ${esc(k.nom)}</h2>${statutBadge(c.statut)}</div><p class="muted">${esc(k.addresse || '')} · candidature du ${fmtDate(c.applied_at)} · préavis ${c.disponibilite_jours} j</p>
        <p><span class="chip">✉ ${esc(k.email)}</span>${k.tel ? `<span class="chip">☎ ${esc(k.tel)}</span>` : ''}${['linkedin', 'github', 'portfolio'].filter(x => k[x]).map(x => `<a class="chip" target="_blank" rel="noopener noreferrer" href="${esc(k[x])}">${x}</a>`).join('')}</p>
        ${k.has_cv == 1 ? `<button class="btn" id="cv">📄 Ouvrir le CV (${esc(k.cv_original || 'cv.pdf')})</button>` : '<span class="badge low">Aucun CV</span>'}
        ${c.lettre_motivation ? `<h4 style="margin-top:14px">Lettre de motivation</h4><p style="white-space:pre-wrap">${esc(c.lettre_motivation)}</p>` : ''}</div>
      <div class="grid g2"><div class="card"><h3>Expérience (${+k.annees_experience} ans)</h3>${c.experiences.map(e => `<p><b>${esc(e.poste)}</b>${e.entreprise ? ' @ ' + esc(e.entreprise) : ''}<br><span class="muted small">${esc(e.periode || '')}</span><br>${esc(e.description || '')}</p>`).join('') || '<p class="muted">Non renseignée.</p>'}</div>
        <div class="card"><h3>Formation</h3>${c.formations.map(f => `<p><b>${esc(f.diplome)}</b><br><span class="muted small">${esc(f.etablissement || '')} · ${esc(f.periode || '')}</span> <span class="badge gray">${esc(f.niveau)}</span></p>`).join('') || '<p class="muted">Non renseignée.</p>'}
        <h3 style="margin-top:12px">Compétences</h3>${c.competences.map(s => `<span class="chip ${(d.criteria.skills?.matched || []).some(m => m.toLowerCase() === s.toLowerCase()) ? 'm' : ''}">${esc(s)}</span>`).join('')}</div></div>
      <div class="card"><h3>Historique des statuts</h3>${c.historique.map(h => `<div class="note small"><b>${esc(STATUT[h.nouveau_statut] || h.nouveau_statut)}</b> · ${fmtDate(h.created_at)} ${esc(h.auteur ? '· ' + h.auteur : '')}${h.commentaire ? `<br>${esc(h.commentaire)}` : ''}</div>`).join('')}</div></div>
    <div class="grid" style="align-content:start">
      <div class="verdict ${c.tier || ''}"><div><div class="small" style="letter-spacing:.06em">VERDICT AUTOMATISÉ (AIDE À LA DÉCISION)</div><h2>${{ priority: 'Candidat prioritaire', review: 'À examiner', low: 'Profil faible' }[c.tier] || 'Non scoré'}</h2><div class="small">Rang ${c.rang ?? '—'} sur ${c.total_poste}</div></div><div class="ring">${c.score ?? '—'}<small>/100</small></div></div>
      <div class="card"><h3>Détail du score</h3><p class="muted small">Calcul déterministe, selon les règles en vigueur.</p>${Object.entries(d.criteria).map(([key, v]) => `<div class="crit"><div class="h"><span>${CRIT[key] || key}</span><span>${v.points} / ${v.max}</span></div><div class="bar"><i style="width:${v.max ? v.points / v.max * 100 : 0}%"></i></div><div class="n">${esc(v.note)}</div></div>`).join('')}</div>
      <div class="card"><h3>Contrôle des critères éliminatoires</h3><p class="muted small">Signalement uniquement : aucun rejet automatique.</p>${d.knockouts.map(x => `<div class="ko"><span>${esc(x.label)}<div class="muted small">${esc(x.detail)}</div></span><span class="badge ${x.passed ? '' : 'low'}">${x.passed ? 'VALIDÉ' : 'À VÉRIFIER'}</span></div>`).join('')}</div>
      <div class="card"><h3>Notes du recruteur <span class="muted small">(${c.notes.length})</span></h3><div id="notes">${c.notes.map(n => `<div class="note"><div class="row small"><b>${esc(n.auteur)}</b><span class="right muted">${ago(n.created_at)}</span></div>${esc(n.contenu)}${n.tags ? `<div>${n.tags.split(',').map(t => `<span class="badge">${esc(t)}</span>`).join(' ')}</div>` : ''}</div>`).join('')}</div>
        <textarea id="nt" maxlength="2000" placeholder="Remarques d'évaluation, directives d'entretien…" aria-label="Nouvelle note"></textarea><div class="row" style="margin:8px 0">${tags.map(t => `<label class="badge" style="cursor:pointer;margin:0"><input type="checkbox" value="${t}"> ${t}</label>`).join('')}<button class="btn primary sm right" id="sn">Enregistrer</button></div></div></div></div>`;
  $('#st').onchange = async e => { if (await setStatut([id], e.target.value)) router(); else e.target.value = c.statut; };
  $('#rej').onclick = async () => { if (await setStatut([id], 'rejete')) router(); }; $('#sl').onclick = async () => { if (await setStatut([id], 'enregistre')) router(); };
  if ($('#cv')) $('#cv').onclick = async () => { try { const b = await api(`/candidatures/${id}/cv`, { blob: true }); window.open(URL.createObjectURL(b), '_blank'); } catch (e) { toast(e.message, true); } };
  $('#sn').onclick = async () => {
    try { await api(`/candidatures/${id}/notes`, { method: 'POST', body: { contenu: $('#nt').value, tags: $$('.badge input:checked').map(i => i.value) } }); toast('Note enregistrée.'); router(); }
    catch (e) { toast(e.errors?.contenu || e.message, true); }
  };
}, AUTH);

/* ================= Offres ================= */
route(/^\/app\/postes$/, async () => {
  privateLayout('postes', 'Offres d\'emploi', undefined, '<button class="btn primary" id="new">+ Nouvelle offre</button>');
  const render = async () => {
    const rows = await api('/recruteur/postes');
    $('#content').innerHTML = `<div class="card"><div class="tw"><table><thead><tr><th>Offre</th><th>Contrat</th><th>Lieu</th><th>Limite</th><th>Statut</th><th>Candidatures</th><th></th></tr></thead><tbody>
      ${rows.map(p => `<tr><td><b>${esc(p.titre)}</b></td><td>${esc(p.type_contract)}</td><td>${esc(p.addresse || '—')}</td><td>${p.date_limite ? fmtDate(p.date_limite + ' 00:00:00') : '—'}</td>
        <td><span class="badge ${p.statut === 'publie' ? '' : 'gray'}">${p.statut}</span></td><td>${p.nb_candidatures}</td><td class="row"><button class="btn sm" data-e="${p.id}">Modifier</button><button class="btn sm danger" data-a="${p.id}">Archiver</button></td></tr>`).join('') || '<tr><td colspan="7" class="center muted">Aucune offre.</td></tr>'}</tbody></table></div></div>`;
    $$('[data-e]').forEach(b => b.onclick = () => form(rows.find(p => p.id == b.dataset.e)));
    $$('[data-a]').forEach(b => b.onclick = async () => { if (!confirm('Archiver cette offre ?')) return; try { await api(`/postes/${b.dataset.a}/archive`, { method: 'POST' }); toast('Offre archivée.'); render(); } catch (e) { toast(e.message, true); } });
  };
  function form(p = {}, errors = {}) {
    const m = modal(`<h2>${p.id ? 'Modifier' : 'Nouvelle'} offre</h2><div class="field"><label>Titre *</label><input id="pt" type="text" value="${esc(p.titre)}" maxlength="150">${fieldErr(errors, 'titre')}</div>
      <div class="field"><label>Description * (20 caractères min.)</label><textarea id="pd" style="min-height:150px">${esc(p.description)}</textarea>${fieldErr(errors, 'description')}</div>
      <div class="grid g2"><div class="field"><label>Localisation</label><input id="pl" type="text" value="${esc(p.addresse)}"></div><div class="field"><label>Contrat</label><select id="pc">${['CDI', 'CDD', 'Stage', 'Freelance', 'Alternance'].map(t => `<option ${t === (p.type_contract || 'CDI') ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="field"><label>Expérience requise (ans)</label><input id="pe" type="number" min="0" max="40" value="${p.experience ?? 0}">${fieldErr(errors, 'experience')}</div><div class="field"><label>Date limite</label><input id="pdl" type="date" value="${p.date_limite || ''}">${fieldErr(errors, 'date_limite')}</div>
      <div class="field"><label>Statut</label><select id="ps">${['brouillon', 'publie', 'ferme'].map(t => `<option ${t === (p.statut || 'brouillon') ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div>
      <div class="row"><button class="btn" id="cx">Annuler</button><button class="btn primary right" id="sv">Enregistrer</button></div>`);
    $('#cx', m).onclick = () => m.remove();
    $('#sv', m).onclick = async () => {
      const body = { titre: $('#pt', m).value, description: $('#pd', m).value, addresse: $('#pl', m).value, type_contract: $('#pc', m).value, experience: +$('#pe', m).value, date_limite: $('#pdl', m).value || null, statut: $('#ps', m).value };
      try { await api(p.id ? '/postes/' + p.id : '/postes', { method: p.id ? 'PUT' : 'POST', body }); m.remove(); toast('Offre enregistrée.'); render(); }
      catch (e) { m.remove(); toast(e.message, true); form({ ...p, ...body }, e.errors || {}); }
    };
  }
  $('#new').onclick = () => form(); await render();
}, AUTH);

/* ================= Règles de scoring ================= */
route(/^\/app\/rules$/, async () => {
  privateLayout('rules', 'Règles de scoring');
  const cfg = await api('/scoring-rules'), admin = S.user.role === 'admin', dis = admin ? '' : 'disabled';
  const W = { skills: 'Compétences techniques & stack', experience: 'Années d\'expérience pertinente', education: 'Formation & certifications', availability: 'Disponibilité & préavis', completeness: 'Complétude du dossier' };
  const draw = () => {
    const sum = Object.values(cfg.weights).reduce((a, b) => a + b, 0);
    $('#content').innerHTML = `${admin ? '' : '<div class="banner">Lecture seule : seuls les administrateurs peuvent modifier les règles.</div>'}
    <div class="card row" style="margin-bottom:16px"><b>Répartition totale des poids :</b><span class="badge ${sum === 100 ? '' : 'low'}">${sum}%</span><div class="bar grow"><i style="width:${Math.min(100, sum)}%;background:${sum === 100 ? '' : 'var(--red)'}"></i></div>
      ${admin ? '<button class="btn" id="rc">Recalculer les scores</button><button class="btn primary" id="sv">Enregistrer</button>' : ''}</div>
    <div class="grid g2" style="align-items:start"><div class="card"><h3>Matrice des poids</h3>${Object.entries(W).map(([k, l]) => `<div class="wrow"><div><b>${l}</b><input type="range" min="0" max="100" value="${cfg.weights[k]}" data-w="${k}" ${dis} aria-label="${l}"></div><input type="number" min="0" max="100" value="${cfg.weights[k]}" data-wn="${k}" ${dis}></div>`).join('')}</div>
      <div class="grid" style="align-content:start"><div class="card"><h3>Seuils de tri</h3><div class="grid g2"><div class="field"><label>Prioritaire à partir de</label><input type="number" id="tp" min="1" max="100" value="${cfg.tiers.priority}" ${dis}></div><div class="field"><label>À revoir à partir de</label><input type="number" id="tr" min="1" max="99" value="${cfg.tiers.review}" ${dis}></div></div><p class="muted small">En dessous : tier « faible ». Le tri n'entraîne aucun rejet automatique.</p></div>
      <div class="card"><h3>Compétences requises</h3><p class="muted small">Essentielles (x${cfg.multipliers.essential}) · Bonus (x${cfg.multipliers.bonus})</p>${['essential_skills', 'bonus_skills'].map(g => `<div style="margin:8px 0"><b class="small">${g === 'essential_skills' ? 'ESSENTIELLES' : 'BONUS'}</b><div>${cfg[g].map((s, i) => `<span class="tag ${g[0] === 'b' ? 'b' : ''}">${esc(s)}${admin ? `<button data-g="${g}" data-i="${i}" aria-label="Retirer ${esc(s)}">×</button>` : ''}</span>`).join('')}</div>
        ${admin ? `<input type="text" data-add="${g}" placeholder="Ajouter + Entrée" style="max-width:220px;margin-top:4px" maxlength="40">` : ''}</div>`).join('')}</div>
      <div class="card"><h3>Critères éliminatoires (signalés, jamais rejetés automatiquement)</h3>
        ${[['work_authorization', 'Exiger l\'autorisation de travail (sans sponsoring)'], ['require_cv', 'Exiger un CV exploitable']].map(([k, l]) => `<div class="ko"><span>${l}</span><label class="tgl"><input type="checkbox" data-ko="${k}" ${cfg.knockouts[k] ? 'checked' : ''} ${dis}><span></span></label></div>`).join('')}
        <div class="ko"><span>Expérience minimale (ans, 0 = désactivé)</span><input type="number" id="kme" min="0" max="40" style="width:80px" value="${cfg.knockouts.min_experience}" ${dis}></div></div></div></div>`;
    $$('[data-w]').forEach(r => r.oninput = () => { cfg.weights[r.dataset.w] = +r.value; draw(); });
    $$('[data-wn]').forEach(n => n.onchange = () => { cfg.weights[n.dataset.wn] = Math.max(0, Math.min(100, +n.value || 0)); draw(); });
    $$('[data-g]').forEach(b => b.onclick = () => { cfg[b.dataset.g].splice(+b.dataset.i, 1); draw(); });
    $$('[data-add]').forEach(i => i.onkeydown = e => { if (e.key === 'Enter' && i.value.trim()) { cfg[i.dataset.add].push(i.value.trim()); draw(); } });
    $$('[data-ko]').forEach(c => c.onchange = () => { cfg.knockouts[c.dataset.ko] = c.checked; });
    if (!admin) return;
    $('#kme').onchange = e => { cfg.knockouts.min_experience = +e.target.value; };
    $('#tp').onchange = e => { cfg.tiers.priority = +e.target.value; }; $('#tr').onchange = e => { cfg.tiers.review = +e.target.value; };
    $('#sv').onclick = async () => { try { await api('/scoring-rules', { method: 'PUT', body: cfg }); toast('Règles enregistrées. Pensez à recalculer les scores.'); } catch (e) { toast(Object.values(e.errors || {})[0] || e.message, true); } };
    $('#rc').onclick = async () => { if (!confirm('Recalculer le score de toutes les candidatures avec les règles ENREGISTRÉES ?')) return; try { const r = await api('/scoring-rules/recalculate', { method: 'POST' }); toast(`${r.recalcules} score(s) recalculé(s).`); } catch (e) { toast(e.message, true); } };
  };
  draw();
}, AUTH);

/* ================= Équipe & sécurité (admin) ================= */
route(/^\/app\/team$/, async () => {
  privateLayout('team', 'Équipe & sécurité', undefined, '<button class="btn primary" id="nu">+ Nouveau compte</button>');
  const render = async () => {
    const d = await api('/admin/utilisateurs?per_page=100');
    $('#content').innerHTML = `<div class="card"><div class="tw"><table><thead><tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Statut</th><th></th></tr></thead><tbody>${d.items.map(u => `<tr><td><b>${esc(u.prenom)} ${esc(u.nom)}</b></td><td>${esc(u.email)}</td>
      <td><select data-r="${u.id}" ${u.id == S.user.id ? 'disabled' : ''} aria-label="Rôle"><option value="recruteur" ${u.role === 'recruteur' ? 'selected' : ''}>Recruteur</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrateur</option></select></td>
      <td><span class="badge ${u.statut === 'actif' ? '' : 'low'}">${u.statut}</span></td><td>${u.id == S.user.id ? '' : `<button class="btn sm" data-s="${u.id}" data-v="${u.statut === 'actif' ? 'suspendu' : 'actif'}">${u.statut === 'actif' ? 'Suspendre' : 'Réactiver'}</button>`}</td></tr>`).join('')}</tbody></table></div></div>`;
    $$('[data-r]').forEach(s => s.onchange = async () => { try { await api('/admin/utilisateurs/' + s.dataset.r, { method: 'PATCH', body: { role: s.value } }); toast('Rôle mis à jour.'); } catch (e) { toast(e.message, true); render(); } });
    $$('[data-s]').forEach(b => b.onclick = async () => { try { await api('/admin/utilisateurs/' + b.dataset.s, { method: 'PATCH', body: { statut: b.dataset.v } }); toast('Statut mis à jour.'); render(); } catch (e) { toast(e.message, true); } });
  };
  $('#nu').onclick = () => {
    const m = modal(`<h2>Nouveau compte</h2><div class="grid g2"><div class="field"><label>Prénom</label><input id="up" type="text"></div><div class="field"><label>Nom</label><input id="un" type="text"></div></div>
      <div class="field"><label>E-mail</label><input id="ue" type="email"></div><div class="field"><label>Mot de passe provisoire (10 car. min.)</label><input id="uw" type="password" autocomplete="new-password"></div>
      <div class="field"><label>Rôle</label><select id="ur"><option value="recruteur">Recruteur</option><option value="admin">Administrateur</option></select></div><div id="ue2"></div><div class="row"><button class="btn" id="c1">Annuler</button><button class="btn primary right" id="c2">Créer</button></div>`);
    $('#c1', m).onclick = () => m.remove();
    $('#c2', m).onclick = async () => { try { await api('/admin/utilisateurs', { method: 'POST', body: { prenom: $('#up', m).value, nom: $('#un', m).value, email: $('#ue', m).value, mot_de_passe: $('#uw', m).value, role: $('#ur', m).value } }); m.remove(); toast('Compte créé.'); render(); }
      catch (e) { $('#ue2', m).innerHTML = `<div class="banner">${esc(Object.values(e.errors || {})[0] || e.message)}</div>`; } };
  };
  await render();
}, { auth: true, roles: ['admin'] });

route(/^\/app$/, () => { location.hash = '#/app/dashboard'; });
