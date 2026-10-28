// The version of the scene file format (the `toybox` field) and the upgrade of older files.
// Pure, so the viewer and core/scene.mjs share it. Format: docs/scene-format.md
export const FORMAT = 1;

// UPGRADES[n] changes a format n scene into a format n + 1 scene. A change to the format that an
// older scene does not satisfy adds an entry here and increments FORMAT.
export const UPGRADES = {};

export function upgradeScene(scene, upgrades = UPGRADES, format = FORMAT) {
  const v = scene?.toybox;
  if (!Number.isInteger(v) || v < 1) throw new Error('This is not a Toybox scene: the toybox field must be a format number.');
  if (v > format) throw new Error(`This scene has format ${v}. This Toybox reads format ${format} and older. Use a newer Toybox.`);
  let s = scene;
  for (let n = v; n < format; n++) s = { ...upgrades[n](s), toybox: n + 1 };
  return s;
}
