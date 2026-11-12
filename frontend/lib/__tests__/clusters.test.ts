import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CLUSTERS, edgeTypesToShow, mapClusters, newestCluster } from "../clusters";

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

describe("the live map on the landing", () => {
  // 2026-11-12: unfiltered, the map loaded the first 2,000 nodes of every industry and showed artists under "Green Industry"
  it("shows one cluster at a time: each cluster in the toggle names the industry tag of its nodes", () => {
    expect(mapClusters().map((c) => [c.slug, c.industries])).toEqual([["green-panorama", ["green"]], ["blockchainrio-2026", ["blockchain"]]]);
    for (const c of mapClusters()) expect(c.mapTitle.en.length).toBeGreaterThan(5);
  });

  it("leaves Arte out of the toggle until the map can load it: 6,000 actors came back as 1,000 nodes without a single link", () => {
    const arte = CLUSTERS.find((c) => c.slug === "arte")!;
    expect(arte.industries).toEqual(["arte"]);   // its tag is still known, for scoping
    expect(arte.liveMap).toBe(false);
  });

  it("draws the relationships each cluster asks for: the green map's five, and all of an event's (sponsors, ecosystem)", () => {
    const green = CLUSTERS.find((c) => c.slug === "green-panorama")!.edgeFilter;
    expect(edgeTypesToShow(["funds", "partners_with", "mentions"], green)).toEqual(["funds", "partners_with", "client_of", "portfolio", "regulates"]);
    expect(edgeTypesToShow(["sponsors", "partners_with", "ecosystem", "sponsors"], undefined)).toEqual(["sponsors", "partners_with", "ecosystem"]);
  });
});

describe("landing copy", () => {
  // the owner's decision (2026-11-12): no on-chain or GenLayer claims on the landing
  const files = ["components/landing/HeroSection.tsx", "components/landing/HowItWorksSection.tsx", "components/landing/StatsSection.tsx",
    "components/landing/FooterSection.tsx", "app/page.tsx", "app/layout.tsx", "lib/clusters.ts", "components/landing/PrototypeSection.tsx"];
  it.each(files)("%s makes no on-chain, blockchain-verification or GenLayer claim", (f) => {
    const text = readFileSync(path.resolve(__dirname, "../..", f), "utf8");
    expect(text).not.toMatch(/on-chain|genlayer|blockchain[- ]verif|verificaci[oó]n blockchain|consensus|consenso/i);
  });
});
