// Written by "pnpm --filter @ffa/ui kit". Do not edit by hand.
export const SCENE = {
  "far": { width: 1600, height: 600, bytes: 5140, use: "Farthest layer: pale hills and tree lines" },
  "mid": { width: 1600, height: 900, bytes: 19211, use: "Middle layer: trunks and a fern hill" },
  "near": { width: 1600, height: 520, bytes: 11473, use: "Nearest layer: grass, flowers and forest ground" },
  "floor-edge": { width: 600, height: 100, bytes: 4172, use: "Grass along the top of the footer (tiles sideways)" },
  "sprout-cluster": { width: 250, height: 123, bytes: 2268, use: "Toadstools that grow as you scroll" },
  "sprout-tall": { width: 160, height: 143, bytes: 1590, use: "Toadstools that grow as you scroll" },
  "sprout-ring": { width: 210, height: 85, bytes: 3286, use: "Toadstools that grow as you scroll" },
  "leaf-long": { width: 96, height: 36, bytes: 425, use: "A leaf that drifts past" },
  "leaf-gold": { width: 82, height: 34, bytes: 414, use: "A leaf that drifts past" },
  "leaf-round": { width: 56, height: 90, bytes: 330, use: "A leaf that drifts past" },
} as const;

export type SceneName = keyof typeof SCENE;
