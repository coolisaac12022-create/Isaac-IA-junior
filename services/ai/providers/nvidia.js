// ============================================================================
//  FOURNISSEUR « nvidia » — NVIDIA NIM pour LLM (integrate.api.nvidia.com)
// ----------------------------------------------------------------------------
//  Ce connecteur a été écrit APRÈS vérification réelle, pas d'après une doc.
//  Sondes faites depuis le PC d'Isaac le 2026-10-04, sans aucune clé :
//    GET  /v1/models                    -> HTTP 200, 81 modèles listés
//    POST /v1/chat/completions (401)    -> « Header of type `authorization` was missing »
//    POST avec un faux Bearer     (401) -> {"status":401,"title":"Unauthorized","detail":"Authentication failed"}
//    POST modele retire du catalogue    -> HTTP 410 « has reached its end of life … »
//    POST modele inconnu                -> HTTP 404 « page not found »
//  Conclusion : le CHAT NIM est bien du HTTPS/JSON compatible OpenAI, donc un
//  cerveau zéro dépendance peut l'appeler pour de vrai. Ce n'est PAS le cas de la
//  VOIX NIM (gRPC + PCM linéaire) — elle reste dans services/voice/nemoVoice.js,
//  où elle est annoncée indisponible tant qu'un pont HTTP n'existe pas.
//
//  Deux règles non négociables ici :
//   1. sans clé côté serveur, dispo() = false et AUCUN appel ne part. Le HUD lit
//      « non configuré » — jamais « actif », jamais un faux compteur ;
//   2. la clé se lit dans le process (isaac-keys.json:nvidia_api_key ou
//      NVIDIA_API_KEY). Elle n'est jamais renvoyée par une route, jamais écrite
//      dans un journal, jamais envoyée au navigateur.
//
//  Priorité 3 : les deux clés gratuites d'Isaac passent devant, parce qu'un
//  compte NIM est compté à la requête. Isaac a décidé, pas le code : le mode
//  « nvidia » force ce cerveau en premier.
// ============================================================================
'use strict';

const BASE_DEFAUT = 'https://integrate.api.nvidia.com/v1';
// Identifiés repris SUR LA LISTE LIVE du 2026-10-04 (81 modèles). Trois seulement,
// choisis pour tenir sur la ligne d'Isaac : 8B dense, MoE nano 30B-A3B, 4B.
const MODELES = [
  'nvidia/mistral-nemo-minitron-8b-8k-instruct',
  'nvidia/nemotron-nano-3-30b-a3b',
  'google/gemma-3-4b-it'
];
const TITRE = 'NVIDIA NIM — LLM heberges (integrate.api.nvidia.com)';

module.exports = function creerNvidia(deps) {
  const http = deps.http;

  function cle() {
    const k = deps.cles() || {};
    return String(k.nvidia || '').trim() || null;
  }
  // Une NIM auto-hébergée sur le réseau d'Isaac (un GPU chez un client, un jour)
  // se branche avec ISAAC_NVIDIA_BASE_URL ; sinon c'est l'API hébergée.
  function base() {
    const b = String(process.env.ISAAC_NVIDIA_BASE_URL || '').trim();
    return (b ? b : BASE_DEFAUT).replace(/\/+$/, '') + '/chat/completions';
  }
  function heberge() {
    return String(process.env.ISAAC_NVIDIA_BASE_URL || '').trim() ? 'auto-heberge (ISAAC_NVIDIA_BASE_URL)' : 'API heberge NVIDIA';
  }

  function etat() {
    const c = cle();
    return {
      nom: 'nvidia',
      titre: TITRE,
      priorite: 3,
      cle_serveur: c ? 'presente (jamais envoyee au frontend)' : 'absente',
      dispo: !!c,
      raison: c ? null : 'aucune cle NVIDIA_API_KEY cote serveur — ce cerveau reste eteint, rien n est simulate a sa place',
      modeles: MODELES.slice(),
      hebergement: heberge(),
      protocole: (base().indexOf('https://') === 0 ? 'HTTPS' : 'HTTP') + '/JSON compatible OpenAI — POST chat/completions, Authorization: Bearer',
      inventaire_live: '81 modeles listes le 2026-10-04 sur GET /v1/models (HTTP 200, sonde sans cle)',
      // La voix NIM est en gRPC : hors de portée d'un cerveau zéro dépendance.
      vision: false,
      voix: false
    };
  }

  async function demander(messages, o) {
    const recu = o || {};
    const c = cle();
    if (!c) return { ok: false, raison: etat().raison };
    const t0 = Date.now();
    const liste = recu.modele ? [String(recu.modele)] : MODELES;
    const reasons = [];
    for (const modele of liste) {
      const res = await http.requestJSON(base(), { headers: { Authorization: 'Bearer ' + c } }, {
        model: modele,
        messages,
        temperature: typeof recu.temperature === 'number' ? recu.temperature : 0.6,
        top_p: 0.9,
        max_tokens: Number(recu.max_tokens) || 8000,
        stream: false
      }, recu.timeout || 30000);
      const ms = Date.now() - t0;
      if (res && res.status === 200) {
        const texte = http.extractOpenAIContent(res.data);
        if (texte) return { ok: true, texte, modele, ms };
        reasons.push(modele + ' : reponse 200 sans texte exploitable');
        continue;
      }
      reasons.push(modele + ' : ' + http.motifHTTP(res));
    }
    return { ok: false, ms: Date.now() - t0, raison: reasons.join(' | ').slice(0, 240) };
  }

  // Ce connecteur ne regarde pas les images : les modèles retenus sont du texte,
  // et rien ici n'a été vérifié en vision. La vision reste GitHub → Gemini →
  // Pollinations, et le HUD l'affiche comme tel.
  function visionner() {
    return Promise.resolve({ ok: false, raison: 'connecteur NVIDIA current : texte seulement, aucun modele de vision verifie ici' });
  }

  return { nom: 'nvidia', etat, demander, visionner };
};
