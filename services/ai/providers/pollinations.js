// ============================================================================
//  FOURNISSEUR « pollinations » — la porte publique, sans clé
// ----------------------------------------------------------------------------
//  text.pollinations.ai est le dernier recours de la maison : aucune clé, donc
//  aucun compte à payer, mais aussi aucune garantie. relevé sur place le
//  2026-10-01 et revérifié depuis :
//    POST openai-fast -> 500 « ENOSPC: no space left on device » (leurs disques)
//    POST openai      -> 402 Payment Required
//    POST mistral     -> 404 « Model not found — this is our legacy API »
//  C'est donc la porte fermée CHEZ EUX, et ce connecteur a pour travail de le
//  DIRE : chaque tentative garde son code HTTP traduit en français, et le
//  repli final cite ces motifs au lieu d'un « silence » mystérieux.
//  Leurs réponses gratuites glissent aussi de la publicité et du markdown :
//  purge() coupe net à la pub, retire étoiles et liens. Isaac ne voit et
//  n'entend que du français propre.
// ============================================================================
'use strict';

const URL_CHAT = 'https://text.pollinations.ai/openai';
// Échelle AUTO : trois essais courts, avec une attente progressive (leur file est
// saturée par intermittence, repartir tout de suite ne fait qu'ajouter du monde).
const ATTEMPTS = [
  { model: 'openai-fast', timeout: 20000, wait: 0 },
  { model: 'openai-fast', timeout: 18000, wait: 2500 },
  { model: 'openai', timeout: 15000, wait: 4000 }
];
// Échelle « cerveau invité » : plus courte, on ne fait pas attendre Isaac plus
// d'une minute pour une poignée de main extérieure.
const ATTEMPTS_INVITE = [
  { model: 'openai-fast', timeout: 24000, wait: 0 },
  { model: 'openai', timeout: 18000, wait: 1200 }
];

module.exports = function creerPollinations(deps) {
  const http = deps.http;

  function etat() {
    return {
      nom: 'pollinations',
      titre: 'Pollinations — porte publique sans cle',
      priorite: 4,
      cle_serveur: 'aucune (et il n en faut pas)',
      dispo: true,
      raison: 'toujours tente, mais libre et parfois sature chez eux : c est le dernier recours',
      modeles: ['openai-fast', 'openai'],
      protocole: 'HTTPS/JSON compatible OpenAI — POST sans Authorization',
      vision: true
    };
  }

  function purge(t) {
    if (!t) return t;
    let s = String(t);
    const i = s.search(/support pollinations|powered by pollinations|pollinations\.ai\/redirect|🌸/i);
    if (i >= 0) s = s.slice(0, i);
    return s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*\n]+)\*/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[\s\-*=:]+$/g, '')
      .trim();
  }

  // Une échelle d'essais, le vrai diagnostic par essai. Retourne {ok, texte, modele, ms, diagnostic[]}.
  async function echelle(messages, plans, timeoutGlobale) {
    const t0 = Date.now();
    const diagnostic = [];
    for (const plan of plans) {
      if (plan.wait) await new Promise(r => setTimeout(r, plan.wait));
      const res = await http.postJSON(URL_CHAT, { model: plan.model, messages }, timeoutGlobale || plan.timeout);
      if (res && res.status === 200) {
        const c = http.extractOpenAIContent(res.data);
        if (c) return { ok: true, texte: purge(c), modele: plan.model, ms: Date.now() - t0, diagnostic };
        diagnostic.push(plan.model + ' : reponse 200 sans texte exploitable');
        continue;
      }
      diagnostic.push(plan.model + ' : ' + http.motifHTTP(res));
    }
    return { ok: false, ms: Date.now() - t0, diagnostic };
  }

  async function demander(messages, o) {
    const recu = o || {};
    const r = await echelle(messages, recu.modele ? [{ model: String(recu.modele), timeout: recu.timeout || 20000, wait: 0 }] : ATTEMPTS, recu.timeout);
    return { ok: r.ok, texte: r.texte, modele: r.modele, ms: r.ms, raison: r.ok ? null : (r.diagnostic.join(' ; ') || 'porte publique muette') };
  }

  // Le cerveau INVITÉ (table ronde extérieure) : même porte, échelle courte, et
  // le diagnostic remonte mot pour mot dans le message de repli d'Isaac.
  async function inviter(messages) {
    const r = await echelle(messages, ATTEMPTS_INVITE);
    return { ok: r.ok, texte: r.texte, modele: r.modele, ms: r.ms, diagnostic: r.diagnostic };
  }

  // Vision : une seule tentative image_url, format OpenAI.
  async function visionner(o) {
    if (!o || !o.urlImage) return { ok: false, raison: 'aucune image transmise' };
    const t0 = Date.now();
    const res = await http.postJSON(URL_CHAT, {
      model: 'openai',
      messages: [
        { role: 'system', content: String(o.system).slice(0, 1500) },
        { role: 'user', content: [
          { type: 'text', text: o.question },
          { type: 'image_url', image_url: { url: o.urlImage } }
        ] }
      ]
    }, o.timeout || 32000);
    if (res && res.status === 200) {
      const c = http.extractOpenAIContent(res.data);
      if (c) return { ok: true, texte: c, modele: 'openai', ms: Date.now() - t0 };
    }
    return { ok: false, ms: Date.now() - t0, raison: http.motifHTTP(res) };
  }

  return { nom: 'pollinations', etat, demander, inviter, visionner };
};
