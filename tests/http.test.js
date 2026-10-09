// =====================================================================================
//  TEST DE REGRESSION — services/ai/http.js
// -------------------------------------------------------------------------------------
//  Le 2026-10-09, un audit a trouvé que postJSON() appelait `moduleFor` au lieu de
//  `modulePour` : ReferenceError attrapée en silence, la fonction retournait TOUJOURS
//  null, et tout le fallback IA gratuit (Pollinations texte + vision) était mort sans
//  que personne ne le voie. Les 104 tests du cerveau ne couvraient pas ce chemin.
//  Ce test monte un vrai serveur HTTP local et vérifie que postJSON fait un vrai
//  appel et revient avec un statut — pas de régression silencieuse possible.
//  Lancer : node tests/http.test.js  (zéro dépendance, zéro réseau externe)
// =====================================================================================
'use strict';

const http = require('http');
const httpAI = require('../services/ai/http.js');

let pass = 0, fail = 0;
function ok(cond, nom) {
  if (cond) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + nom); }
  else { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + nom); }
}

async function main() {
  // Serveur local : renvoie un JSON façon OpenAI
  const srv = http.createServer((req, res) => {
    let b = '';
    req.on('data', c => b += c);
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'pong-local' } }] }));
    });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;

  console.log('\x1b[36m[HTTP] postJSON ne doit jamais mourir en silence\x1b[0m');

  // 1. postJSON fait un vrai appel HTTP (pas de ReferenceError avalée)
  const res = await httpAI.postJSON('http://127.0.0.1:' + port + '/openai',
    { model: 'test', messages: [{ role: 'user', content: 'ping' }] }, 8000);
  ok(res !== null, 'postJSON retourne une réponse (pas null silencieux)');
  ok(res && res.status === 200, 'postJSON : statut 200 du serveur local');

  // 2. L'extracteur récupère le contenu
  const contenu = res ? httpAI.extractOpenAIContent(res.data) : null;
  ok(contenu === 'pong-local', 'extractOpenAIContent extrait « pong-local »');

  // 3. requestJSON (fournisseurs à clé) suit le même contrat
  const res2 = await httpAI.requestJSON('http://127.0.0.1:' + port + '/x', {}, { a: 1 }, 8000);
  ok(res2 !== null && res2.status === 200, 'requestJSON retourne une réponse sur URL http:');

  // 4. motifHTTP traduit les pannes en français
  ok(httpAI.motifHTTP(null) === 'aucune reponse (porte fermee ou timeout)', 'motifHTTP(null) en français');
  ok(/402/.test(httpAI.motifHTTP({ status: 402, data: '' })), 'motifHTTP(402) mentionne le paiement');

  srv.close();
  console.log('\n================ BILAN : ' + pass + ' PASS / ' + fail + ' RATE ================');
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('TEST CASSE :', e.message); process.exit(2); });
