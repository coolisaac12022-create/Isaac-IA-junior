// ============================================================================
//  AI HTTP — la seule porte de sortie reseau des connecteurs d'IA
// ----------------------------------------------------------------------------
//  Phase 4 du JARVIS COMMAND CENTER (2026-10-04). Le cerveau est ZERO DEPENDANCE :
//  pas d'openai, pas d'axios, pas de google-generativeai. Le module `https` de
//  Node suffit, parce que les trois portes réelles d'Isaac sont du HTTPS/JSON :
//    - GitHub Models  : POST https://models.github.ai/inference/chat/completions
//    - Google Gemini  : POST https://generativelanguage.googleapis.com/.../generateContent
//    - NVIDIA NIM     : POST https://integrate.api.nvidia.com/v1/chat/completions
//    - Pollinations   : POST https://text.pollinations.ai/openai (sans clé)
//  Ce fichier reprend TEL QUELS les deux helpers qui vivaient dans server.js
//  (httpsRequestJSON, postJSON) et l'extracteur de réponse OpenAI, pour que le
//  comportement ne change pas d'un octet au passage. Plafonds compris : une
//  réponse au-delà est coupée, parce que ce PC a 1,8 Go libres et qu'un modèle
//  qui divague ne doit pas le faire tomber. Les modules `https` ET `http` de Node
//  suffisent : `http` n'est là que pour une NIM auto-hébergée sur le réseau
//  d'Isaac (ISAAC_NVIDIA_BASE_URL) — les portes publiques restent en HTTPS.
// ============================================================================
'use strict';

const https = require('https');

// 60 Ko pour une réponse signée à la main (GitHub/Gemini/NVIDIA), 30 Ko pour la
// porte publique : les plafonds historiques, mesurés sur le PC d'Isaac.
const PLAFOND_CLE = 60000;
const PLAFOND_LIBRE = 30000;

// Une NIM auto-hébergée sur le réseau d'Isaac (un GPU chez un client, un pont
// local, ou le serveur de test de ce fichier) parle en HTTP simple ; les portes
// publiques parlent en HTTPS. Le module est choisi selon l'URL — sinon une NIM
// locale serait injoignable avec un message d'erreur qui ment sur sa cause.
function modulePour(u) {
  return u.protocol === 'https:' ? https : require('http');
}

// Requête HTTPS avec en-têtes + corps JSON. Résout toujours ({status, data}) ou
// null (timeout, erreur réseau, corps illisible) : un connecteur ne jette jamais,
// il encaisse et passe la main au suivant.
function requestJSON(url, opts, obj, timeoutMs) {
  return new Promise((resolve) => {
    try {
      const body = JSON.stringify(obj);
      const u = new URL(url);
      const req = modulePour(u).request({
        hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search, method: (opts && opts.method) || 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, (opts && opts.headers) || {})
      }, (res) => {
        let d = '';
        res.on('data', (c) => { d += c; if (d.length > PLAFOND_CLE) req.destroy(); });
        res.on('end', () => resolve({ status: res.statusCode, data: d }));
      });
      req.setTimeout(timeoutMs || 20000, () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
      req.write(body); req.end();
    } catch (e) { resolve(null); }
  });
}

// POST JSON simple (la porte publique sans clé) — sémantique identique à
// postJSON d'origine, plafond 30 Ko.
function postJSON(url, obj, timeoutMs) {
  return new Promise((resolve) => {
    try {
      const body = JSON.stringify(obj);
      const req = modulePour(new URL(url)).request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; if (data.length > PLAFOND_LIBRE) req.destroy(); });
        res.on('end', () => resolve({ status: res.statusCode, data }));
      });
      req.setTimeout(timeoutMs || 20000, () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
      req.write(body);
      req.end();
    } catch (e) { resolve(null); }
  });
}

// Le contenu d'une réponse au format OpenAI. Le texte brut est gardé tel quel :
// les sauts de ligne sont vitaux pour le code que Jeanette génère.
function extractOpenAIContent(body, plafond) {
  try {
    const data = JSON.parse(body);
    const c = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (c && c.trim().length > 1 && !/^\s*[[{]/.test(c)) return c.trim().slice(0, plafond || 20000);
  } catch (e) {}
  return null;
}

// Le contenu d'une réponse Google Gemini (parts[], pas choices[]).
function extractGeminiContent(body, plafond) {
  try {
    const data = JSON.parse(body);
    const parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
    const text = Array.isArray(parts) ? parts.map(p => p.text || '').join('').trim() : '';
    if (text.length > 1) return text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').slice(0, plafond || 20000);
    // Un blocage de sécurité se lit dans la réponse : mieux vaut le dire que « silence ».
    const motif = data && (data.promptFeedback && data.promptFeedback.blockReason || data.error && data.error.message);
    if (motif) return { bloque: String(motif).slice(0, 160) };
  } catch (e) {}
  return null;
}

// La règle de la maison : jamais « silence » quand on sait pourquoi. Chaque code
// HTTP a sa phrase en français, y compris ceux propres à NVIDIA (410 = modèle
// retiré, 401 = clé refusée).
function motifHTTP(res) {
  if (!res) return 'aucune reponse (porte fermee ou timeout)';
  const d = String(res.data || '');
  if (res.status === 500 && /ENOSPC/i.test(d)) return 'leurs disques sont pleins (500 ENOSPC)';
  if (res.status === 402) return 'ils reclament un compte payant (402)';
  if (res.status === 404) return 'modele introuvable chez eux (404)';
  if (res.status === 410) return 'modele retire de leur catalogue (410 fin de vie)' + (d ? ' — ' + d.slice(0, 120) : '');
  if (res.status === 401) return 'cle refusee (401)';
  if (res.status === 403) return 'acces refuse (403)';
  if (res.status === 429) return 'trop de monde devant nous (429 quota)';
  if (res.status >= 500) return 'erreur chez eux (HTTP ' + res.status + ')';
  return 'HTTP ' + res.status;
}

module.exports = {
  requestJSON: requestJSON,
  postJSON: postJSON,
  extractOpenAIContent: extractOpenAIContent,
  extractGeminiContent: extractGeminiContent,
  motifHTTP: motifHTTP,
  PLAFONDS: { cle: PLAFOND_CLE, libre: PLAFOND_LIBRE }
};
