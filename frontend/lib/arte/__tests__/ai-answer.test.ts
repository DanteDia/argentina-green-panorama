import { describe, expect, it } from "vitest";
import { underCap } from "../ai-answer";

describe("underCap", () => {
  it("does not call the model once the artist is over today's cap", async () => {
    let called = false;
    expect(await underCap(async () => false, async () => { called = true; return "x"; })).toEqual({ error: "limit" });
    expect(called).toBe(false);
  });
  it("tells a failed model call apart from the cap", async () => {
    expect(await underCap(async () => true, async () => null)).toEqual({ error: "unavailable" });
  });
  it("returns the draft, including an empty result that is not a failure", async () => {
    expect(await underCap(async () => true, async () => "hola")).toEqual({ value: "hola" });
    expect(await underCap(async () => true, async () => [])).toEqual({ value: [] });
  });
});
