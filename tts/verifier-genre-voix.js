// Prouver le genre a l oreille du code : frequence fondamentale moyenne de chaque WAV.
// Femme ~ 170-230 Hz, homme ~ 85-130 Hz. Autocorrelation brute, aucune dependance.
const fs = require('fs');
const path = require('path');

function lireWav(f) {
  const b = fs.readFileSync(f);
  const sr = b.readUInt32LE(24);
  const bits = b.readUInt16LE(34);
  const canaux = b.readUInt16LE(22);
  const decalage = 44;
  const n = Math.floor((b.length - decalage) / (bits / 8));
  const echantillons = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    echantillons[i] = bits === 16 ? b.readInt16LE(decalage + i * 2) / 32768 : b.readUInt8(decalage + i) / 128 - 1;
  }
  return { sr, echantillons, canaux, bits };
}

function frequence(e, sr) {
  const taille = Math.round(sr * 0.04);
  const pas = Math.round(sr * 0.02);
  const mini = Math.round(sr / 350), maxi = Math.round(sr / 70);
  const hs = [];
  for (let d = 0; d + taille < e.length; d += pas) {
    let energie = 0;
    for (let i = 0; i < taille; i++) energie += e[d + i] * e[d + i];
    if (energie / taille < 0.004) continue;                 // frame silencieuse
    let meilleur = 0, retard = 0;
    for (let tau = mini; tau <= maxi; tau++) {
      let s = 0;
      for (let i = 0; i + tau < taille; i++) s += e[d + i] * e[d + i + tau];
      if (s > meilleur) { meilleur = s; retard = tau; }
    }
    if (retard) hs.push(sr / retard);
  }
  if (!hs.length) return { hz: -1, frames: 0 };
  hs.sort((a, b) => a - b);
  return { hz: Math.round(hs[Math.floor(hs.length / 2)]), frames: hs.length };
}

const dossier = path.join(__dirname, 'cache');
const fichiers = fs.readdirSync(dossier).filter(f => f.endsWith('.wav'));
if (!fichiers.length) { console.log('aucun WAV en cache — lance d abord une synthese'); process.exit(0); }
for (const f of fichiers) {
  const w = lireWav(path.join(dossier, f));
  const r = frequence(w.echantillons, w.sr);
  console.log(JSON.stringify({
    fichier: f.slice(0, 12) + '…', sr: w.sr, bits: w.bits, secondes: +(w.echantillons.length / w.sr).toFixed(2),
    frequence_mediane_hz: r.hz, frames_voisees: r.frames,
    genre: r.hz < 0 ? '?' : r.hz < 150 ? 'HOMME' : r.hz > 150 ? 'FEMME' : '?'
  }));
}
