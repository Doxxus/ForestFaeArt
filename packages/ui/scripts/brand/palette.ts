export interface Palette {
  name: string;
  mono: boolean;
  ground: string;
  /** Lines and dark fills. */
  ink: string;
  /** Fill inside outlined shapes. */
  paper: string;
  /** Wordmark gradient stops (gold, copper, deep copper). */
  gold: string;
  copper: string;
  copperDeep: string;
  /** Outline behind the wordmark. */
  outline: string;
  /** Main brand green. */
  forest: string;
}

export const colour: Palette = {
  name: "colour",
  mono: false,
  ground: "#B7C3A3",
  ink: "#2B1E16",
  paper: "#EFE6CF",
  gold: "#D9B15A",
  copper: "#B4733A",
  copperDeep: "#86522A",
  outline: "#F4EFE3",
  forest: "#2F4A3A",
};

export const mono: Palette = {
  name: "mono",
  mono: true,
  ground: "#FFFFFF",
  ink: "#000000",
  paper: "#FFFFFF",
  gold: "#000000",
  copper: "#000000",
  copperDeep: "#000000",
  outline: "#FFFFFF",
  forest: "#000000",
};

/** Seal on a dark forest ground: light lines, dark fills. */
export const night: Palette = {
  ...colour,
  name: "night",
  ground: "#2B4234",
  ink: "#EADFBC",
  paper: "#2B4234",
  outline: "#2B4234",
  forest: "#EADFBC",
};
