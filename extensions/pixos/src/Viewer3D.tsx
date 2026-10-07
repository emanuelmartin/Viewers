import React, { useEffect, useRef, useState } from 'react';

type Part = { name: string; visible: boolean; color: string };
type Scene3D = { meshes: any[]; renderer: any; camera: any; controls: any; center: any; size: number };

/** three.js, its glTF loader and orbit controls, loaded on demand (outside the component: the compiler does not lower import()). */
function loadThree() {
  return Promise.all([
    import('three'),
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/controls/OrbitControls.js'),
  ]).then(([THREE, gltf, orbit]) => ({ THREE, GLTFLoader: gltf.GLTFLoader, OrbitControls: orbit.OrbitControls }));
}

const btn = 'rounded border border-white/20 px-2 py-1 text-[12px] text-white hover:bg-white/10 disabled:opacity-40';

/**
 * Interactive 3D view of an AI segmentation: the surfaces the AI service exports as binary glTF (one named, coloured
 * mesh per structure; x = patient left, y = superior, z = anterior). Structures can be switched on and off, made
 * translucent, viewed from standard directions or rotated freely, and the view saved as a PNG. three.js is loaded
 * only when the view opens.
 */
export default function Viewer3D({ url, title }: { url: string; title: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene3D | null>(null);
  const [parts, setParts] = useState<Part[]>([]);
  const [opacity, setOpacity] = useState(1);
  const [status, setStatus] = useState('Cargando superficies 3D…');

  useEffect(() => {
    let disposed = false;
    let frame = 0;
    let cleanup = () => {};
    (async () => {
      const { THREE, GLTFLoader, OrbitControls } = await loadThree();
      const el = mountRef.current;
      if (!el || disposed) {
        return;
      }
      const w = el.clientWidth;
      const h = el.clientHeight;
      const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(w, h);
      renderer.setClearColor(0x000000);
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x333333, 1.3));
      const camera = new THREE.PerspectiveCamera(35, w / h, 1, 10000);
      const key = new THREE.DirectionalLight(0xffffff, 1.4);
      key.position.set(1, 1, 2);
      camera.add(key);
      scene.add(camera);
      const controls = new OrbitControls(camera, renderer.domElement);
      const gltf = await new GLTFLoader().loadAsync(url);
      if (disposed) {
        renderer.dispose();
        return;
      }
      const root = gltf.scene;
      scene.add(root);
      const box = new THREE.Box3().setFromObject(root);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3()).length();
      controls.target.copy(center);
      camera.position.set(center.x, center.y, center.z + size * 1.3);
      camera.near = size / 200;
      camera.far = size * 20;
      camera.updateProjectionMatrix();
      const meshes: any[] = [];
      root.traverse((o: any) => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.transparent = true;
          o.material.side = THREE.DoubleSide;
          meshes.push(o);
        }
      });
      sceneRef.current = { meshes, renderer, camera, controls, center, size };
      setParts(meshes.map(m => ({ name: m.name || m.parent?.name || 'estructura', visible: true, color: `#${m.material.color.getHexString()}` })));
      setStatus('');
      const loop = () => {
        controls.update();
        renderer.render(scene, camera);
        frame = requestAnimationFrame(loop);
      };
      loop();
      cleanup = () => {
        cancelAnimationFrame(frame);
        controls.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode === el) {
          el.removeChild(renderer.domElement);
        }
      };
    })().catch(e => setStatus(`No se pudo cargar la vista 3D: ${e?.message || e}`));
    return () => {
      disposed = true;
      cleanup();
    };
  }, [url]);

  const setVisible = (index: number | null, visible: boolean) => {
    const s = sceneRef.current;
    if (!s) {
      return;
    }
    s.meshes.forEach((m, i) => {
      if (index === null || i === index) {
        m.visible = visible;
      }
    });
    setParts(prev => prev.map((p, i) => (index === null || i === index ? { ...p, visible } : p)));
  };

  const changeOpacity = (value: number) => {
    setOpacity(value);
    sceneRef.current?.meshes.forEach(m => {
      m.material.opacity = value;
      m.material.depthWrite = value > 0.95;
    });
  };

  // Standard directions in the export's axes (x = left, y = superior, z = anterior)
  const view = (dir: [number, number, number]) => {
    const s = sceneRef.current;
    if (!s) {
      return;
    }
    const d = s.size * 1.3;
    s.camera.position.set(s.center.x + dir[0] * d, s.center.y + dir[1] * d, s.center.z + dir[2] * d);
    s.camera.up.set(0, dir[1] ? 0 : 1, dir[1] ? -1 : 0);
    s.controls.target.copy(s.center);
    s.controls.update();
  };

  const capture = () => {
    const s = sceneRef.current;
    if (!s) {
      return;
    }
    const a = document.createElement('a');
    a.href = s.renderer.domElement.toDataURL('image/png');
    a.download = `${title.replace(/[^\wáéíóúñ ]+/gi, '').trim() || 'vista-3d'}.png`;
    a.click();
  };

  return (
    <div className="flex h-[75vh] w-[min(1200px,85vw)] gap-3 text-white">
      <div ref={mountRef} className="relative min-w-0 flex-1 rounded border border-white/10 bg-black">
        {status && <div className="absolute inset-0 flex items-center justify-center text-[13px] text-white/70">{status}</div>}
      </div>
      <div className="ohif-scrollbar flex w-64 shrink-0 flex-col gap-2 overflow-y-auto text-[12px]">
        <div className="text-white/60">Resultado automático, no diagnóstico. Arrastre para rotar, rueda para acercar.</div>
        <div className="flex flex-wrap gap-1">
          <button className={btn} onClick={() => view([0, 0, 1])}>Anterior</button>
          <button className={btn} onClick={() => view([0, 0, -1])}>Posterior</button>
          <button className={btn} onClick={() => view([-1, 0, 0])}>Lat. der.</button>
          <button className={btn} onClick={() => view([1, 0, 0])}>Lat. izq.</button>
          <button className={btn} onClick={() => view([0, 1, 0])}>Superior</button>
        </div>
        <label className="flex items-center gap-2">
          <span className="text-white/70">Opacidad</span>
          <input type="range" min={0.15} max={1} step={0.05} value={opacity} onChange={e => changeOpacity(Number(e.target.value))} />
        </label>
        <div className="flex gap-1">
          <button className={btn} onClick={() => setVisible(null, true)}>Todo</button>
          <button className={btn} onClick={() => setVisible(null, false)}>Nada</button>
          <button className={btn} onClick={capture}>Guardar PNG</button>
        </div>
        {parts.map((p, i) => (
          <label key={`${p.name}-${i}`} className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={p.visible} onChange={e => setVisible(i, e.target.checked)} />
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: p.color }} />
            <span>{p.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
