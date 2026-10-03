// ============================================================================
//  NEMO VOICE — le connecteur NVIDIA NIM (Riva / Nemotron TTS) du Voice Engine
// ----------------------------------------------------------------------------
//  Ce connecteur existe pour dire la VERITE sur la voix NVIDIA, pas pour faire
//  semblant de l'avoir. Etat vérifié le 2026-10-03 sur les docs NVIDIA :
//    - la voix NIM hébergée se commande en gRPC (grpc.nvcf.nvidia.com:443,
//      PCM linéaire) — pas en HTTPS/JSON ;
//    - ce cerveau est ZÉRO DÉPENDANCE : aucun client gRPC ne vit ici, et ce PC
//      (i5 2 cœurs, pas de GPU, ~2 Go libres) ne peut pas héberger un NIM Riva.
//  Il reste donc DEUX cas réels, et seulement deux :
//    1. un pont HTTP local optionnel : si Isaac pose un jour un petit pont
//       gRPC->HTTP ailleurs sur son réseau, ISAAC_NEMO_URL pointe dessus et ce
//       connecteur l'utilise pour de vrai (POST {texte, voix, langue} -> WAV ou
//       {audio_base64}) ;
//    2. sinon dispo() = false avec la raison réelle, et /api/voix/etat comme
//       l'intent « quel est ton moteur de voix » la récitent telle quelle.
//  La clé NVIDIA, elle, ne se lit JAMAIS côté frontend : process.env seulement,
//  et sa présence est annoncée sans jamais montrer un caractère de sa valeur.
// ============================================================================
'use strict';

const NOM = 'nvidia_nim';
const TIMEOUT_MS = 20000;

function creerNemoVoice(deps) {
  const journal = (deps && typeof deps.journal === 'function') ? deps.journal : function () {};

  function pont() {
    const u = String(process.env.ISAAC_NEMO_URL || '').trim();
    return /^https?:\/\//i.test(u) ? u : null;
  }
  function clePresente() {
    return String(process.env.NVIDIA_API_KEY || '').trim().length > 0;
  }

  function raison() {
    if (pont()) return null;                                   // le pont existe : le connecteur peut parler
    return 'la voix NVIDIA NIM se commande en gRPC (grpc.nvcf.nvidia.com:443, PCM lineaire) — ' +
      'ce cerveau zero dependance n a pas de client gRPC, et ce PC ne peut pas heberger un NIM Riva. ' +
      'Aucun pont HTTP ISAAC_NEMO_URL n est configure' +
      (clePresente() ? ' (une cle NVIDIA est bien presente cote serveur, elle ne suffit pas sans pont)' : ' et aucune cle NVIDIA n est presente cote serveur') +
      ' : ce fournisseur ne sort jamais du processus, la voix reste Piper ou le navigateur.';
  }

  function dispo() { return !!pont(); }

  // Synthétise via le pont HTTP local. Renvoie un Buffer WAV, ou lève une Error
  // portant la vraie raison (code HTTP, timeout, format inconnu) : le Voice
  // Engine la transforme en repli, jamais en silence.
  function synthetiser(o) {
    return new Promise(function (resolve, reject) {
      const url = pont();
      if (!url) return reject(new Error('aucun pont HTTP NVIDIA configure (ISAAC_NEMO_URL)'));
      const recu = o || {};
      const corps = JSON.stringify({
        texte: String(recu.texte || '').slice(0, 1200),
        voix: String(recu.voix || recu.parlence || 'aelyra'),
        langue: String(recu.langue || 'fr')
      });
      let regle = false;
      const finir = function (fn, v) { if (regle) return; regle = true; clearTimeout(chien); fn(v); };
      const chien = setTimeout(function () { finir(reject, new Error('pont NVIDIA muet apres ' + (TIMEOUT_MS / 1000) + ' s')); }, TIMEOUT_MS);
      try {
        const mod = require(url.indexOf('https://') === 0 ? 'https' : 'http');
        const u = new URL(url);
        const r = mod.request({
          method: 'POST', hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
          path: u.pathname + (u.search || ''),
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(corps)
          }
        }, function (res) {
          const bouts = [];
          res.on('data', function (c) { bouts.push(c); if (Buffer.concat(bouts).length > 8 * 1024 * 1024) { try { res.destroy(); } catch (e) {} } });
          res.on('end', function () {
            const tout = Buffer.concat(bouts);
            if (res.statusCode !== 200) return finir(reject, new Error('pont NVIDIA HTTP ' + res.statusCode + ' : ' + tout.slice(0, 120).toString('utf8')));
            // Soit le pont rend le WAV brut, soit du JSON {audio_base64} : les deux sont vrais ailleurs, on accepte les deux.
            if (tout.length > 44 && tout.slice(0, 4).toString('ascii') === 'RIFF') return finir(resolve, tout);
            try {
              const j = JSON.parse(tout.toString('utf8'));
              const b64 = j && (j.audio_base64 || j.audio || (j.data && j.data.audio_base64));
              if (b64) {
                const wav = Buffer.from(String(b64), 'base64');
                if (wav.length > 44 && wav.slice(0, 4).toString('ascii') === 'RIFF') return finir(resolve, wav);
                return finir(reject, new Error('le pont NVIDIA a rendu du base64 qui n est pas un WAV'));
              }
            } catch (e) {}
            finir(reject, new Error('reponse du pont NVIDIA ni WAV ni JSON audio (' + tout.length + ' octets)'));
          });
        });
        r.on('error', function (e) { finir(reject, new Error('pont NVIDIA injoignable : ' + e.message)); });
        r.write(corps);
        r.end();
      } catch (e) {
        finir(reject, new Error('requete vers le pont NVIDIA impossible : ' + e.message));
      }
    });
  }

  function etat() {
    return {
      nom: NOM,
      titre: 'NVIDIA NIM (Riva / Nemotron TTS)',
      dispo: dispo(),
      raison: raison(),
      pont_http: pont() ? 'configure' : 'absent',
      cle_serveur: clePresente() ? 'presente (jamais envoyee au frontend)' : 'absente',
      protocole_reel: 'gRPC grpc.nvcf.nvidia.com:443 — hors de portee d un cerveau zero dependance'
    };
  }

  return { nom: NOM, dispo: dispo, raison: raison, synthetiser: synthetiser, etat: etat, journal: journal };
}

module.exports = creerNemoVoice;
