import type { StoreMode } from "@ffa/validators";

/** Plain-language names and explanations for the three store modes, shown in Settings and the Setup Wizard (SET-4). */
export const STORE_MODE_INFO: Record<StoreMode, { label: string; blurb: string }> = {
  SHOWCASE_ONLY: { label: "Showcase only", blurb: "Visitors browse your portfolio. There are no buy buttons." },
  EVENT_ONLY: { label: "Markets and events focus", blurb: "Like Showcase, but the home page promotes your upcoming markets." },
  ONLINE_STORE: { label: "Online store", blurb: "Online buying is not available yet. Visitors will see an Inquire option instead." },
};
