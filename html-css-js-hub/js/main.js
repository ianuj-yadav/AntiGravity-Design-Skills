// ==========================================================================
// Universal UI/UX Design System Hub — Vanilla JS Engine
// ==========================================================================

function switchTab(tabId) {
  const tabs = document.querySelectorAll('.section-tab');
  const buttons = document.querySelectorAll('.nav-btn');

  buttons.forEach(btn => {
    if (btn.getAttribute('onclick').includes(tabId)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  tabs.forEach(tab => {
    if (tabId === 'all') {
      tab.classList.add('active');
    } else {
      if (tab.id === 'tab-' + tabId) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    }
  });

  // Animate displayed tab content with GSAP
  if (typeof gsap !== 'undefined') {
    gsap.fromTo('.section-tab.active', { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' });
  }
}

function copyStitchPrompt() {
  const promptEl = document.getElementById('stitch-prompt-text');
  if (promptEl) {
    navigator.clipboard.writeText(promptEl.innerText);
    alert('Google Stitch MCP Prompt copied to clipboard!');
  }
}

// Initialize Three.js 3D Floating Particles on #canvas-container
window.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('canvas-container');
  if (!container || typeof THREE === 'undefined') return;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
  camera.position.z = 7;

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const pointLight1 = new THREE.PointLight(0x818cf8, 1.5);
  pointLight1.position.set(10, 10, 10);
  scene.add(pointLight1);

  const count = 25;
  const geometry = new THREE.OctahedronGeometry(0.8, 0);
  const material = new THREE.MeshStandardMaterial({
    color: 0x818cf8,
    emissive: 0x4f46e5,
    emissiveIntensity: 0.5,
    roughness: 0.2,
    metalness: 0.8
  });

  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  scene.add(mesh);

  let clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + time * 0.2;
      const radius = 3.5 + Math.sin(time + i) * 0.4;
      dummy.position.set(
        Math.cos(angle) * radius,
        Math.sin(time * 0.8 + i) * 1.5,
        Math.sin(angle) * radius - 2
      );
      dummy.rotation.set(time * 0.5 + i, time * 0.3, 0);
      dummy.scale.setScalar(0.2 + Math.sin(time * 2 + i) * 0.05);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    renderer.render(scene, camera);
  }

  animate();

  window.addEventListener('resize', () => {
    if (!container) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });
});
