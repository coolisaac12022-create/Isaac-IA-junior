// ============================================================================
//  FOURNISSEUR « github » — GitHub Models (la clé gratuite d'Isaac)
// ----------------------------------------------------------------------------
//  Cerveau n°1 de la maison du 2026-09-25 jusqu'au 30 juillet 2026 : un simple
//  token GitHub dans isaac-keys.json (ou GITHUB_TOKEN) ouvrait
//  https://models.github.ai, texte et vision, pour 0 euro. La clé ne sort JAMAIS
//  du serveur : elle est lue à chaque appel côté process, et seule sa présence
//  est exposée au HUD.
//
//  ÉTAT VÉRIFIÉ LE 2026-10-04 — LE SERVICE EST MORT CHEZ EUX, pas chez nous.
//  Annnonce officielle : « GitHub Models is being fully retired on July 30, 2026 »
//  (github.blog/changelog, 2026-07-01). Sonde faite depuis ce PC avec la clé
//  présente : chat/completions répond HTTP 200 avec un corps « OK » de 4 octets
//  (content-type: text/plain, aucun en-tête server/date/x-request-id) pour
//  microsoft/Phi-4-mini, openai/gpt-4o et meta-llama/Llama-3.1-80B-Instruct, et
//  GET /inference/models répond la même chose. Un 200 qui ne contient pas de
//  choix n'est pas une réponse : c'est une coquille vide. Donc :
//    - dispo = false  → l'ordre AUTO ne frappe plus à cette porte (avant, chaque
//      demande perdait ~1 s chez eux avant de retomber sur Gemini) ;
//    - le connecteur reste VIVANT dans le code (règle n°20 : rien ne se supprime
//      sans justification ; la justification est datée et prouvée ci-dessus).
//      « aelyra, passe le cerveau sur github » ne frappe pas à l'aveugle : le HUD
//      et journal-ai.log rendent RAISON_RETIRE, qui cite la sonde du 2026-10-04 et
//      son 200 au corps vide — si GitHub rallume son endpoint, il suffit de remettre
//      RETIRE = false ci-dessous, tout le reste suit (ordre, voix, HUD, journal).
//    - la raison affichée dit « retiré », jamais « aucune clé » : la clé d'Isaac,
//      elle, est bien présente.
// ============================================================================
'use strict';

const URL_CHAT = 'https://models.github.ai/inference/chat/completions';
const MODELE_CHAT = 'microsoft/Phi-4-mini';
// Les trois moteurs QUI ONT DES YEUX chez GitHub (liste vérifiée sur le token d'Isaac).
const MODELES_VISION = ['google/gemini-2.5-flash', 'meta-llama/Llama-3.2-90B-Vision-Instruct', 'openai/gpt-4o'];

// Un seul caractère à changer si le service revient : voir l'en-tête ci-dessus.
const RETIRE = true;
const RAISON_RETIRE = 'GitHub Models a ete retire chez eux le 30 juillet 2026 — leur endpoint repond 200 avec un corps vide « OK », ' +
  'sans texte exploitable (sonde du 2026-10-04 sur ce PC, avec la cle presente). ' +
  'Ce n est pas la cle qui manque : la cle est valide, le service n existe plus. ' +
  'Le connecteur reste dans le code : une demande forcee rend cette raison exacte au HUD et au journal, sans appel inutile.';

module.exports = function creerGithub(deps) {
  const http = deps.http;

  function cle() {
    const k = deps.cles() || {};
    return String(k.github || '').trim() || null;
  }

  function etat() {
    return {
      nom: 'github',
      titre: 'GitHub Models (cle gratuite, service retire)',
      priorite: 1,
      cle_serveur: cle() ? 'presente' : 'absente',
      retire: RETIRE,
      // Une clé presente ne suffit pas : un service mort ne doit pas etre essaye
      // a chaque demande. C'est LA raison du passage en tete d'ordre a Gemini.
      dispo: !!cle() && !RETIRE,
      raison: RETIRE ? RAISON_RETIRE : (cle() ? null : 'aucune cle GitHub cote serveur (isaac-keys.json:github_token ou GITHUB_TOKEN)'),
      modeles: [MODELE_CHAT].concat(MODELES_VISION),
      protocole: 'HTTPS/JSON compatible OpenAI — POST chat/completions, Authorization: Bearer',
      vision: !!cle() && !RETIRE
    };
  }

  // Une question, une réponse. o = { timeout, modele }
  async function demander(messages, o) {
    const recu = o || {};
    const c = cle();
    if (!c) return { ok: false, raison: etat().raison };
    const modele = String(recu.modele || MODELE_CHAT);
    const t0 = Date.now();
    const res = await http.requestJSON(URL_CHAT, { headers: { Authorization: 'Bearer ' + c } },
      { model: modele, messages, temperature: 0.6 }, recu.timeout || 20000);
    const ms = Date.now() - t0;
    if (res && res.status === 200) {
      const texte = http.extractOpenAIContent(res.data);
      if (texte) return { ok: true, texte, modele, ms };
      // Un 200 sans contenu exploitable, c'est exactement ce que rend l'endpoint
      // retire. On le nomme pour ce qu'il est, pas pour un « caprice du réseau ».
      return { ok: false, ms, raison: RETIRE ? RAISON_RETIRE : 'reponse 200 sans texte exploitable' };
    }
    return { ok: false, ms, raison: http.motifHTTP(res) };
  }

  // Regarder une image : le même token, trois modèles, un par un.
  async function visionner(o) {
    const c = cle();
    if (!c || !o || !o.urlImage) return { ok: false, raison: c ? 'aucune image transmise' : etat().raison };
    const t0 = Date.now();
    const msgs = [
      { role: 'system', content: o.system },
      { role: 'user', content: [
        { type: 'text', text: o.question },
        { type: 'image_url', image_url: { url: o.urlImage } }
      ] }
    ];
    for (const modele of MODELES_VISION) {
      const res = await http.requestJSON(URL_CHAT, { headers: { Authorization: 'Bearer ' + c } },
        { model: modele, messages: msgs, max_tokens: 900, temperature: 0.4 }, o.timeout || 50000);
      if (res && res.status === 200) {
        const texte = http.extractOpenAIContent(res.data);
        if (texte) return { ok: true, texte, modele, ms: Date.now() - t0 };
      }
    }
    return { ok: false, ms: Date.now() - t0, raison: RETIRE ? RAISON_RETIRE : 'les 3 modeles de vision GitHub ont refuse ou rendu du vide' };
  }

  return { nom: 'github', etat, demander, visionner };
};
