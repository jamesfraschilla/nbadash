export const PERSONNEL_LAYOUT_VERSION = 1;

export const PERSONNEL_LAYOUT = Object.freeze({
  canvas: Object.freeze({ width: 1920, height: 1080 }),
  headshot: Object.freeze({ x: 560, y: 68, width: 800, height: 412 }),
  name: Object.freeze({ x: 455, y: 500, width: 1010 }),
  statsBox: Object.freeze({ x: 515, y: 620, width: 890, height: 190 }),
  stats: Object.freeze({
    labelInsetY: 33,
    labelSize: 52,
    labelMinSize: 34,
    underlineGap: 5,
    valueInsetY: 113,
    valueSize: 72,
    valueMinSize: 48,
  }),
  threePointBar: Object.freeze({ labelX: 497, x: 577, y: 830, width: 767, height: 42 }),
  tags: Object.freeze({ y: 906, height: 78 }),
});

export function getPersonnelLayoutGoldenSnapshot() {
  return JSON.parse(JSON.stringify({
    version: PERSONNEL_LAYOUT_VERSION,
    ...PERSONNEL_LAYOUT,
  }));
}
