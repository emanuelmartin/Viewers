/**
 * AI segmentations in OHIF's own 3D viewport, with the surfaces the AI service already computed.
 *
 * Cornerstone draws a segmentation in a 3D viewport as surfaces; when the segmentation has no surface data it converts
 * the labelmap in the browser (polySeg), which runs out of memory for SEGs with many structures. The AI service exports
 * the surfaces of each SEG as binary glTF (`aiSeg.meshUrl`, one mesh per structure named like its segment), so they
 * are put into the segmentation as its Surface representation before it reaches the 3D viewport: no conversion, and
 * the standard tools apply — the Segmentation panel switches structures on and off, colours and selects them, the 3D
 * viewport rotates, zooms and pans with OHIF's tools, and measurements are made with OHIF's tools in the MPR planes,
 * where a click on a surface in 3D takes them (installSurfacePicking).
 */
import { cache, Enums as csEnums, geometryLoader } from '@cornerstonejs/core';
import { Enums as cstEnums } from '@cornerstonejs/tools';
import { showPointEverywhere } from './navigate';

type Mesh = { name: string; positions: Float32Array; indices: Uint32Array };

const normal = (s: string) => String(s || '').replace(/[\s_]+/g, ' ').trim().toLowerCase();

const COMPONENTS: Record<number, any> = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };

/** The named triangle meshes of a binary glTF (as exported by trimesh: one node per mesh, no transforms). */
export function parseGlb(buffer: ArrayBuffer): Mesh[] {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67) {
    throw new Error('no es un archivo glTF binario');
  }
  let offset = 12;
  let json: any = null;
  let bin: ArrayBuffer | null = null;
  while (offset < buffer.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (type === 0x4e4f534a) {
      json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, length)));
    } else if (type === 0x004e4942) {
      bin = buffer.slice(start, start + length);
    }
    offset = start + length;
  }
  if (!json || !bin) {
    return [];
  }
  const read = (index: number) => {
    const accessor = json.accessors[index];
    const bufferView = json.bufferViews[accessor.bufferView];
    const Type = COMPONENTS[accessor.componentType];
    const size = accessor.type === 'VEC3' ? 3 : 1;
    const begin = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
    // Copy: the views of a GLB need not be aligned for typed arrays
    return new Type(bin.slice(begin, begin + accessor.count * size * Type.BYTES_PER_ELEMENT));
  };
  const meshes: Mesh[] = [];
  (json.nodes || []).forEach((node: any) => {
    if (node.mesh === undefined) {
      return;
    }
    const mesh = json.meshes[node.mesh];
    const primitive = mesh.primitives?.[0];
    if (!primitive || primitive.attributes?.POSITION === undefined || primitive.indices === undefined) {
      return;
    }
    meshes.push({ name: node.name || mesh.name || '', positions: read(primitive.attributes.POSITION), indices: Uint32Array.from(read(primitive.indices)) });
  });
  return meshes;
}

/** Surface geometry per segment index, kept to pick on (the cache holds the same arrays). */
const pickable = new Map<string, Map<number, { points: Float32Array; indices: Uint32Array }>>();

/**
 * Puts the AI surfaces into an already loaded SEG segmentation as its Surface representation. Returns how many
 * structures got a surface (0 when the GLB names match no segment).
 */
export async function attachAISurfaces(servicesManager, segmentationId: string, meshUrl: string, frameOfReferenceUID: string): Promise<number> {
  const { segmentationService } = servicesManager.services;
  const segmentation = segmentationService.getSegmentation(segmentationId);
  if (!segmentation) {
    throw new Error('la segmentación aún no está cargada');
  }
  if (segmentation.representationData?.Surface?.geometryIds?.size) {
    return segmentation.representationData.Surface.geometryIds.size;
  }
  const res = await fetch(meshUrl);
  if (!res.ok) {
    throw new Error(`no se pudieron descargar las superficies (${res.status})`);
  }
  const meshes = parseGlb(await res.arrayBuffer());
  const byLabel = new Map<string, number>();
  Object.entries(segmentation.segments || {}).forEach(([index, segment]: [string, any]) => {
    if (segment?.label) {
      byLabel.set(normal(segment.label), Number(index));
    }
  });
  const geometryIds = new Map<number, string>();
  const forPicking = new Map<number, { points: Float32Array; indices: Uint32Array }>();
  meshes.forEach(mesh => {
    const segmentIndex = byLabel.get(normal(mesh.name)) ?? byLabel.get(normal(mesh.name).slice(0, 64));
    if (!segmentIndex) {
      return;
    }
    // The export's axes (x = patient left, y = superior, z = anterior) to patient LPS, Cornerstone's world
    const p = mesh.positions;
    const points = new Float32Array(p.length);
    for (let i = 0; i < p.length; i += 3) {
      points[i] = p[i];
      points[i + 1] = -p[i + 2];
      points[i + 2] = p[i + 1];
    }
    const polys = new Uint32Array((mesh.indices.length / 3) * 4);
    for (let t = 0, k = 0; t < mesh.indices.length; t += 3) {
      polys[k++] = 3;
      polys[k++] = mesh.indices[t];
      polys[k++] = mesh.indices[t + 1];
      polys[k++] = mesh.indices[t + 2];
    }
    const geometryId = `${segmentationId}-ai-surface-${segmentIndex}`;
    if (!cache.getGeometry(geometryId)) {
      geometryLoader.createAndCacheGeometry(geometryId, {
        type: csEnums.GeometryType.SURFACE,
        geometryData: {
          id: geometryId,
          points: points as any,
          polys: polys as any,
          color: [255, 255, 255],
          frameOfReferenceUID,
          segmentIndex,
        },
      } as any);
    }
    geometryIds.set(segmentIndex, geometryId);
    forPicking.set(segmentIndex, { points, indices: mesh.indices });
  });
  if (!geometryIds.size) {
    return 0;
  }
  segmentationService.addOrUpdateSegmentation({
    segmentationId,
    representationData: { ...segmentation.representationData, [cstEnums.SegmentationRepresentations.Surface]: { geometryIds } },
  });
  pickable.set(segmentationId, forPicking);
  return geometryIds.size;
}

/** Nearest triangle hit along a ray (Möller–Trumbore); t is the distance from the origin. */
function intersect(origin: number[], dir: number[], points: Float32Array, indices: Uint32Array): number | null {
  let best: number | null = null;
  for (let t = 0; t < indices.length; t += 3) {
    const a = 3 * indices[t];
    const b = 3 * indices[t + 1];
    const c = 3 * indices[t + 2];
    const e1x = points[b] - points[a], e1y = points[b + 1] - points[a + 1], e1z = points[b + 2] - points[a + 2];
    const e2x = points[c] - points[a], e2y = points[c + 1] - points[a + 1], e2z = points[c + 2] - points[a + 2];
    const px = dir[1] * e2z - dir[2] * e2y, py = dir[2] * e2x - dir[0] * e2z, pz = dir[0] * e2y - dir[1] * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-9) {
      continue;
    }
    const inv = 1 / det;
    const sx = origin[0] - points[a], sy = origin[1] - points[a + 1], sz = origin[2] - points[a + 2];
    const u = (sx * px + sy * py + sz * pz) * inv;
    if (u < 0 || u > 1) {
      continue;
    }
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const v = (dir[0] * qx + dir[1] * qy + dir[2] * qz) * inv;
    if (v < 0 || u + v > 1) {
      continue;
    }
    const dist = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (dist > 0 && (best === null || dist < best)) {
      best = dist;
    }
  }
  return best;
}

/**
 * A click (not a drag) on a visible AI surface in a 3D viewport moves the image viewports (MPR) to that point and names
 * the structure, so it can be measured there with OHIF's tools. Rotating, zooming and panning are untouched.
 */
export function installSurfacePicking(servicesManager): () => void {
  const { cornerstoneViewportService, segmentationService } = servicesManager.services;
  let down: [number, number] | null = null;
  const onDown = (e: PointerEvent) => {
    down = e.button === 0 ? [e.clientX, e.clientY] : null;
  };
  const onUp = (e: PointerEvent) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) {
      return;
    }
    const element = (e.target as HTMLElement)?.closest?.('[data-viewportid]') as HTMLElement | null;
    const viewportId = element?.getAttribute('data-viewportid');
    const viewport: any = viewportId ? cornerstoneViewportService.getCornerstoneViewport(viewportId) : null;
    if (!viewport || viewport.type !== 'volume3d' || !pickable.size) {
      return;
    }
    const rect = element.getBoundingClientRect();
    const onPlane = viewport.canvasToWorld([e.clientX - rect.left, e.clientY - rect.top]);
    const camera = viewport.getCamera();
    const dir = camera.parallelProjection
      ? camera.viewPlaneNormal.map((n: number) => -n)
      : (() => {
          const d = onPlane.map((x: number, i: number) => x - camera.position[i]);
          const l = Math.hypot(...d) || 1;
          return d.map((x: number) => x / l);
        })();
    // Start well in front of everything along the viewing direction
    const origin = onPlane.map((x: number, i: number) => x - dir[i] * 5000);
    let hit: { t: number; segmentationId: string; segmentIndex: number } | null = null;
    pickable.forEach((segments, segmentationId) => {
      const representation = segmentationService
        .getSegmentationRepresentations(viewportId, { segmentationId })
        ?.find((r: any) => r.type === cstEnums.SegmentationRepresentations.Surface);
      if (!representation || representation.visible === false) {
        return;
      }
      segments.forEach((geometry, segmentIndex) => {
        if (representation.segments?.[segmentIndex]?.visible === false) {
          return;
        }
        const t = intersect(origin, dir, geometry.points, geometry.indices);
        if (t !== null && (!hit || t < hit.t)) {
          hit = { t, segmentationId, segmentIndex };
        }
      });
    });
    if (!hit) {
      return;
    }
    const { t, segmentationId, segmentIndex } = hit;
    const world = origin.map((x: number, i: number) => x + dir[i] * t) as [number, number, number];
    const label = segmentationService.getSegmentation(segmentationId)?.segments?.[segmentIndex]?.label || '';
    segmentationService.setActiveSegment(segmentationId, segmentIndex);
    showPointEverywhere(servicesManager, world, label);
  };
  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('pointerup', onUp, true);
  return () => {
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('pointerup', onUp, true);
  };
}

/** Realistic colours by structure name (Spanish labels of the AI service); lesions stay a vivid yellow to stand out. */
const REALISTIC: Array<[RegExp, [number, number, number]]> = [
  [/tumor|lesi[oó]n|n[oó]dulo|infarto|hemorragia|sangrado|aneurisma|met[aá]stasis/, [255, 205, 40]],
  [/quiste/, [185, 215, 240]],
  [/h[ií]gado/, [128, 52, 40]],
  [/bazo/, [112, 38, 62]],
  [/ri[nñ][oó]n|renal/, [150, 62, 50]],
  [/ves[ií]cula/, [72, 122, 52]],
  [/p[aá]ncreas/, [222, 182, 130]],
  [/vejiga/, [228, 200, 128]],
  [/pr[oó]stata/, [200, 132, 120]],
  [/suprarrenal/, [205, 160, 90]],
  [/tiroides/, [160, 62, 62]],
  [/aorta|arteria|car[oó]tida|coronari|tronco|il[ií]aca|subclavia|braquiocef/, [196, 36, 36]],
  [/vena|cava|porta|yugular|seno venoso/, [62, 82, 170]],
  [/coraz[oó]n|miocardio|ventr[ií]culo (izq|der)|aur[ií]cula|atrio/, [168, 48, 48]],
  [/ventr[ií]culo|lcr|l[ií]quido/, [120, 170, 232]],
  [/pulm[oó]n|l[oó]bulo/, [232, 172, 172]],
  [/tr[aá]quea|bronquio/, [222, 200, 190]],
  [/es[oó]fago|est[oó]mago|duodeno|intestino|colon|recto|yeyuno|[ií]leon/, [222, 150, 128]],
  [/m[uú]sculo|psoas|gl[uú]teo|autóctono|aut[oó]ctono/, [168, 66, 58]],
  [/grasa/, [240, 220, 150]],
  [/sustancia blanca/, [236, 222, 212]],
  [/cerebro|cerebelo|corteza|sustancia gris|hipocampo|t[aá]lamo|tronco encef/, [212, 168, 160]],
  [/v[eé]rtebra|costilla|estern[oó]n|clav[ií]cula|esc[aá]pula|cr[aá]neo|f[eé]mur|h[uú]mero|pelvis|sacro|cadera|hueso|cóccix|c[oó]ccix|disco/, [236, 226, 202]],
];

const realistic = (label: string): [number, number, number] =>
  REALISTIC.find(([re]) => re.test(normal(label)))?.[1] || [205, 150, 130];

/** The surface actors of a segmentation in a 3D viewport, by segment index. */
function surfaceActors(viewport: any, segmentationId: string): Map<number, any> {
  const out = new Map<number, any>();
  const prefix = `${segmentationId}-${cstEnums.SegmentationRepresentations.Surface}-`;
  (viewport?.getActors?.() || []).forEach((entry: any) => {
    const uid = String(entry.representationUID || '');
    if (uid.startsWith(prefix)) {
      out.set(Number(uid.slice(prefix.length)), entry.actor);
    }
  });
  return out;
}

export type ColourMode = 'distintivo' | 'realista';
export type VolumeMode = 'oculto' | 'CT-Bones' | 'CT-Soft-Tissue' | 'CT-AAA' | 'CT-Lung' | 'MR-Default' | 'MR-Angio';

/**
 * Look of the AI surfaces in a 3D viewport: colours (the segmentation's own, distinct per structure, or realistic
 * anatomical ones), opacity and a lit, slightly glossy material. The segmentation panel's colours are not changed.
 */
export function styleSurfaces(servicesManager, viewportId: string, segmentationId: string, colours: ColourMode, opacity: number) {
  const { cornerstoneViewportService, segmentationService } = servicesManager.services;
  const viewport: any = cornerstoneViewportService.getCornerstoneViewport(viewportId);
  if (!viewport) {
    return 0;
  }
  const segments = segmentationService.getSegmentation(segmentationId)?.segments || {};
  const actors = surfaceActors(viewport, segmentationId);
  actors.forEach((actor, index) => {
    const own = segmentationService.getSegmentColor(viewportId, segmentationId, index) || [200, 200, 200];
    const rgb = colours === 'realista' ? realistic(segments[index]?.label || '') : own;
    const property = actor.getProperty();
    property.setColor(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
    property.setOpacity(opacity);
    property.setAmbient(0.15);
    property.setDiffuse(0.85);
    property.setSpecular(colours === 'realista' ? 0.35 : 0.2);
    property.setSpecularPower(25);
    // Translucent surfaces must not hide the ones behind them
    actor.setForceTranslucent?.(opacity < 0.99);
  });
  viewport.render();
  return actors.size;
}

/** The CT/MR volume rendering behind the surfaces: hidden, or one of Cornerstone's presets. */
export function setVolumeMode(servicesManager, viewportId: string, mode: VolumeMode) {
  const viewport: any = servicesManager.services.cornerstoneViewportService.getCornerstoneViewport(viewportId);
  if (!viewport) {
    return;
  }
  (viewport.getActors?.() || []).forEach((entry: any) => {
    if (entry.actor?.isA?.('vtkVolume') && !entry.representationUID) {
      entry.actor.setVisibility(mode !== 'oculto');
    }
  });
  if (mode !== 'oculto') {
    viewport.setProperties({ preset: mode });
  }
  viewport.render();
}

/** Switches structures on and off in the 3D viewport (same state the Segmentation panel shows). */
export function setStructureVisible(servicesManager, viewportId: string, segmentationId: string, segmentIndex: number, visible: boolean) {
  servicesManager.services.segmentationService.setSegmentVisibility(viewportId, segmentationId, segmentIndex, visible, cstEnums.SegmentationRepresentations.Surface);
}

/** PNG of the 3D viewport as it is on screen, with the title and the AI disclaimer burnt in. */
export function download3D(servicesManager, viewportId: string, title: string): string | null {
  const viewport: any = servicesManager.services.cornerstoneViewportService.getCornerstoneViewport(viewportId);
  const canvas: HTMLCanvasElement | undefined = viewport?.getCanvas?.();
  if (!canvas) {
    return 'No hay vista 3D';
  }
  viewport.render();
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d');
  if (!ctx) {
    return 'El navegador no permitió crear la imagen';
  }
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  const size = Math.max(12, Math.round(out.width / 70));
  ctx.font = `${size}px sans-serif`;
  ctx.fillStyle = '#fff';
  ctx.fillText(`${title} · resultado automático, no diagnóstico`, size, out.height - size);
  const a = document.createElement('a');
  a.href = out.toDataURL('image/png');
  a.download = `${title.replace(/[^\wáéíóúñ ]+/gi, '').trim() || 'vista-3d'}.png`;
  a.click();
  return null;
}
