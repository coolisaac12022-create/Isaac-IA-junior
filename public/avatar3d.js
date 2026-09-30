// ---------- Aelyra & Jeanette en 3D — avatars holographiques (WebGL, Three.js local) ----------
// Deux figures de particules flottent de part et d'autre du réacteur : Aelyra (cyan), Jeanette (violet).
// C'est le corps réel de l'interface : la aktive s'avance, respire, et pulse quand elle parle.
// Aucune dépendance Internet : three.min.js est servi en local par le cerveau.
(function () {
  if (!window.THREE) { return; } // reactor CSS garde la main si le moteur 3D manque
  const stage = document.querySelector('.stage');
  if (!stage) return;

  const canvas = document.createElement('canvas');
  canvas.id = 'scene3d';
  stage.insertBefore(canvas, stage.firstChild);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch (e) { canvas.remove(); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 1.55, 5.6);

  const BLEU = 0x3fdcf5, VIOLET = 0xb276ff;

  function nuage(geom, couleur, taille, opacite) {
    return new THREE.Points(geom, new THREE.PointsMaterial({
      color: couleur, size: taille, transparent: true, opacity: opacite,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
  }

  function avatar(couleur) {
    const g = new THREE.Group();
    const tete = nuage(new THREE.SphereGeometry(0.40, 26, 18), couleur, 0.034, 0.95);
    tete.position.y = 1.46;
    const buste = nuage(new THREE.CylinderGeometry(0.28, 0.60, 1.18, 28, 5, true), couleur, 0.030, 0.70);
    buste.position.y = 0.56;
    const halo = nuage(new THREE.TorusGeometry(0.60, 0.013, 8, 96), couleur, 0.022, 0.95);
    halo.position.y = 1.46;
    halo.rotation.x = Math.PI / 2.35;
    const ceinture = nuage(new THREE.TorusGeometry(0.64, 0.012, 8, 96), 0xffffff, 0.020, 0.45);
    ceinture.position.y = 0.02;
    ceinture.rotation.x = Math.PI / 2;
    const coeur = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 14, 14),
      new THREE.MeshBasicMaterial({ color: couleur, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    coeur.position.y = 1.46;
    g.add(tete, buste, halo, ceinture, coeur);
    g.userData = { tete, buste, halo, coeur, parties: [tete, buste, halo, ceinture, coeur], op: {} };
    g.userData.parties.forEach(p => { p.userData.opBase = p.material.opacity; });
    return g;
  }

  const av = { aelyra: avatar(BLEU), jeanette: avatar(VIOLET) };
  av.aelyra.position.x = -1.72;
  av.jeanette.position.x = 1.72;
  scene.add(av.aelyra, av.jeanette);

  // Socles lumineux sous chaque avatar
  const socleGeo = new THREE.RingGeometry(0.55, 0.95, 48);
  const socles = [];
  ['aelyra', 'jeanette'].forEach((k, i) => {
    const m = new THREE.Mesh(socleGeo, new THREE.MeshBasicMaterial({
      color: i ? VIOLET : BLEU, transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false
    }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(i ? 1.72 : -1.72, -0.25, 0);
    scene.add(m);
    socles.push(m);
  });

  let actif = 'aelyra', etat = 'idle';
  let parX = 0, parY = 0;
  const t0 = performance.now() / 1000;

  window.Avatars = {
    setActive(a) { actif = (a === 'jeanette') ? 'jeanette' : 'aelyra'; },
    setState(s) { etat = s || 'idle'; },
    _etat: () => ({ actif, etat }),
    _scene: scene, _renderer: renderer, _camera: camera
  };

  window.addEventListener('pointermove', (e) => {
    parX = e.clientX / window.innerWidth - 0.5;
    parY = e.clientY / window.innerHeight - 0.5;
  }, { passive: true });

  function resize() {
    const w = stage.clientWidth || document.documentElement.clientWidth || window.innerWidth || 900;
    const h = Math.max(stage.clientHeight || Math.round(w * 0.42), 260);
    renderer.setSize(w, h, false);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
  resize();

  function lerp(a, b, t) { return a + (b - a) * t; }

  function tick() {
    requestAnimationFrame(tick);
    if (document.hidden) return;
    const t = performance.now() / 1000 - t0;

    ['aelyra', 'jeanette'].forEach((k, i) => {
      const g = av[k], u = g.userData;
      const vif = (k === actif);
      let amp = 0.018, spin = 0.35, avance = 0.12, opCible = 0.34, scaleCible = 0.9;
      if (vif) {
        opCible = 1; scaleCible = 1; avance = 0.32;
        if (etat === 'listening') { amp = 0.045; spin = 0.95; }
        else if (etat === 'thinking') { amp = 0.04; spin = 2.1; }
        else if (etat === 'speaking') { amp = 0.11; spin = 0.75; }
      }
      // Pouls de parole : battements irréguliers façon voix (pas un sinus saccadé)
      const parle = (etat === 'speaking' && vif);
      const pouls = parle
        ? 1 + amp * Math.abs(Math.sin(t * 9.3 + i) * Math.sin(t * 3.7) + 0.4 * Math.sin(t * 21))
        : 1 + amp * 0.4 * Math.sin(t * 1.5 + i * 2.1);
      u.tete.scale.setScalar(pouls);
      u.coeur.scale.setScalar(1 + (parle ? 2.4 : 0.9) * amp * Math.abs(Math.sin(t * (parle ? 11 : 2.2))));
      u.halo.rotation.z += 0.012 * spin;
      u.buste.rotation.y += 0.0035 * spin;

      const bob = Math.sin(t * 1.35 + i * 1.7) * 0.05;
      g.position.y = lerp(g.position.y, avance + bob, 0.08);
      g.position.z = lerp(g.position.z, vif ? 0.35 : 0, 0.06);
      g.scale.setScalar(lerp(g.scale.x, scaleCible, 0.07));
      u.parties.forEach(p => {
        p.material.opacity = lerp(p.material.opacity, p.userData.opBase * opCible, 0.08);
      });
      socles[i].material.opacity = lerp(socles[i].material.opacity, (vif ? 0.26 : 0.07) + (parle ? 0.10 * Math.abs(Math.sin(t * 7)) : 0), 0.1);
      socles[i].rotation.z += 0.002 * spin;
    });

    camera.position.x = lerp(camera.position.x, parX * 0.85, 0.05);
    camera.position.y = lerp(camera.position.y, 1.55 - parY * 0.5, 0.05);
    camera.lookAt(0, 1.1, 0);
    renderer.render(scene, camera);
  }
  tick();

  // Sync initiale avec l'agent choisie par l'interface
  document.addEventListener('DOMContentLoaded', () => {});
  if (document.body.classList.contains('mode-jeanette')) window.Avatars.setActive('jeanette');
})();
