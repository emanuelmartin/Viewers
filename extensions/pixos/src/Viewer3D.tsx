import React, { useEffect, useRef, useState } from 'react';
import { showPointEverywhere } from './navigate';

type V3 = [number, number, number];
type Stat = { label: string; volume_ml: number; mean: number; unit: string; extent_mm?: number[] };
type Part = {
  name: string;
  visible: boolean;
  opacity: number;
  color: string;
  stat: Stat | null;
  /** From the closed surface when the result carries no statistics */
  meshMl: number;
  size: V3;
  centre: V3;
};
type Tool = 'select' | 'distance' | 'angle';
type Measure = { id: number; kind: 'distance' | 'angle'; points: V3[]; value: number };
type Scene3D = {
  THREE: any;
  meshes: any[];
  renderer: any;
  camera: any;
  controls: any;
  center: any;
  size: number;
  overlay: any;
  labels: Array<{ el: HTMLDivElement; anchor: any }>;
};

/** three.js, its glTF loader and orbit controls, loaded on demand (outside the component: the compiler does not lower import()). */
function loadThree() {
  return Promise.all([
    import('three'),
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/controls/OrbitControls.js'),
  ]).then(([THREE, gltf, orbit]) => ({ THREE, GLTFLoader: gltf.GLTFLoader, OrbitControls: orbit.OrbitControls }));
}

const normal = (s: string) => String(s || '').replace(/[\s_]+/g, ' ').trim().toLowerCase();
const fmt = (n: number, d = 1) => Number(n).toLocaleString('es-MX', { maximumFractionDigits: d });

/** Enclosed volume of a closed triangle mesh (divergence theorem), in ml; the export is in mm. */
function meshVolumeMl(geometry: any): number {
  const pos = geometry.attributes.position.array;
  const index = geometry.index?.array;
  const count = index ? index.length : pos.length / 3;
  let v = 0;
  for (let t = 0; t < count; t += 3) {
    const a = 3 * (index ? index[t] : t);
    const b = 3 * (index ? index[t + 1] : t + 1);
    const c = 3 * (index ? index[t + 2] : t + 2);
    v += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1])
      - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c])
      + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
  }
  return Math.abs(v) / 6 / 1000;
}

const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function angle(a: V3, v: V3, c: V3): number {
  const u = [a[0] - v[0], a[1] - v[1], a[2] - v[2]];
  const w = [c[0] - v[0], c[1] - v[1], c[2] - v[2]];
  const cos = (u[0] * w[0] + u[1] * w[1] + u[2] * w[2]) / (Math.hypot(...u) * Math.hypot(...w) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}
/** The export's axes (x = patient left, y = superior, z = anterior) to patient LPS. */
const toLps = (p: V3): V3 => [p[0], -p[2], p[1]];
const measureText = (m: Measure, n: number) => (m.kind === 'distance' ? `D${n}: ${fmt(m.value)} mm` : `Á${n}: ${fmt(m.value)}°`);

const btn = 'rounded border border-white/20 bg-black/60 px-2 py-0.5 text-[11px] text-white hover:bg-white/15 disabled:opacity-40';
const btnOn = 'rounded border border-primary bg-primary/70 px-2 py-0.5 text-[11px] text-white';
const HINT: Record<Tool, string> = {
  select: 'Clic en una estructura para ver sus datos; arrastre para rotar, rueda para acercar, clic derecho para mover.',
  distance: 'Distancia: clic en dos puntos de las superficies.',
  angle: 'Ángulo: clic en tres puntos; el segundo es el vértice.',
};

type Props = {
  url: string;
  title: string;
  stats?: Stat[];
  /** In the viewer grid: clicks on surfaces can move the image viewports to that point */
  servicesManager?: any;
  onReady?: () => void;
};

/**
 * Interactive 3D view of an AI segmentation: the surfaces the AI service exports as binary glTF (one named, coloured
 * mesh per structure; coordinates in mm). It fills its container, so it works as a viewport of the grid. Structures
 * can be selected (volume, density and size), switched on and off, isolated and made translucent one by one or all
 * together; distances and angles are measured on the surfaces in mm; a click can take the image viewports to that
 * point; standard views and a PNG (with the measurements) are available. three.js is loaded only when it opens.
 */
export default function Viewer3D({ url, title, stats, servicesManager, onReady }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene3D | null>(null);
  const pickRef = useRef<(point: V3 | null, index: number | null) => void>(() => {});
  const nextId = useRef(1);
  const [parts, setParts] = useState<Part[]>([]);
  const [status, setStatus] = useState('Cargando superficies 3D…');
  const [tool, setTool] = useState<Tool>('select');
  const [selected, setSelected] = useState<number | null>(null);
  const [pending, setPending] = useState<V3[]>([]);
  const [measures, setMeasures] = useState<Measure[]>([]);
  const [panel, setPanel] = useState(true);
  const [sync, setSync] = useState(true);
  const [opacity, setOpacity] = useState(1);
  // The grid passes a new onReady on every render: the scene must not be rebuilt for it
  const latest = useRef({ stats, onReady });
  useEffect(() => {
    latest.current = { stats, onReady };
  });

  // Scene, surfaces, picking and the render loop
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
      const w = el.clientWidth || 600;
      const h = el.clientHeight || 400;
      setPanel(w > 620);
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
      const overlay = new THREE.Group();
      scene.add(overlay);
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
          // Older exports carry no normals: without them the lit material renders black
          if (!o.geometry.attributes.normal) {
            o.geometry.computeVertexNormals();
          }
          o.material = o.material.clone();
          o.material.transparent = true;
          o.material.side = THREE.DoubleSide;
          meshes.push(o);
        }
      });
      const byLabel = new Map((latest.current.stats || []).map(s => [normal(s.label), s]));
      sceneRef.current = { THREE, meshes, renderer, camera, controls, center, size, overlay, labels: [] };
      setParts(meshes.map(m => {
        const name = String(m.name || m.parent?.name || 'estructura');
        const b = new THREE.Box3().setFromObject(m);
        const c = b.getCenter(new THREE.Vector3());
        const s = b.getSize(new THREE.Vector3());
        return {
          name: name.replace(/_/g, ' '),
          visible: true,
          opacity: 1,
          color: `#${m.material.color.getHexString()}`,
          stat: byLabel.get(normal(name)) || byLabel.get(normal(m.parent?.name)) || null,
          meshMl: meshVolumeMl(m.geometry),
          size: [s.x, s.y, s.z],
          centre: [c.x, c.y, c.z],
        };
      }));
      setStatus('');
      latest.current.onReady?.();

      // A click (not a drag) picks the visible surface under the pointer
      const raycaster = new THREE.Raycaster();
      let down: [number, number] | null = null;
      const onDown = (e: PointerEvent) => {
        down = e.button === 0 ? [e.clientX, e.clientY] : null;
      };
      const onUp = (e: PointerEvent) => {
        if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) {
          return;
        }
        const r = renderer.domElement.getBoundingClientRect();
        raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
        const hit = raycaster.intersectObjects(meshes.filter(m => m.visible), false)[0];
        pickRef.current(hit ? [hit.point.x, hit.point.y, hit.point.z] : null, hit ? meshes.indexOf(hit.object) : null);
      };
      renderer.domElement.addEventListener('pointerdown', onDown);
      renderer.domElement.addEventListener('pointerup', onUp);

      const resize = new ResizeObserver(() => {
        const cw = el.clientWidth;
        const ch = el.clientHeight;
        if (cw && ch) {
          renderer.setSize(cw, ch);
          camera.aspect = cw / ch;
          camera.updateProjectionMatrix();
        }
      });
      resize.observe(el);
      const v = new THREE.Vector3();
      const loop = () => {
        controls.update();
        renderer.render(scene, camera);
        // Measurement labels follow their points on screen
        const s = sceneRef.current;
        s?.labels.forEach(l => {
          v.copy(l.anchor).project(camera);
          const visible = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
          l.el.style.display = visible ? '' : 'none';
          l.el.style.transform = `translate(${((v.x + 1) / 2) * el.clientWidth + 8}px, ${((1 - v.y) / 2) * el.clientHeight - 8}px)`;
        });
        frame = requestAnimationFrame(loop);
      };
      loop();
      cleanup = () => {
        resize.disconnect();
        cancelAnimationFrame(frame);
        renderer.domElement.removeEventListener('pointerdown', onDown);
        renderer.domElement.removeEventListener('pointerup', onUp);
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
      sceneRef.current = null;
    };
  }, [url]);

  // What a pick does depends on the tool (assigned after every render so it sees the current state)
  useEffect(() => {
    pickRef.current = (point, index) => {
      if (tool === 'select') {
        setSelected(index);
        if (point && sync && servicesManager) {
          showPointEverywhere(servicesManager, toLps(point), index !== null ? parts[index]?.name || '' : '');
        }
        return;
      }
      if (!point) {
        return;
      }
      const need = tool === 'distance' ? 2 : 3;
      const points = [...pending, point];
      if (points.length < need) {
        setPending(points);
        return;
      }
      const value = tool === 'distance' ? dist(points[0], points[1]) : angle(points[0], points[1], points[2]);
      const id = nextId.current++;
      setMeasures(prev => [...prev, { id, kind: tool, points, value }]);
      setPending([]);
    };
  });

  // Visibility, opacity and the highlight of the selected structure
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) {
      return;
    }
    s.meshes.forEach((m, i) => {
      const p = parts[i];
      if (!p) {
        return;
      }
      m.visible = p.visible;
      m.material.opacity = p.opacity;
      m.material.depthWrite = p.opacity > 0.95;
      if (m.material.emissive) {
        m.material.emissive.set(i === selected ? m.material.color : 0x000000);
        m.material.emissiveIntensity = i === selected ? 0.45 : 0;
      }
    });
  }, [parts, selected]);

  // Measurements and pending points: markers, lines and labels
  useEffect(() => {
    const s = sceneRef.current;
    const host = labelsRef.current;
    if (!s || !host) {
      return;
    }
    const { THREE, overlay } = s;
    overlay.children.slice().forEach((o: any) => {
      overlay.remove(o);
      o.geometry?.dispose();
      o.material?.dispose();
    });
    host.replaceChildren();
    s.labels = [];
    const r = s.size / 300;
    const dot = (p: V3, colour: number) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshBasicMaterial({ color: colour, depthTest: false }));
      m.position.set(...p);
      m.renderOrder = 10;
      overlay.add(m);
    };
    const line = (pts: V3[], colour: number) => {
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(...p))),
        new THREE.LineBasicMaterial({ color: colour, depthTest: false }));
      l.renderOrder = 10;
      overlay.add(l);
    };
    measures.forEach((m, n) => {
      m.points.forEach(p => dot(p, 0xfacc15));
      if (m.kind === 'distance') {
        line(m.points, 0xfacc15);
      } else {
        line([m.points[0], m.points[1], m.points[2]], 0xfacc15);
      }
      const anchor = m.kind === 'distance'
        ? new THREE.Vector3().addVectors(new THREE.Vector3(...m.points[0]), new THREE.Vector3(...m.points[1])).multiplyScalar(0.5)
        : new THREE.Vector3(...m.points[1]);
      const el = document.createElement('div');
      el.className = 'pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded bg-black/75 px-1 text-[11px] text-yellow-300';
      el.textContent = measureText(m, n + 1);
      host.appendChild(el);
      s.labels.push({ el, anchor });
    });
    pending.forEach(p => dot(p, 0x22d3ee));
    if (pending.length > 1) {
      line(pending, 0x22d3ee);
    }
  }, [measures, pending, parts.length]);

  // Changing tool drops a half-made measurement
  const chooseTool = (t: Tool) => {
    setTool(t);
    setPending([]);
  };

  const update = (index: number | null, change: Partial<Part>) =>
    setParts(prev => prev.map((p, i) => (index === null || i === index ? { ...p, ...change } : p)));

  const isolate = (index: number) => setParts(prev => prev.map((p, i) => ({ ...p, visible: i === index })));

  const changeOpacity = (value: number) => {
    setOpacity(value);
    update(null, { opacity: value });
  };

  // Standard directions in the export's axes (x = left, y = superior, z = anterior)
  const view = (dir: V3, target: V3 | null = null, distance: number | null = null) => {
    const s = sceneRef.current;
    if (!s) {
      return;
    }
    const t = target ? new s.THREE.Vector3(...target) : s.center;
    const d = distance ?? s.size * 1.3;
    s.camera.position.set(t.x + dir[0] * d, t.y + dir[1] * d, t.z + dir[2] * d);
    // From above or below, anterior is up (from below: the patient's right on the left, as in axial images)
    s.camera.up.set(0, dir[1] ? 0 : 1, dir[1] ? 1 : 0);
    s.controls.target.copy(t);
    s.controls.update();
  };

  const focus = (p: Part) => view([0, 0, 1], p.centre, Math.max(...p.size, 30) * 2.2);

  const capture = () => {
    const s = sceneRef.current;
    const host = labelsRef.current;
    if (!s || !host) {
      return;
    }
    // The canvas plus the measurement labels, drawn where they are on screen
    const src = s.renderer.domElement;
    const out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    const ctx = out.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.drawImage(src, 0, 0);
    const scale = src.width / (src.clientWidth || src.width);
    const base = host.getBoundingClientRect();
    ctx.font = `${12 * scale}px sans-serif`;
    s.labels.forEach(l => {
      if (l.el.style.display === 'none') {
        return;
      }
      const b = l.el.getBoundingClientRect();
      const x = (b.left - base.left) * scale;
      const y = (b.top - base.top) * scale;
      const text = l.el.textContent || '';
      ctx.fillStyle = 'rgba(0,0,0,.75)';
      ctx.fillRect(x, y, ctx.measureText(text).width + 6 * scale, 16 * scale);
      ctx.fillStyle = '#fde047';
      ctx.fillText(text, x + 3 * scale, y + 12 * scale);
    });
    ctx.fillStyle = '#fff';
    ctx.fillText(`${title} · resultado automático, no diagnóstico`, 8 * scale, out.height - 8 * scale);
    const a = document.createElement('a');
    a.href = out.toDataURL('image/png');
    a.download = `${title.replace(/[^\wáéíóúñ ]+/gi, '').trim() || 'vista-3d'}.png`;
    a.click();
  };

  const sel = selected !== null ? parts[selected] : null;
  const ready = !status;

  return (
    <div className="relative h-full w-full overflow-hidden bg-black text-white">
      {/* The canvas lives in its own element: React empties an element whose children change, which removed it */}
      <div ref={mountRef} className="absolute inset-0" />
      <div ref={labelsRef} className="pointer-events-none absolute inset-0" />
      {status && <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-[13px] text-white/70">{status}</div>}

      <div className="absolute left-1 top-1 flex max-w-[calc(100%-0.5rem)] flex-wrap items-center gap-1">
        <button className={tool === 'select' ? btnOn : btn} disabled={!ready} onClick={() => chooseTool('select')} title={HINT.select}>Seleccionar</button>
        <button className={tool === 'distance' ? btnOn : btn} disabled={!ready} onClick={() => chooseTool('distance')} title={HINT.distance}>Distancia</button>
        <button className={tool === 'angle' ? btnOn : btn} disabled={!ready} onClick={() => chooseTool('angle')} title={HINT.angle}>Ángulo</button>
        <span className="mx-1 h-4 w-px bg-white/20" />
        <button className={btn} disabled={!ready} onClick={() => view([0, 0, 1])} title="Vista anterior">A</button>
        <button className={btn} disabled={!ready} onClick={() => view([0, 0, -1])} title="Vista posterior">P</button>
        <button className={btn} disabled={!ready} onClick={() => view([-1, 0, 0])} title="Lateral derecha">D</button>
        <button className={btn} disabled={!ready} onClick={() => view([1, 0, 0])} title="Lateral izquierda">I</button>
        <button className={btn} disabled={!ready} onClick={() => view([0, 1, 0])} title="Vista superior">S</button>
        <button className={btn} disabled={!ready} onClick={() => view([0, -1, 0])} title="Vista inferior">Inf</button>
        <span className="mx-1 h-4 w-px bg-white/20" />
        <button className={btn} disabled={!ready} onClick={capture} title="Guardar la vista con las mediciones">PNG</button>
        <button className={panel ? btnOn : btn} onClick={() => setPanel(!panel)} title="Estructuras y mediciones">Estructuras</button>
      </div>

      {ready && (
        <div className="pointer-events-none absolute bottom-1 left-1 max-w-[60%] text-[11px] text-white/60">
          {tool !== 'select' && pending.length > 0 ? `${pending.length} de ${tool === 'distance' ? 2 : 3} puntos · ` : ''}
          {HINT[tool]}
          <div>{title} · resultado automático, no diagnóstico</div>
        </div>
      )}

      {sel && selected !== null && (
        <div className="absolute bottom-10 left-1 w-60 rounded border border-white/15 bg-black/80 p-2 text-[11px]">
          <div className="mb-1 flex items-center gap-2">
            <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: sel.color }} />
            <b className="truncate text-[12px]">{sel.name}</b>
            <button className="ml-auto text-white/60 hover:text-white" onClick={() => setSelected(null)} title="Cerrar">✕</button>
          </div>
          {sel.stat ? (
            <>
              <div>Volumen: {fmt(sel.stat.volume_ml)} ml</div>
              {sel.stat.unit && <div>Densidad media: {fmt(sel.stat.mean, 0)} {sel.stat.unit}</div>}
              {sel.stat.extent_mm?.length ? <div>Extensión máxima: {fmt(sel.stat.extent_mm[0], 0)} mm</div> : null}
            </>
          ) : (
            <div>Volumen aprox. (superficie): {fmt(sel.meshMl)} ml</div>
          )}
          <div className="text-white/60">Caja: {sel.size.map(n => fmt(n, 0)).join(' × ')} mm (I-D × S-I × A-P)</div>
          <label className="mt-1 flex items-center gap-2">
            <span className="text-white/70">Opacidad</span>
            <input className="min-w-0 flex-1" type="range" min={0.1} max={1} step={0.05} value={sel.opacity}
              onChange={e => update(selected, { opacity: Number(e.target.value) })} />
          </label>
          <div className="mt-1 flex flex-wrap gap-1">
            <button className={btn} onClick={() => update(selected, { visible: !sel.visible })}>{sel.visible ? 'Ocultar' : 'Mostrar'}</button>
            <button className={btn} onClick={() => isolate(selected)}>Aislar</button>
            <button className={btn} onClick={() => focus(sel)}>Acercar</button>
            {servicesManager && (
              <button className={btn} onClick={() => showPointEverywhere(servicesManager, toLps(sel.centre), sel.name)}>Ver en cortes</button>
            )}
          </div>
        </div>
      )}

      {panel && (
        <div className="ohif-scrollbar absolute bottom-1 right-1 top-8 flex w-56 flex-col gap-1 overflow-y-auto rounded border border-white/15 bg-black/80 p-2 text-[11px]">
          <label className="flex items-center gap-2">
            <span className="text-white/70">Opacidad</span>
            <input className="min-w-0 flex-1" type="range" min={0.1} max={1} step={0.05} value={opacity} onChange={e => changeOpacity(Number(e.target.value))} />
          </label>
          <div className="flex flex-wrap gap-1">
            <button className={btn} onClick={() => update(null, { visible: true })}>Todo</button>
            <button className={btn} onClick={() => update(null, { visible: false })}>Nada</button>
            {servicesManager && (
              <label className="flex cursor-pointer items-center gap-1" title="Un clic en una superficie lleva las series de imagen a ese punto">
                <input type="checkbox" checked={sync} onChange={e => setSync(e.target.checked)} /> Clic → cortes
              </label>
            )}
          </div>
          {parts.map((p, i) => (
            <div key={`${p.name}-${i}`} className={`flex items-center gap-1 rounded px-1 ${i === selected ? 'bg-white/15' : ''}`}>
              <input type="checkbox" checked={p.visible} onChange={e => update(i, { visible: e.target.checked })} />
              <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: p.color }} />
              <button className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => setSelected(i)} title={p.name}>{p.name}</button>
              <span className="shrink-0 text-white/50">{fmt(p.stat ? p.stat.volume_ml : p.meshMl, 0)} ml</span>
            </div>
          ))}
          <div className="mt-2 flex items-center justify-between">
            <b>Mediciones</b>
            {measures.length > 0 && <button className={btn} onClick={() => setMeasures([])}>Borrar</button>}
          </div>
          {!measures.length && <div className="text-white/50">Use Distancia o Ángulo y haga clic sobre las superficies.</div>}
          {measures.map((m, n) => (
            <div key={m.id} className="flex items-center gap-1">
              <span className="flex-1 text-yellow-300">{measureText(m, n + 1)}</span>
              {servicesManager && (
                <button className="text-white/60 hover:text-white" title="Ver en cortes"
                  onClick={() => showPointEverywhere(servicesManager, toLps(m.points[m.kind === 'angle' ? 1 : 0]), measureText(m, n + 1))}>↗</button>
              )}
              <button className="text-white/60 hover:text-white" title="Borrar" onClick={() => setMeasures(prev => prev.filter(x => x.id !== m.id))}>✕</button>
            </div>
          ))}
          {measures.length > 0 && <div className="text-white/50">Medidas sobre superficies suavizadas (±1–2 mm); confirme en MPR.</div>}
        </div>
      )}
    </div>
  );
}
