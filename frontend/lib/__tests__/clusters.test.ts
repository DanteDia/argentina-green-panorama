import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CLUSTERS, newestCluster } from "../clusters";

describe("clusters registry", () => {
  it("is the one place an industry or event is added: unique slugs, a link, copy in both languages", () => {
    expect(new Set(CLUSTERS.map((c) => c.slug)).size).toBe(CLUSTERS.length);
    for (const c of CLUSTERS) {
      expect(["industry", "event"]).toContain(c.kind);
      expect(c.href).toMatch(/^(\/|#)/);
      for (const lang of ["es", "en"] as const) {
        expect(c.blurb[lang].length).toBeGreaterThan(20);
        expect(c.audience[lang].length).toBeGreaterThan(5);
        expect(c.cta[lang].length).toBeGreaterThan(2);
      }
    }
  });

  it("holds the three clusters of today: Green Panorama, Arte and BlockchainRio", () => {
    expect(CLUSTERS.map((c) => c.slug)).toEqual(["green-panorama", "arte", "blockchainrio-2026"]);
    expect(CLUSTERS.find((c) => c.slug === "arte")?.href).toBe("/arte");
    expect(newestCluster()?.slug).toBe("arte");   // the banner announces the newest one
  });
});

describe("landing copy", () => {
  // the owner's decision (2026-11-12): no on-chain or GenLayer claims on the landing
  const files = ["components/landing/HeroSection.tsx", "components/landing/HowItWorksSection.tsx", "components/landing/StatsSection.tsx",
    "components/landing/FooterSection.tsx", "app/page.tsx", "app/layout.tsx", "lib/clusters.ts"];
  it.each(files)("%s makes no on-chain, blockchain-verification or GenLayer claim", (f) => {
    const text = readFileSync(path.resolve(__dirname, "../..", f), "utf8");
    expect(text).not.toMatch(/on-chain|genlayer|blockchain[- ]verif|verificaci[oó]n blockchain|consensus|consenso/i);
  });
});
