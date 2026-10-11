'use strict';
/* ---------- Accueil / offres ---------- */
route(/^\/$/, async () => {
  publicLayout(`<div class="hero"><h1>Trouvez votre prochain poste. Postulez en 2 minutes.</h1>
    <p>Déposez votre CV en PDF : nous préremplissons le formulaire, vous vérifiez et corrigez tout avant l'envoi. Pas de compte nécessaire.</p></div>
    <div class="card" style="margin-bottom:16px"><div class="filters" style="grid-template-columns:2fr 1.2fr 1fr">
      <input id="q" type="text" placeholder="Titre, mot-clé…" aria-label="Recherche"><input id="loc" type="text" placeholder="Localisation" aria-label="Localisation">
      <select id="typ" aria-label="Type de contrat"><option value="">Tous contrats</option>${['CDI', 'CDD', 'Stage', 'Freelance', 'Alternance'].map(t => `<option>${t}</option>`).join('')}</select></div></div>
    <div id="offers"></div>`);
  let page = 1;
  const load = async () => {
    const p = new URLSearchParams({ page, per_page: 8, q: $('#q').value, localisation: $('#loc').value, type: $('#typ').value });
    $('#offers').innerHTML = '<div class="center"><span class="spinner"></span></div>';
    try {
      const d = await api('/postes?' + p);
      $('#offers').innerHTML = d.items.length ? d.items.map(o => `<a class="card offer" href="#/offre/${o.id}" style="display:flex;margin-bottom:12px;text-decoration:none;color:inherit">
        <div class="grow"><h3>${esc(o.titre)}</h3><p class="muted" style="margin:6px 0">${esc(o.extrait)}…</p>
        <span class="badge">${esc(o.type_contract)}</span> <span class="badge gray">${esc(o.addresse || 'Lieu non précisé')}</span> <span class="badge gray">${o.experience} an(s) d'exp.</span></div>
        <span class="btn primary">Voir l'offre</span></a>`).join('') +
        `<div class="pager"><span class="muted">${d.total} offre(s)</span><span class="row"><button class="btn sm" id="pp" ${page <= 1 ? 'disabled' : ''}>Précédent</button><button class="btn sm" id="pn" ${page * d.per_page >= d.total ? 'disabled' : ''}>Suivant</button></span></div>`
        : '<div class="card center muted">Aucune offre ne correspond à votre recherche.</div>';
      $('#pp') && ($('#pp').onclick = () => { page--; load(); }); $('#pn') && ($('#pn').onclick = () => { page++; load(); });
    } catch (e) { $('#offers').innerHTML = `<div class="banner">${esc(e.message)}</div>`; }
  };
  const reload = debounce(() => { page = 1; load(); });
  ['q', 'loc'].forEach(i => $('#' + i).oninput = reload); $('#typ').onchange = reload; load();
});

route(/^\/offre\/(\d+)$/, async id => {
  publicLayout('<div class="center"><span class="spinner"></span></div>');
  const o = await api('/postes/' + id);
  $('#content').innerHTML = `<a href="#/">← Toutes les offres</a><div class="card" style="margin-top:12px"><div class="row"><h1 style="font-size:26px">${esc(o.titre)}</h1><a class="btn primary right" href="#/postuler/${o.id}">Postuler</a></div>
    <p><span class="badge">${esc(o.type_contract)}</span> <span class="badge gray">${esc(o.addresse || 'Lieu non précisé')}</span> <span class="badge gray">${o.experience} an(s) d'expérience</span>
    ${o.date_limite ? `<span class="badge gray">Avant le ${fmtDate(o.date_limite + ' 00:00:00')}</span>` : ''}</p>
    <div style="white-space:pre-wrap">${esc(o.description)}</div></div>`;
});

/* ---------- Candidature : upload CV → vérification → envoi ---------- */
const A = {};
route(/^\/postuler\/(\d+)$/, async id => {
  publicLayout('<div class="center"><span class="spinner"></span></div>');
  const poste = await api('/postes/' + id);
  Object.assign(A, { poste, upload_id: null, f: { competences: [], experiences: [], formations: [] }, source: null, warning: null });
  stepUpload();
});
const stepper = n => `<div class="steps">${['1. Votre CV', '2. Vérification', '3. Confirmation'].map((s, i) => `<span class="${i + 1 === n ? 'on' : ''}">${s}</span>`).join('')}</div>`;

function stepUpload(msg = '') {
  $('#content').innerHTML = `<a href="#/offre/${A.poste.id}">← Retour à l'offre</a><h1 style="font-size:24px;margin:10px 0">Postuler : ${esc(A.poste.titre)}</h1>${stepper(1)}
    <div class="card"><div class="drop"><h3>Déposez votre CV (PDF, 5 Mo max)</h3><p class="muted">Le texte sera analysé par IA pour préremplir le formulaire. Vous pourrez tout corriger.</p>
    <input id="cv" type="file" accept="application/pdf,.pdf" aria-label="Fichier CV PDF"><p><button class="btn primary" id="go">Analyser mon CV</button></p><div id="st">${msg ? `<div class="banner">${esc(msg)}</div>` : ''}</div></div>
    <p class="center" style="padding:14px 0 0"><button class="btn" id="manual">Je préfère remplir manuellement</button></p></div>`;
  $('#manual').onclick = stepForm;
  $('#go').onclick = async () => {
    const f = $('#cv').files[0]; if (!f) { $('#st').innerHTML = '<div class="banner">Choisissez un fichier PDF.</div>'; return; }
    if (f.size > 5 * 1024 * 1024) { $('#st').innerHTML = '<div class="banner">Fichier trop volumineux (5 Mo max).</div>'; return; }
    $('#go').disabled = true; $('#st').innerHTML = '<span class="spinner"></span> Analyse en cours…';
    const fd = new FormData(); fd.append('cv', f);
    try {
      const d = await api('/cv/analyze', { method: 'POST', form: fd });
      A.upload_id = d.upload_id; A.f = d.fields; A.source = d.source; A.warning = d.warning; stepForm();
    } catch (e) { $('#go').disabled = false; $('#st').innerHTML = `<div class="banner">${esc(e.message)} Vous pouvez réessayer ou remplir manuellement.</div>`; }
  };
}

const expRow = (e = {}) => `<div class="listrow exp"><button type="button" class="btn sm rm" aria-label="Retirer">✕</button><div class="grid g2">
  <div><label>Poste</label><input type="text" data-f="poste" value="${esc(e.poste)}" maxlength="150"></div><div><label>Entreprise</label><input type="text" data-f="entreprise" value="${esc(e.entreprise)}" maxlength="150"></div>
  <div><label>Période</label><input type="text" data-f="periode" value="${esc(e.periode)}" maxlength="80"></div><div><label>Description</label><input type="text" data-f="description" value="${esc(e.description)}" maxlength="1000"></div></div></div>`;
const formRow = (f = {}) => `<div class="listrow frm"><button type="button" class="btn sm rm" aria-label="Retirer">✕</button><div class="grid g2">
  <div><label>Diplôme</label><input type="text" data-f="diplome" value="${esc(f.diplome)}" maxlength="150"></div><div><label>Établissement</label><input type="text" data-f="etablissement" value="${esc(f.etablissement)}" maxlength="150"></div>
  <div><label>Période</label><input type="text" data-f="periode" value="${esc(f.periode)}" maxlength="80"></div></div></div>`;

function stepForm(errors = {}) {
  const f = A.f; const inp = (k, l, t = 'text', extra = '') => `<div class="field"><label for="f_${k}">${l}</label><input id="f_${k}" type="${t}" value="${esc(f[k] ?? '')}" ${extra}>${fieldErr(errors, k)}</div>`;
  $('#content').innerHTML = `<a href="#/offre/${A.poste.id}">← Retour à l'offre</a><h1 style="font-size:24px;margin:10px 0">Vérifiez vos informations</h1>${stepper(2)}
    ${A.warning ? `<div class="banner">⚠ ${esc(A.warning)}</div>` : ''}
    <div class="card"><h3>Identité & contact</h3><div class="grid g2" style="margin-top:10px">${inp('prenom', 'Prénom *', 'text', 'maxlength=80')}${inp('nom', 'Nom *', 'text', 'maxlength=80')}${inp('email', 'E-mail *', 'email')}${inp('tel', 'Téléphone', 'tel')}
      ${inp('addresse', 'Localisation', 'text')}${inp('annees_experience', 'Années d\'expérience', 'number', 'min=0 max=60 step=0.5')}${inp('linkedin', 'LinkedIn')}${inp('github', 'GitHub')}${inp('portfolio', 'Portfolio / site')}
      <div class="field"><label for="f_dispo">Disponibilité</label><select id="f_dispo"><option value="14">Immédiate (≤ 2 semaines)</option><option value="30" selected>Préavis 30 jours</option><option value="60">60 jours</option><option value="90">90 jours ou plus</option></select></div></div>
      <label class="row" style="font-weight:500"><input type="checkbox" id="f_auth"> J'ai le droit de travailler dans le pays du poste sans sponsoring de visa</label></div>
    <div class="card" style="margin-top:14px"><h3>Compétences</h3><div id="skills"></div><div class="row" style="margin-top:8px"><input id="newskill" type="text" placeholder="Ajouter une compétence puis Entrée" style="max-width:320px" maxlength="80"></div></div>
    <div class="card" style="margin-top:14px"><div class="row"><h3>Expériences</h3><button type="button" class="btn sm right" id="addexp">+ Ajouter</button></div><div id="exps">${f.experiences.map(expRow).join('')}</div></div>
    <div class="card" style="margin-top:14px"><div class="row"><h3>Formations</h3><button type="button" class="btn sm right" id="addfor">+ Ajouter</button></div><div id="fors">${f.formations.map(formRow).join('')}</div></div>
    <div class="card" style="margin-top:14px"><label for="f_lettre">Lettre de motivation (facultatif)</label><textarea id="f_lettre" maxlength="5000"></textarea></div>
    <div class="card" style="margin-top:14px"><label class="row" style="font-weight:500"><input type="checkbox" id="f_consent"> J'accepte que mes données soient traitées pour ce recrutement (analyse IA incluse). Aucune décision automatique n'est prise. *</label>${fieldErr(errors, 'consentement')}
      <div id="formerr"></div><p class="row"><button class="btn" id="back">← Changer de CV</button><button class="btn primary right" id="send">Envoyer ma candidature</button></p></div>`;
  const drawSkills = () => { $('#skills').innerHTML = f.competences.map((s, i) => `<span class="tag">${esc(s)}<button type="button" data-i="${i}" aria-label="Retirer ${esc(s)}">×</button></span>`).join('') || '<span class="muted">Aucune compétence détectée.</span>'; $$('#skills button').forEach(b => b.onclick = () => { f.competences.splice(+b.dataset.i, 1); drawSkills(); }); };
  drawSkills();
  $('#newskill').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const v = e.target.value.trim(); if (v && !f.competences.some(s => s.toLowerCase() === v.toLowerCase())) f.competences.push(v); e.target.value = ''; drawSkills(); } };
  const rm = box => box.addEventListener('click', e => { if (e.target.classList.contains('rm')) e.target.closest('.listrow').remove(); });
  rm($('#exps')); rm($('#fors'));
  $('#addexp').onclick = () => $('#exps').insertAdjacentHTML('beforeend', expRow()); $('#addfor').onclick = () => $('#fors').insertAdjacentHTML('beforeend', formRow());
  $('#back').onclick = () => stepUpload();
  const dispo = [14, 30, 60, 90].includes(+f.disponibilite_jours) ? f.disponibilite_jours : 30; $('#f_dispo').value = dispo;
  $('#send').onclick = async () => {
    const g = k => $('#f_' + k).value.trim(); const rows = (sel) => $$(sel).map(r => Object.fromEntries($$('[data-f]', r).map(i => [i.dataset.f, i.value.trim()])));
    const body = { poste_id: A.poste.id, upload_id: A.upload_id, nom: g('nom'), prenom: g('prenom'), email: g('email'), tel: g('tel'), addresse: g('addresse'), linkedin: g('linkedin'), github: g('github'), portfolio: g('portfolio'),
      annees_experience: g('annees_experience') || 0, disponibilite_jours: +$('#f_dispo').value, autorisation_travail: $('#f_auth').checked, lettre_motivation: $('#f_lettre').value, consentement: $('#f_consent').checked,
      competences: f.competences, experiences: rows('.exp'), formations: rows('.frm') };
    Object.assign(f, { nom: body.nom, prenom: body.prenom, email: body.email, tel: body.tel, addresse: body.addresse, linkedin: body.linkedin, github: body.github, portfolio: body.portfolio, annees_experience: body.annees_experience, experiences: body.experiences, formations: body.formations });
    $('#send').disabled = true;
    try {
      const d = await api('/candidatures', { method: 'POST', body });
      $('#content').innerHTML = `${stepper(3)}<div class="card center"><div style="font-size:48px">✅</div><h2>Candidature envoyée</h2><p>Votre numéro de référence : <b>${esc(d.reference)}</b></p><p class="muted">Conservez-le. Un recruteur examinera votre dossier.</p><a class="btn primary" href="#/">Voir d'autres offres</a></div>`;
    } catch (e) {
      $('#send').disabled = false; const k = Object.values(e.errors || {});
      $('#formerr').innerHTML = `<div class="banner" style="margin-top:10px">${esc(e.message)}${k.length ? '<ul>' + k.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>' : ''}</div>`;
    }
  };
}

/* ---------- Connexion ---------- */
route(/^\/login$/, async () => {
  if (S.user) { location.hash = '#/app/dashboard'; return; }
  publicLayout(`<div class="card login"><h2>Espace recruteur</h2><p class="muted">Connectez-vous avec le compte fourni par votre administrateur.</p>
    <div class="field"><label for="em">E-mail</label><input id="em" type="email" autocomplete="username"></div><div class="field"><label for="pw">Mot de passe</label><input id="pw" type="password" autocomplete="current-password"></div>
    <div id="le"></div><button class="btn primary" id="lg" style="width:100%;justify-content:center">Se connecter</button></div>`);
  const go = async () => {
    $('#lg').disabled = true;
    try { const d = await api('/auth/login', { method: 'POST', body: { email: $('#em').value, mot_de_passe: $('#pw').value } }); setSession(d.token, d.user); location.hash = '#/app/dashboard'; }
    catch (e) { $('#lg').disabled = false; $('#le').innerHTML = `<div class="banner">${esc(e.message)}</div>`; }
  };
  $('#lg').onclick = go; $('#pw').onkeydown = e => { if (e.key === 'Enter') go(); };
});
