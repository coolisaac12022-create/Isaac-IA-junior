// ---------- Aelyra & Jeanette en 3D — VRAIS VISAGES HUMAINS holographiques (WebGL, Three.js local) ----------
// Le corps est une figure de particules ; le VISAGE est un vrai portrait humain (1024x1280),
// plaqué en texture lumineuse : il suit la souris, pulse et s'illumine quand la voix sort.
// Si le portrait manque (fichier effacé), la tête de particules reprend la main — jamais d'écran vide.
// Aucune dépendance Internet : three.min.js et les portraits sont servis en local par le cerveau.
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
  camera.position.set(0, 1.55, 4.9);

  const BLEU = 0x3fdcf5, VIOLET = 0xb276ff, ROUGE = 0xef4444, VERT = 0x34d399;

  function nuage(geom, couleur, taille, opacite) {
    return new THREE.Points(geom, new THREE.PointsMaterial({
      color: couleur, size: taille, transparent: true, opacity: opacite,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
  }

  function avatar(couleur, portraitUrl) {
    const g = new THREE.Group();
    const teteGrp = new THREE.Group();
    teteGrp.position.y = 1.52;

    // Tête de secours (particules) — visible tant que le portrait n'est pas chargé
    const teteSecours = nuage(new THREE.SphereGeometry(0.48, 26, 18), couleur, 0.034, 0.9);
    teteGrp.add(teteSecours);

    // LE VRAIS VISAGE : portrait humain en planche lumineuse (additif = fond noir transparent)
    const portrait = new THREE.Mesh(
      new THREE.PlaneGeometry(1.32, 1.65),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    portrait.position.z = 0.02;
    teteGrp.add(portrait);
    new THREE.TextureLoader().load(portraitUrl, (tex) => {
      portrait.material.map = tex;
      portrait.material.opacity = 0.97;
      portrait.material.needsUpdate = true;
      teteSecours.visible = false;
    }, undefined, () => { /* le portrait manque : les particules restent, l'interface ne casse jamais */ });

    const buste = nuage(new THREE.CylinderGeometry(0.28, 0.60, 1.18, 28, 5, true), couleur, 0.030, 0.70);
    buste.position.y = 0.56;
    const halo = nuage(new THREE.TorusGeometry(0.72, 0.013, 8, 96), couleur, 0.022, 0.95);
    halo.position.set(0, 1.62, -0.12);
    halo.rotation.x = Math.PI / 2.35;
    const ceinture = nuage(new THREE.TorusGeometry(0.64, 0.012, 8, 96), 0xffffff, 0.020, 0.45);
    ceinture.position.y = 0.02;
    ceinture.rotation.x = Math.PI / 2;
    const coeur = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 14, 14),
      new THREE.MeshBasicMaterial({ color: couleur, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    coeur.position.y = 0.92;
    g.add(teteGrp, buste, coeur);
    g.add(halo); halo.position.set(0, 1.62, -0.12);
    g.add(ceinture);

    const parties = [teteSecours, portrait, buste, halo, ceinture, coeur];
    parties.forEach(p => { p.userData.opBase = p.material.opacity; });
    g.userData = { teteGrp, buste, halo, coeur, portrait, teteSecours, parties };
    return g;
  }

  // L'équipe au complet : 4 stations — Aelyra (cyan), Jeanette (violet), Onyx (rouge), Aegis (vert)
  const EQUIPE = [
    { k: 'aelyra',   c: BLEU,   x: -2.85, src: 'avatars/aelyra.png' },
    { k: 'jeanette', c: VIOLET, x: -0.95, src: 'avatars/jeanette.png' },
    { k: 'onyx',     c: ROUGE,  x: 0.95,  src: 'avatars/onyx.png' },
    { k: 'aegis',    c: VERT,   x: 2.85,  src: 'avatars/aegis.png' },
  ];
  const av = {};
  EQUIPE.forEach((m) => {
    av[m.k] = avatar(m.c, m.src);
    av[m.k].position.x = m.x;
    scene.add(av[m.k]);
  });

  // Socles lumineux sous chaque avatar
  const socleGeo = new THREE.RingGeometry(0.42, 0.74, 48);
  const socles = [];
  EQUIPE.forEach((m) => {
    const s = new THREE.Mesh(socleGeo, new THREE.MeshBasicMaterial({
      color: m.c, transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false
    }));
    s.rotation.x = -Math.PI / 2;
    s.position.set(m.x, -0.25, 0);
    scene.add(s);
    socles.push(s);
  });

  let actif = 'aelyra', etat = 'idle';
  let parX = 0, parY = 0;
  const t0 = performance.now() / 1000;

  window.Avatars = {
    setActive(a) { actif = av[a] ? a : 'aelyra'; },
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

    EQUIPE.forEach((m, i) => {
      const k = m.k;
      const g = av[k], u = g.userData;
      const vif = (k === actif);
      let amp = 0.018, spin = 0.35, avance = 0.12, opCible = 0, scaleCible = 0.82;
      if (vif) {
        opCible = 1; scaleCible = 1; avance = 0.32;
        if (etat === 'listening') { amp = 0.045; spin = 0.95; }
        else if (etat === 'thinking') { amp = 0.04; spin = 2.1; }
        else if (etat === 'speaking') { amp = 0.11; spin = 0.75; }
      }
      const parle = (etat === 'speaking' && vif);

      // Le visage pulse et s'illumine quand la voix sort
      const pouls = parle
        ? 1 + amp * Math.abs(Math.sin(t * 9.3 + i) * Math.sin(t * 3.7) + 0.4 * Math.sin(t * 21))
        : 1 + amp * 0.4 * Math.sin(t * 1.5 + i * 2.1);
      u.teteGrp.scale.setScalar(pouls);
      if (u.portrait.material.map) {
        u.portrait.material.opacity = lerp(u.portrait.material.opacity,
          (vif ? 0.99 : 0) + (parle ? 0.05 * Math.abs(Math.sin(t * 13)) : 0.02 * Math.sin(t * 1.2)), 0.25);
      }
      u.coeur.scale.setScalar(1 + (parle ? 2.4 : 0.9) * amp * Math.abs(Math.sin(t * (parle ? 11 : 2.2))));
      u.halo.rotation.z += 0.012 * spin;
      u.buste.rotation.y += 0.0035 * spin;

      // Le regard suit Isaac : la tête se tourne doucement vers la souris, comme une personne
      u.teteGrp.rotation.y = lerp(u.teteGrp.rotation.y, 0.14 * Math.sin(t * 0.5 + i * 2.3) + parX * 0.40, 0.05);
      u.teteGrp.rotation.x = lerp(u.teteGrp.rotation.x, -parY * 0.18, 0.05);

      const bob = Math.sin(t * 1.35 + i * 1.7) * 0.05;
      g.position.y = lerp(g.position.y, avance + bob, 0.08);
      g.position.z = lerp(g.position.z, vif ? 0.35 : 0, 0.06);
      g.scale.setScalar(lerp(g.scale.x, scaleCible, 0.07));
      u.parties.forEach(p => {
        if (p === u.portrait && p.material.map) return; // géré par l'illumination de parole
        p.material.opacity = lerp(p.material.opacity, p.userData.opBase * opCible, 0.08);
      });
      socles[i].material.opacity = lerp(socles[i].material.opacity, (vif ? 0.26 : 0.07) + (parle ? 0.10 * Math.abs(Math.sin(t * 7)) : 0), 0.1);
      socles[i].rotation.z += 0.002 * spin;
    });

    // Une seule face à l'écran : la caméra se pose droit devant l'agente appelée
    const xVif = (av[actif] ? av[actif].position.x : 0);
    camera.position.x = lerp(camera.position.x, xVif + parX * 0.85, 0.12);
    camera.position.y = lerp(camera.position.y, 1.55 - parY * 0.5, 0.05);
    camera.lookAt(xVif, 1.1, 0);
    renderer.render(scene, camera);
  }
  tick();

  if (document.body.classList.contains('mode-jeanette')) window.Avatars.setActive('jeanette');
  if (document.body.classList.contains('mode-onyx')) window.Avatars.setActive('onyx');
  if (document.body.classList.contains('mode-aegis')) window.Avatars.setActive('aegis');
})();
