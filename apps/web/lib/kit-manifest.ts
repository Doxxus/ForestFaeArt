// Written by "pnpm --filter @ffa/ui kit". Do not edit by hand.
export const KIT = {
  "luna-moth": { width: 210, height: 200, bytes: 6040, use: "Hero accent, large" },
  "stag-beetle": { width: 202, height: 236, bytes: 8184, use: "Hero accent, large" },
  "scarab": { width: 218, height: 239, bytes: 4870, use: "Section accent" },
  "atlas-moth": { width: 300, height: 203, bytes: 5406, use: "Hero accent, large" },
  "morpho-butterfly": { width: 292, height: 191, bytes: 5828, use: "Hero accent, large" },
  "swallowtail": { width: 300, height: 261, bytes: 4898, use: "Hero accent, large" },
  "dragonfly": { width: 326, height: 272, bytes: 7303, use: "Section accent" },
  "cicada": { width: 152, height: 276, bytes: 7782, use: "Section accent" },
  "spider": { width: 210, height: 317, bytes: 3228, use: "Hangs from a heading or card" },
  "centipede": { width: 345, height: 136, bytes: 4058, use: "Section accent and loaders" },
  "mushrooms": { width: 276, height: 129, bytes: 6151, use: "Footer and empty states" },
  "leaf-sprig": { width: 230, height: 191, bytes: 3815, use: "Background and borders" },
  "branch": { width: 322, height: 219, bytes: 2896, use: "Page edges" },
  "wildflowers": { width: 185, height: 254, bytes: 8046, use: "Background and empty states" },
  "fern": { width: 309, height: 269, bytes: 4494, use: "Hero and section edges" },
  "corner": { width: 44, height: 44, bytes: 321, use: "Pointed frame corner (flip it for the other corners)" },
  "divider-vine": { width: 762, height: 32, bytes: 1342, use: "Divider on light grounds" },
  "divider-vine-light": { width: 762, height: 32, bytes: 1342, use: "Divider on the dark footer" },
  "mark": { width: 248, height: 176, bytes: 583, use: "The small geometric moth" },
} as const;

export type KitName = keyof typeof KIT;
