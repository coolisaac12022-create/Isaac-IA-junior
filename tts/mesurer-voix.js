// Bench sequentiel : une phrase apres l autre, sans file d attente, pour mesurer la VRAIE latence
// sur le PC d Isaac (navigateurs ouverts = charge reelle).
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const B = __dirname;
const TEXTES = [
  'Bonjour Isaac, je suis Aelyra et ma voix sort d un reseau de neurones local.',
  'Le scan est termine : quatre ports ouverts, deux services anciens.',
  'Attention, cette adresse est un verrou absolu, je ne la toucherai pas.'
];
function taille(f) { try { return fs.statSync(f).size; } catch (e) { return -1; } }
function seconde(f) { const t = taille(f); return t > 44 ? +((t - 44) / fs.readFileSync(f).readUInt32LE(28)).toFixed(2) : -1; }

function unePhrase(p, texte, out, timeoutMs) {
  return new Promise(resolve => {
    const avant = new Set();
    try { for (const f of fs.readdirSync(out)) avant.add(f); } catch (e) {}
    const t0 = Date.now();
    let cheminAnnonce = null;
    const onLine = ligne => { if (/\.wav$/i.test(String(ligne).trim())) cheminAnnonce = String(ligne).trim(); };
    const onEnd = () => {};
    p.stdout.on('data', d => String(d).split(/\r?\n/).filter(Boolean).forEach(onLine));
    p.stderr.on('data', onEnd);
    const sonde = setInterval(() => {
      if (!cheminAnnonce) return;
      const t = taille(cheminAnnonce);
      if (t > 44) {
        clearInterval(sonde);
        resolve({ ms: Date.now() - t0, audio_s: seconde(cheminAnnonce), f: cheminAnnonce });
      }
    }, 80);
    p.stdin.write(JSON.stringify({ text: texte }) + '\n');
    setTimeout(() => { if (fs.existsSync(cheminAnnonce || 'x')) {} }, 50);
    setTimeout(() => { clearInterval(sonde); resolve({ ms: -1, audio_s: -1, f: cheminAnnonce, erreur: 'timeout ' + timeoutMs }); }, timeoutMs);
  });
}

async function bench(m) {
  const out = path.join(B, 'cache', 'b2');
  try { fs.mkdirSync(out, { recursive: true }); } catch (e) {}
  const p = spawn(path.join(B, 'piper', 'piper.exe'),
    ['-m', path.join(B, 'voix', m), '--json-input', '-d', out, '--espeak_data', path.join(B, 'piper', 'espeak-ng-data')],
    { windowsHide: true, cwd: B });
  const t0 = Date.now();
  let charge = null;
  p.stderr.on('data', d => {
    const s = String(d);
    const c = s.match(/Loaded voice in ([\d.]+)/);
    if (c && charge === null) charge = +parseFloat(c[1]).toFixed(2);
  });
  for (let i = 0; i < 40 && charge === null; i++) await new Promise(r => setTimeout(r, 500));
  const rss = (() => { try { return Math.round(p.memoryUsage ? p.memoryUsage().rss / 1048576 : 0); } catch (e) { return 0; } })();
  const res = [];
  for (const t of TEXTES) res.push(await unePhrase(p, t, out, 90000));
  try { p.stdin.end(); } catch (e) {}
  try { p.kill(); } catch (e) {}
  return { modele: m.replace('fr_FR-', '').replace('.onnx', ''), charge_s: charge, rss_piper_mo: rss, phrases: res };
}

(async () => {
  for (const m of ['fr_FR-gilles-low.onnx', 'fr_FR-siwis-low.onnx', 'fr_FR-siwis-medium.onnx']) {
    console.log(JSON.stringify(await bench(m)));
  }
})();
