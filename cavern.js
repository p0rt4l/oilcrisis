/* ============================================================
   OIL CRISIS US — 3D Interactive Salt Cavern Visualization
   Three.js WebGL Scene with Rotatable Cavern Cross-Section
   ============================================================ */

function initCavern(oilPercent = 47.6) {
  const container = document.getElementById('cavern-3d');
  if (!container) return;

  // ---- Scene Setup ----
  const scene = new THREE.Scene();
  // Clear scene.background to enable transparent rendering on page background
  scene.fog = new THREE.FogExp2(0x030303, 0.015);

  const width = container.clientWidth;
  const height = container.clientHeight;
  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
  camera.position.set(0, 2, 12);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.setClearColor(0x000000, 0); // Explicitly transparent clear color
  container.appendChild(renderer.domElement);

  // ---- Orbit Controls ----
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enablePan = false;
  controls.minDistance = 6;
  controls.maxDistance = 22;
  controls.minPolarAngle = Math.PI * 0.1;
  controls.maxPolarAngle = Math.PI * 0.85;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.015; // Extremely slow, premium auto-rotation
  controls.target.set(0, 0, 0);

  // Stop auto-rotate on interaction
  renderer.domElement.addEventListener('pointerdown', () => {
    controls.autoRotate = false;
  });

  // ---- Lighting ----
  const ambientLight = new THREE.AmbientLight(0x333340, 1.2);
  scene.add(ambientLight);

  const mainLight = new THREE.DirectionalLight(0xeeeeff, 1.8);
  mainLight.position.set(5, 10, 7);
  mainLight.castShadow = true;
  scene.add(mainLight);

  const rimLight = new THREE.DirectionalLight(0xdc2626, 0.3);
  rimLight.position.set(-5, 3, -5);
  scene.add(rimLight);

  const bottomLight = new THREE.PointLight(0x3b82f6, 0.5, 15);
  bottomLight.position.set(0, -4, 0);
  scene.add(bottomLight);

  // ---- Cavern Profile (lathe geometry) ----
  // Profile points define the right half of the cavern cross-section
  // from bottom to top, then we revolve it around the Y axis
  const cavernProfile = [
    new THREE.Vector2(0.0, -4.2),   // Bottom center point
    new THREE.Vector2(0.4, -4.1),
    new THREE.Vector2(0.9, -3.9),
    new THREE.Vector2(1.4, -3.5),
    new THREE.Vector2(1.8, -3.0),
    new THREE.Vector2(2.2, -2.3),   // Lower bulge
    new THREE.Vector2(2.4, -1.5),
    new THREE.Vector2(2.5, -0.7),   // Widest point
    new THREE.Vector2(2.5, 0.0),
    new THREE.Vector2(2.45, 0.7),
    new THREE.Vector2(2.3, 1.4),
    new THREE.Vector2(2.1, 2.0),
    new THREE.Vector2(1.8, 2.5),
    new THREE.Vector2(1.4, 2.9),
    new THREE.Vector2(1.0, 3.2),
    new THREE.Vector2(0.7, 3.5),    // Narrowing neck
    new THREE.Vector2(0.5, 3.8),
    new THREE.Vector2(0.35, 4.2),   // Wellhead neck
    new THREE.Vector2(0.3, 4.8),
    new THREE.Vector2(0.3, 5.2),    // Top of neck
  ];

  // Create cavern shell (outer wall — translucent salt)
  const cavernGeo = new THREE.LatheGeometry(cavernProfile, 48);
  const saltMat = new THREE.MeshStandardMaterial({
    color: 0x8b7d6b,
    roughness: 0.7,
    metalness: 0.05,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const cavernMesh = new THREE.Mesh(cavernGeo, saltMat);
  scene.add(cavernMesh);

  // Cavern wireframe for geological structure lines
  const wireGeo = new THREE.LatheGeometry(cavernProfile, 24);
  const wireMat = new THREE.MeshBasicMaterial({
    color: 0x6b5f50,
    wireframe: true,
    transparent: true,
    opacity: 0.08,
  });
  const wireMesh = new THREE.Mesh(wireGeo, wireMat);
  scene.add(wireMesh);

  // ---- Fluid Levels Inside Cavern ----
  // Calculate fill heights based on oil percentage
  // The cavern internal height runs from roughly -4.0 to +3.5 (7.5 units usable)
  const cavernBottom = -4.0;
  const cavernTop = 3.5;
  const cavernHeight = cavernTop - cavernBottom;

  // Oil sits ON TOP of brine. Total fluid fills 100% of cavern.
  // oilPercent = percentage of capacity that is oil
  const brinePercent = 100 - oilPercent;
  const brineHeight = cavernHeight * (brinePercent / 100);
  const oilHeight = cavernHeight * (oilPercent / 100);

  const brineTop = cavernBottom + brineHeight;
  const oilTop = brineTop + oilHeight;

  // Function to get cavern radius at a given height
  function getCavernRadiusAt(y) {
    // Find the two closest profile points and interpolate
    for (let i = 0; i < cavernProfile.length - 1; i++) {
      const p1 = cavernProfile[i];
      const p2 = cavernProfile[i + 1];
      if (y >= p1.y && y <= p2.y) {
        const t = (y - p1.y) / (p2.y - p1.y);
        return p1.x + (p2.x - p1.x) * t;
      }
    }
    return 0.3; // Default narrow
  }

  // Create fluid using a series of stacked cylinders that follow the cavern shape
  function createFluidBody(yStart, yEnd, color, opacity, name) {
    const group = new THREE.Group();
    const segments = 30;
    const segHeight = (yEnd - yStart) / segments;

    for (let i = 0; i < segments; i++) {
      const y0 = yStart + i * segHeight;
      const y1 = y0 + segHeight;
      const r0 = getCavernRadiusAt(y0) * 0.92; // Slight inset from wall
      const r1 = getCavernRadiusAt(y1) * 0.92;

      const geo = new THREE.CylinderGeometry(r1, r0, segHeight, 32, 1, true);
      const mat = new THREE.MeshPhysicalMaterial({
        color: color,
        roughness: 0.3,
        metalness: 0.1,
        transparent: true,
        opacity: opacity,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = y0 + segHeight / 2;
      group.add(mesh);
    }

    // Top cap (surface)
    const topRadius = getCavernRadiusAt(yEnd) * 0.92;
    const capGeo = new THREE.CircleGeometry(topRadius, 32);
    const capMat = new THREE.MeshPhysicalMaterial({
      color: color,
      roughness: 0.2,
      metalness: 0.15,
      transparent: true,
      opacity: opacity + 0.15,
      side: THREE.DoubleSide,
    });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.rotation.x = -Math.PI / 2;
    cap.position.y = yEnd;
    group.add(cap);

    // Bottom cap
    const botRadius = getCavernRadiusAt(yStart) * 0.92;
    const botCapGeo = new THREE.CircleGeometry(botRadius, 32);
    const botCap = new THREE.Mesh(botCapGeo, capMat.clone());
    botCap.rotation.x = Math.PI / 2;
    botCap.position.y = yStart;
    group.add(botCap);

    group.name = name;
    return group;
  }

  // Brine (bottom layer — blue-gray)
  const brineBody = createFluidBody(
    cavernBottom, brineTop,
    0x1e3a5f, 0.55, 'brine'
  );
  scene.add(brineBody);

  // Oil (top layer — dark amber/brown)
  const oilBody = createFluidBody(
    brineTop, oilTop,
    0x2a1a0a, 0.7, 'oil'
  );
  scene.add(oilBody);

  // ---- Oil/Brine Interface Line (surface tension) ----
  const interfaceRadius = getCavernRadiusAt(brineTop) * 0.93;
  const interfaceGeo = new THREE.RingGeometry(interfaceRadius - 0.04, interfaceRadius + 0.04, 48);
  const interfaceMat = new THREE.MeshBasicMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
  });
  const interfaceRing = new THREE.Mesh(interfaceGeo, interfaceMat);
  interfaceRing.rotation.x = -Math.PI / 2;
  interfaceRing.position.y = brineTop;
  scene.add(interfaceRing);

  // Oil surface ring
  const oilSurfaceRadius = getCavernRadiusAt(oilTop) * 0.93;
  const oilSurfaceGeo = new THREE.RingGeometry(oilSurfaceRadius - 0.03, oilSurfaceRadius + 0.03, 48);
  const oilSurfaceMat = new THREE.MeshBasicMaterial({
    color: 0x8b6914,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
  });
  const oilSurfaceRing = new THREE.Mesh(oilSurfaceGeo, oilSurfaceMat);
  oilSurfaceRing.rotation.x = -Math.PI / 2;
  oilSurfaceRing.position.y = oilTop;
  scene.add(oilSurfaceRing);

  // ---- Wellhead Pipes ----
  // Central pipe (oil extraction)
  const pipeMat = new THREE.MeshStandardMaterial({
    color: 0x555555,
    roughness: 0.3,
    metalness: 0.8,
  });

  // Oil extraction pipe (runs from the top of the fluid body up through the wellhead and off-screen)
  const oilPipeGeo = new THREE.CylinderGeometry(0.06, 0.06, 7.5, 12);
  const oilPipe = new THREE.Mesh(oilPipeGeo, pipeMat);
  oilPipe.position.set(0.1, 7.05, 0);
  scene.add(oilPipe);

  // Brine injection pipe (extending all the way from the cavern bottom, out of the wellhead, and off-screen)
  const brinePipeGeo = new THREE.CylinderGeometry(0.05, 0.05, 15.0, 12);
  const brinePipe = new THREE.Mesh(brinePipeGeo, pipeMat.clone());
  brinePipe.position.set(-0.1, 3.3, 0.1);
  scene.add(brinePipe);

  // Wellhead cap
  const capHeadGeo = new THREE.CylinderGeometry(0.5, 0.4, 0.4, 8);
  const capHeadMat = new THREE.MeshStandardMaterial({
    color: 0x666666,
    roughness: 0.4,
    metalness: 0.7,
  });
  const capHead = new THREE.Mesh(capHeadGeo, capHeadMat);
  capHead.position.y = 5.4;
  scene.add(capHead);

  // ---- Surrounding Salt Dome (large outer shape) ----
  const domeProfile = [
    new THREE.Vector2(0.0, -6),
    new THREE.Vector2(4.0, -5.5),
    new THREE.Vector2(4.5, -4),
    new THREE.Vector2(4.8, -2),
    new THREE.Vector2(5.0, 0),
    new THREE.Vector2(4.8, 2),
    new THREE.Vector2(4.5, 3.5),
    new THREE.Vector2(4.0, 5),
    new THREE.Vector2(3.5, 6),
    new THREE.Vector2(3.0, 6.5),
  ];
  const domeGeo = new THREE.LatheGeometry(domeProfile, 32);
  const domeMat = new THREE.MeshPhysicalMaterial({
    color: 0x3d3428,
    roughness: 0.9,
    metalness: 0.0,
    transparent: true,
    opacity: 0.09,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const domeMesh = new THREE.Mesh(domeGeo, domeMat);
  scene.add(domeMesh);

  // ---- Ground Plane Reference ----
  // Removed ground plane to eliminate hard boundaries and merge seamlessly with the page void

  // ---- 3D Text Labels (using sprites) ----
  function createLabel(text, position, color = '#e0e0e0', size = 0.6) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 128;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Set font first for accurate measurement
    ctx.font = 'bold 36px Inter, system-ui, sans-serif';

    // Background pill (dynamic width based on text length)
    ctx.fillStyle = 'rgba(8, 8, 8, 0.75)';
    const textWidth = ctx.measureText(text).width;
    const pillWidth = Math.min(textWidth + 60, canvas.width - 40);
    const pillX = (canvas.width - pillWidth) / 2;
    
    roundRect(ctx, pillX, 20, pillWidth, canvas.height - 40, 16);
    ctx.fill();

    // Border
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    roundRect(ctx, pillX, 20, pillWidth, canvas.height - 40, 16);
    ctx.stroke();

    // Text
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;

    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.copy(position);
    sprite.scale.set(size * 3.5, size * 0.9, 1);

    return sprite;
  }

  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.arcTo(x + width, y, x + width, y + radius, radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
    ctx.lineTo(x + radius, y + height);
    ctx.arcTo(x, y + height, x, y + height - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
  }

  // Position labels outside the cavern
  const oilLabelY = brineTop + oilHeight / 2;
  const brineLabelY = cavernBottom + brineHeight / 2;

  scene.add(createLabel('CRUDE OIL', new THREE.Vector3(3.5, oilLabelY, 0), '#c9860a', 0.5));
  scene.add(createLabel('BRINE (SALTWATER)', new THREE.Vector3(3.5, brineLabelY, 0), '#3b82f6', 0.5));
  scene.add(createLabel('SALT DOME', new THREE.Vector3(4.2, 4.5, 2), '#6b5f50', 0.4));
  scene.add(createLabel('WELLHEAD', new THREE.Vector3(1.8, 5.5, 0), '#888888', 0.35));

  // ---- Depth markers ----
  const depthLabel1 = createLabel('2,000 ft', new THREE.Vector3(-3.8, 2.5, 0), '#3a3a3a', 0.3);
  scene.add(depthLabel1);
  const depthLabel2 = createLabel('4,000 ft', new THREE.Vector3(-3.8, -2.5, 0), '#3a3a3a', 0.3);
  scene.add(depthLabel2);

  // ---- Particle Effect (subtle floating sediment in oil) ----
  const particleCount = 80;
  const particleGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);

  for (let i = 0; i < particleCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const y = brineTop + Math.random() * oilHeight * 0.8;
    const maxR = getCavernRadiusAt(y) * 0.7;
    const r = Math.random() * maxR;

    positions[i * 3] = Math.cos(angle) * r;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = Math.sin(angle) * r;
  }

  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const particleMat = new THREE.PointsMaterial({
    color: 0x8b6914,
    size: 0.04,
    transparent: true,
    opacity: 0.35,
    sizeAttenuation: true,
  });
  const particles = new THREE.Points(particleGeo, particleMat);
  scene.add(particles);

  // ---- Animation Loop ----
  let time = 0;

  function animate() {
    requestAnimationFrame(animate);
    time += 0.005;

    // Subtle fluid shimmer
    if (oilBody.children.length > 0) {
      oilBody.children.forEach((child, i) => {
        if (child.material && child.material.opacity) {
          child.material.opacity = 0.65 + Math.sin(time * 2 + i * 0.3) * 0.05;
        }
      });
    }

    // Particle drift
    const posAttr = particleGeo.getAttribute('position');
    for (let i = 0; i < particleCount; i++) {
      posAttr.array[i * 3 + 1] += Math.sin(time + i) * 0.001;
      // Keep within bounds
      if (posAttr.array[i * 3 + 1] > oilTop) posAttr.array[i * 3 + 1] = brineTop + 0.1;
      if (posAttr.array[i * 3 + 1] < brineTop) posAttr.array[i * 3 + 1] = oilTop - 0.1;
    }
    posAttr.needsUpdate = true;

    controls.update();
    renderer.render(scene, camera);
  }

  animate();

  // ---- Responsive Resize ----
  const resizeObserver = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
  resizeObserver.observe(container);

  // ---- Intersection Observer (pause when not visible) ----
  let isVisible = true;
  const visObserver = new IntersectionObserver((entries) => {
    isVisible = entries[0].isIntersecting;
    if (isVisible) animate();
  }, { threshold: 0.1 });
  visObserver.observe(container);
}
