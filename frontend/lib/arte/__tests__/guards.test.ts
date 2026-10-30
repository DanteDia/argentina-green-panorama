import { describe, expect, it } from "vitest";
import { isPublicAddress, mergeProfile, ownPaths, escapeLike } from "../guards";
import { perfil } from "./fixtures";

describe("isPublicAddress (SSRF guard)", () => {
  it("rejects loopback, private, link-local, metadata and IPv6 local ranges", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.3.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1"])
      expect(isPublicAddress(ip), ip).toBe(false);
  });
  it("accepts public addresses", () => {
    for (const ip of ["8.8.8.8", "172.32.0.1", "151.101.1.69", "2606:4700::1111"]) expect(isPublicAddress(ip), ip).toBe(true);
  });
});

describe("ownPaths", () => {
  it("keeps only storage paths under the owner's folder", () => {
    expect(ownPaths(["u1/works/a.jpg", "u2/works/b.jpg", "u1x/works/c.jpg", "../u1/x"], "u1")).toEqual(["u1/works/a.jpg"]);
  });
});

describe("mergeProfile (re-running onboarding)", () => {
  it("never overwrites existing fields with empty draft values", () => {
    const existing = perfil({ base_city: "Buenos Aires", website: "https://a.com", themes: ["dato"] });
    const m = mergeProfile(existing, { name: "Dante Arola", base_city: undefined, website: "", themes: [], instagram: "dante" });
    expect(m.base_city).toBe("Buenos Aires");
    expect(m.website).toBe("https://a.com");
    expect(m.themes).toEqual(["dato"]);
    expect(m.instagram).toBe("dante");
  });
  it("works for a first onboarding with no existing profile", () => {
    expect(mergeProfile(null, { name: "Ana", birth_year: 1990 })).toMatchObject({ name: "Ana", birth_year: 1990, mediums: [], themes: [] });
  });
});

describe("escapeLike", () => {
  it("escapes LIKE wildcards so a handle matches literally", () => {
    expect(escapeLike("%")).toBe("\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
  });
});
