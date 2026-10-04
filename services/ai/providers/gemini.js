// ============================================================================
//  FOURNISSEUR « gemini » — Google AI Studio (la deuxième clé gratuite)
// ----------------------------------------------------------------------------
//  Format natif Google (contents/parts + systemInstruction), pas le format
//  OpenAI. Deux modèles en ce 2026-10-04, essayés dans l'ordre : le flash-lite
//  d'abord (rapide sur la ligne d'Isaac), le flash-latest en relais.
//  La clé part dans l'URL (c'est la signature de leur API) : elle ne quitte
//  jamais le processus, et aucune route du cerveau ne la renvoie au navigateur.
// ============================================================================
'use strict';

const MODELES = ['gemini-3.1-flash-lite', 'gemini-flash-latest'];
const RACINE = 'https://generativelanguage.googleapis.com/v1beta/models/';

module.exports = function creerGemini(deps) {
  const http = deps.http;

  function cle() {
    const k = deps.cles() || {};
    return String(k.gemini || '').trim() || null;
  }

  function etat() {
    return {
      nom: 'gemini',
      titre: 'Google Gemini (cle gratuite AI Studio)',
      priorite: 2,
      cle_serveur: cle() ? 'presente' : 'absente',
      dispo: !!cle(),
      raison: cle() ? null : 'aucune cle Gemini cote serveur (isaac-keys.json:gemini_api_key ou GEMINI_API_KEY)',
      modeles: MODELES.slice(),
      protocole: 'HTTPS/JSON natif Google — POST generateContent, systemInstruction + contents/parts',
      vision: !!cle()
    };
  }

  function traduire(messages) {
    const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
    const contents = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));
    return { system, contents };
  }

  async function uneAppel(url, corps, timeout) {
    const res = await http.requestJSON(url, { method: 'POST' }, corps, timeout);
    if (!res || res.status !== 200) return { ok: false, raison: http.motifHTTP(res) };
    const extrait = http.extractGeminiContent(res.data);
    if (extrait && typeof extrait === 'object' && extrait.bloque) return { ok: false, raison: 'le filtre de securite Google a bloque : ' + extrait.bloque };
    if (extrait) return { ok: true, texte: extrait };
    return { ok: false, raison: 'reponse 200 sans texte exploitable' };
  }

  async function demander(messages, o) {
    const recu = o || {};
    const c = cle();
    if (!c) return { ok: false, raison: etat().raison };
    const t0 = Date.now();
    const m = recu.modele ? [String(recu.modele)] : MODELES;
    const { system, contents } = traduire(messages);
    const reasons = [];
    for (const modele of m) {
      const url = RACINE + modele + ':generateContent?key=' + encodeURIComponent(c);
      const r = await uneAppel(url, {
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents
      }, recu.timeout || 25000);
      if (r.ok) return { ok: true, texte: r.texte, modele, ms: Date.now() - t0 };
      reasons.push(modele + ' : ' + r.raison);
    }
    return { ok: false, ms: Date.now() - t0, raison: reasons.join(' | ').slice(0, 200) };
  }

  // inline_data : l'image arrive dans le corps de la requête, jamais hébergée.
  async function visionner(o) {
    const c = cle();
    if (!c) return { ok: false, raison: etat().raison };
    if (!o || !o.b64 || !o.mime) return { ok: false, raison: 'aucune image transmise' };
    const t0 = Date.now();
    for (const modele of MODELES) {
      const url = RACINE + modele + ':generateContent?key=' + encodeURIComponent(c);
      const r = await uneAppel(url, {
        systemInstruction: { parts: [{ text: o.system }] },
        contents: [{ role: 'user', parts: [
          { text: o.question },
          { inline_data: { mime_type: o.mime, data: o.b64 } }
        ] }]
      }, o.timeout || 45000);
      if (r.ok) return { ok: true, texte: r.texte.slice(0, 6000), modele, ms: Date.now() - t0 };
    }
    return { ok: false, ms: Date.now() - t0, raison: 'les 2 modeles Gemini ont refuse ou rendu du vide' };
  }

  return { nom: 'gemini', etat, demander, visionner };
};
