/**
 * pixOS 3D looks for tissues, replacing stock VTK presets that do not work on an everyday CT (seen on a whole-body
 * PET/CT, 5 mm):
 * - «CT-Lung» lights an opaque green-yellow band at −600 to −400 HU: every air/tissue edge (skin, bowel gas, airways)
 *   turns into green fog.
 * - «CT-Air» makes the air outside the body opaque (a white box) and its colour string ends in a space, which
 *   cornerstone parses as NaN: the transfer function breaks.
 * - «CT-Soft-Tissue» and «CT-Muscle» are opaque from −160 HU: the body is a solid grey or red block.
 * - «CT-Bones» and «CT-Fat» use rainbow colours.
 * Ours keep air (outside and inside) transparent, show one tissue class at a time with anatomical colours, and keep a
 * faint skeleton for orientation where it helps. The airway cannot be separated from the air around the patient
 * without a segmentation, so there is no «Vía aérea» look.
 */
import { vtkPreset } from './vesselPresets';

type Rgb = [number, number, number];
const IVORY: Rgb = [0.93, 0.87, 0.76];
const WHITE: Rgb = [1, 0.98, 0.94];
const SKIN: Rgb = [0.93, 0.7, 0.55];
const FLESH: Rgb = [0.85, 0.45, 0.38];
const MUSCLE_DARK: Rgb = [0.55, 0.12, 0.1];
const MUSCLE: Rgb = [0.78, 0.25, 0.2];
const FAT: Rgb = [0.98, 0.85, 0.35];
const LUNG: Rgb = [0.55, 0.75, 0.95];
const LUNG_DEEP: Rgb = [0.35, 0.55, 0.85];
const pt = (hu: number, opacity: number, rgb: Rgb) => ({ hu, opacity, rgb });

/** Faint skeleton (for orientation inside a soft-tissue or lung look). */
const faintBone = (o: number) => [pt(250, 0, IVORY), pt(400, o, IVORY), pt(1500, o, WHITE), pt(3071, o, WHITE)];

export const TISSUE_PRESETS = [
  // Bone only, clean: nothing below 200 HU
  vtkPreset('PX-CT-Bone', [pt(180, 0, IVORY), pt(260, 0.35, IVORY), pt(500, 0.8, IVORY), pt(1500, 0.9, WHITE), pt(3071, 0.9, WHITE)]),
  // Translucent skin (the air–skin edge only, not the fat under it) over the skeleton
  vtkPreset('PX-CT-BoneSkin', [
    pt(-600, 0, SKIN), pt(-450, 0.18, SKIN), pt(-250, 0.18, SKIN), pt(-150, 0, SKIN),
    pt(220, 0, IVORY), pt(320, 0.7, IVORY), pt(1200, 0.85, WHITE), pt(3071, 0.85, WHITE),
  ]),
  // Lung parenchyma (−900 to −500 HU) as a blue surface; outside air and bowel gas (≈ −1000) transparent
  vtkPreset('PX-CT-Lung', [
    pt(-960, 0, LUNG_DEEP), pt(-900, 0.25, LUNG_DEEP), pt(-750, 0.3, LUNG), pt(-550, 0.3, LUNG), pt(-450, 0, LUNG),
    ...faintBone(0.2),
  ]),
  // Skin and subcutaneous tissue translucent, muscle and organs pink, skeleton
  vtkPreset('PX-CT-Soft', [
    pt(-500, 0, SKIN), pt(-300, 0.04, SKIN), pt(-100, 0.04, SKIN), pt(0, 0.12, FLESH), pt(150, 0.3, FLESH),
    pt(250, 0.3, IVORY), pt(400, 0.7, IVORY), pt(1500, 0.85, WHITE), pt(3071, 0.85, WHITE),
  ]),
  // Muscle and solid organs (fat and skin transparent), faint skeleton
  vtkPreset('PX-CT-Muscle', [pt(-20, 0, MUSCLE_DARK), pt(30, 0.18, MUSCLE_DARK), pt(80, 0.3, MUSCLE), pt(200, 0.3, MUSCLE), pt(260, 0, MUSCLE), ...faintBone(0.35)]),
  // Fat (−190 to −30 HU, Yoshizumi 1999) in yellow, faint skeleton
  vtkPreset('PX-CT-Fat', [pt(-220, 0, FAT), pt(-170, 0.08, FAT), pt(-50, 0.08, FAT), pt(-20, 0, FAT), ...faintBone(0.15)]),
];

export function registerTissuePresets(list: any[]): void {
  for (const p of TISSUE_PRESETS) {
    if (!list.some(x => x.name === p.name)) {
      list.push(p);
    }
  }
}
