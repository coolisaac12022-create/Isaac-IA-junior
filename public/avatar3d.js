// ---------- Aelyra & Jeanette en 3D — avatars holographiques AVEC VISAGE (WebGL, Three.js local) ----------
// Deux figures de particules flottent de part et d'autre du réacteur : Aelyra (cyan), Jeanette (violet).
// Elles ont un VISAGE : yeux qui brillent et clignent, sourcils qui se lèvent à l'écoute,
// bouche qui sourit en veille et s'ouvre et articule quand la voix sort.
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
  function nuageDePositions(tab, couleur, taille, opacite) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(tab, 3));
    return nuage(geom, couleur, taille, opacite);
  }

  function avatar(couleur) {
    const g = new THREE.Group();
    const teteGrp = new THREE.Group();
    teteGrp.position.y = 1.46;

    const tete = nuage(new THREE.SphereGeometry(0.40, 26, 18), couleur, 0.034, 0.9);
    teteGrp.add(tete);

    // Projection d'un point du visage sur la calotte sphérique (rayon 0.40)
    const proj = (x, y) => {
      const z = Math.sqrt(Math.max(0.02, 0.16 - x * x - y * y));
      return new THREE.Vector3(x, y, z * 0.92 + 0.02);
    };

    // --- YEUX : deux perles blanches qui brillent, chacune dans son halo de particules ---
    const mkOeil = () => new THREE.Mesh(
      new THREE.SphereGeometry(0.034, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.98, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    const oeilG = mkOeil(), oeilD = mkOeil();
    oeilG.position.copy(proj(-0.135, 0.055));
    oeilD.position.copy(proj(0.135, 0.055));
    const haloG = nuage(new THREE.SphereGeometry(0.052, 8, 8), couleur, 0.016, 0.8);
    const haloD = haloG.clone();
    haloG.position.copy(oeilG.position); haloD.position.copy(oeilD.position);
    teteGrp.add(oeilG, oeilD, haloG, haloD);

    // --- SOURCILS : arcs de particules au-dessus de chaque oeil ---
    const arcades = new THREE.Group();
    [-0.135, 0.135].forEach((cx) => {
      const tab = [];
      for (let i = 0; i <= 12; i++) {
        const x = -0.052 + i * (0.104 / 12);
        const y = 0.012 - 0.018 * Math.pow(x / 0.052, 2);
        const v = proj(cx + x, 0.118 + y);
        tab.push(v.x, v.y, v.z);
      }
      arcades.add(nuageDePositions(tab, couleur, 0.022, 0.95));
    });
    teteGrp.add(arcades);

    // --- BOUCHE : lèvre supérieure dessinée en sourire, lèvre inférieure mobile ---
    const bouche = new THREE.Group();
    const levSupTab = [];
    for (let i = 0; i <= 16; i++) {
      const x = -0.105 + i * (0.21 / 16);
      const y = -0.070 + 0.026 * Math.pow(x / 0.105, 2); // commissures relevées = sourire
      const v = proj(x, y);
      levSupTab.push(v.x, v.y, v.z);
    }
    const levSup = nuageDePositions(levSupTab, 0xffffff, 0.020, 0.8);
    bouche.add(levSup);
    const levInfGrp = new THREE.Group();
    const levInfTab = [];
    for (let i = 0; i <= 14; i++) {
      const x = -0.088 + i * (0.176 / 14);
      const y = -0.086 + 0.020 * Math.pow(x / 0.088, 2);
      const v = proj(x, y);
      levInfTab.push(v.x, v.y, v.z);
    }
    levInfGrp.add(nuageDePositions(levInfTab, couleur, 0.020, 0.85));
    bouche.add(levInfGrp);
    teteGrp.add(bouche);

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
    g.add(teteGrp, buste, halo, ceinture, coeur);

    const parties = [tete, oeilG, oeilD, haloG, haloD, levSup, levInfGrp.children[0],
      ...arcades.children, buste, halo, ceinture, coeur];
    parties.forEach(p => { p.userData.opBase = p.material.opacity; });
    g.userData = { teteGrp, buste, halo, coeur, oeilG, oeilD, haloG, haloD, arcades, levInfGrp, parties };
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
      const parle = (etat === 'speaking' && vif);

      // Pouls du corps entier quand la voix sort
      const pouls = parle
        ? 1 + amp * Math.abs(Math.sin(t * 9.3 + i) * Math.sin(t * 3.7) + 0.4 * Math.sin(t * 21))
        : 1 + amp * 0.4 * Math.sin(t * 1.5 + i * 2.1);
      u.teteGrp.scale.setScalar(pouls);
      u.coeur.scale.setScalar(1 + (parle ? 2.4 : 0.9) * amp * Math.abs(Math.sin(t * (parle ? 11 : 2.2))));
      u.halo.rotation.z += 0.012 * spin;
      u.buste.rotation.y += 0.0035 * spin;

      // --- VISAGE ---
      // Clignement : chaque agente cligne à son rythme (cycle ~4 s, fermeture 0,12 s)
      const phase = ((t * 0.47 + i * 1.9) % 4);
      const cligne = phase < 0.12 ? 0.18 : 1;
      const sCl = lerp(u.oeilG.scale.y, cligne, 0.45);
      u.oeilG.scale.y = sCl; u.oeilD.scale.y = sCl;
      u.haloG.scale.y = sCl; u.haloD.scale.y = sCl;

      // Bouche : entrouverte et articulée quand elle parle, sourire discret sinon
      const articul = parle
        ? 0.012 + 0.038 * Math.abs(Math.sin(t * 12.3) * 0.6 + Math.sin(t * 19.7) * 0.4)
        : 0.002 + 0.001 * Math.sin(t * 1.3);
      u.levInfGrp.position.y = lerp(u.levInfGrp.position.y, -articul * 2.2, 0.35);

      // Sourcils : se relèvent quand elle écoute Isaac, se reposent sinon
      const cibleSourcil = (etat === 'listening' && vif) ? 0.016 : 0;
      u.arcades.position.y = lerp(u.arcades.position.y, cibleSourcil, 0.08);

      // Regard : la tête suit très légèrement Isaac et la souris, comme une personne
      u.teteGrp.rotation.y = lerp(u.teteGrp.rotation.y, 0.16 * Math.sin(t * 0.5 + i * 2.3) + parX * 0.45, 0.05);
      u.teteGrp.rotation.x = lerp(u.teteGrp.rotation.x, -parY * 0.22, 0.05);

      // Position/opacité d'ensemble
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

  if (document.body.classList.contains('mode-jeanette')) window.Avatars.setActive('jeanette');
})();
