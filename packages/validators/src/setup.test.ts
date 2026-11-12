import { describe, expect, it } from "vitest";
import { SETUP_STEPS, defaultSettings, emptySetupProgress, markStep, nextStep, parseSettingValue, PUBLIC_SETTING_KEYS, resolveSettings, setupPending, stepsHandled } from "./index";

describe("the Setup Wizard's progress", () => {
  it("has seven steps, and only the first can't be skipped (SET-1)", () => {
    expect(SETUP_STEPS).toHaveLength(7);
    expect(SETUP_STEPS.filter((s) => !s.skippable).map((s) => s.key)).toEqual(["business"]);
  });
  it("starts empty and points at the first step", () => {
    expect(nextStep(emptySetupProgress())).toBe("business");
    expect(stepsHandled(emptySetupProgress())).toBe(0);
    expect(setupPending(emptySetupProgress())).toBe(true);
  });
  it("moves on after a step is done or skipped, and a step is never both", () => {
    let p = markStep(emptySetupProgress(), "business", "done");
    p = markStep(p, "brand", "skipped");
    expect(nextStep(p)).toBe("store");
    expect(stepsHandled(p)).toBe(2);
    p = markStep(p, "brand", "done");
    expect(p.skipped).toEqual([]);
    expect(p.done).toEqual(["business", "brand"]);
    expect(markStep(p, "brand", "done").done).toEqual(["business", "brand"]);
  });
  it("returns to an earlier step that was skipped only when it is marked again, not on its own", () => {
    const p = markStep(markStep(emptySetupProgress(), "business", "done"), "store", "skipped");
    expect(nextStep(p)).toBe("brand");
  });
  it("returns null when every step has been dealt with", () => {
    const p = SETUP_STEPS.reduce((acc, s) => markStep(acc, s.key, s.skippable ? "skipped" : "done"), emptySetupProgress());
    expect(nextStep(p)).toBeNull();
    expect(stepsHandled(p)).toBe(7);
  });
  it("stops being offered once finished or dismissed", () => {
    expect(setupPending({ ...emptySetupProgress(), finishedAt: 5 })).toBe(false);
    expect(setupPending({ ...emptySetupProgress(), dismissedAt: 5 })).toBe(false);
  });
});

describe("the settings added in Phase 7", () => {
  it("keeps the wizard's progress and the sample switch out of the public set", () => {
    expect(PUBLIC_SETTING_KEYS).not.toContain("setupProgress");
    expect(PUBLIC_SETTING_KEYS).not.toContain("showSampleData");
    expect(PUBLIC_SETTING_KEYS).toContain("businessPhone");
  });
  it("hides sample data by default and starts the wizard empty", () => {
    expect(defaultSettings()).toMatchObject({ showSampleData: false, setupProgress: emptySetupProgress(), businessPhone: "" });
  });
  it("falls back to an empty progress when the saved value is damaged", () => {
    expect(resolveSettings({ setupProgress: JSON.stringify({ done: ["nonsense"] }) }).setupProgress).toEqual(emptySetupProgress());
  });
  it("rejects a step that doesn't exist", () => {
    expect(() => parseSettingValue("setupProgress", { done: ["tax"], skipped: [], finishedAt: null, dismissedAt: null })).toThrow();
  });
});
