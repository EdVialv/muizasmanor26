import { describe, expect, it } from "vitest";
import { buildClusterIndex, stackByPosition } from "./clusterIndex";
import type { MapObject } from "./mapQuery";
import { LATVIA_BOUNDS } from "./viewport";

const object = (id: number, name: string, latitude: number, longitude: number): MapObject => ({
  id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
  slug: `obj-${id}`,
  name,
  objectType: "manor_estate",
  latitude,
  longitude,
});

describe("stackByPosition", () => {
  it("puts objects at exactly the same position into one stack, in name order", () => {
    const stacks = stackByPosition([
      object(1, "Ūdru muiža", 56.951, 24.1045),
      object(2, "Ābeļu muiža", 56.951, 24.1045),
      object(3, "Citur", 56.9511, 24.1045),
    ]);
    expect(stacks).toHaveLength(2);
    expect(stacks[0].objects.map((o) => o.name)).toEqual(["Ābeļu muiža", "Ūdru muiža"]);
    expect(stacks[1].objects.map((o) => o.name)).toEqual(["Citur"]);
  });
});

describe("buildClusterIndex", () => {
  const objects = [
    object(1, "A", 56.951, 24.1045),
    object(2, "B", 56.951, 24.1045),
    object(3, "C", 56.952, 24.106),
    object(4, "D", 57.5, 27.0),
  ];

  it("clusters at wide zoom, counting objects (not stacks)", () => {
    const index = buildClusterIndex(objects, 17);
    const features = index.features(LATVIA_BOUNDS, 7);
    const total = features.reduce(
      (sum, f) => sum + (f.kind === "cluster" ? f.count : f.stack.objects.length),
      0,
    );
    expect(total).toBe(4);
    const cluster = features.find((f) => f.kind === "cluster");
    expect(cluster && cluster.kind === "cluster" ? cluster.count : 0).toBe(3);
  });

  it("splits clusters when zoomed in, keeping identical positions as one stack", () => {
    const index = buildClusterIndex(objects, 17);
    const features = index.features(LATVIA_BOUNDS, 18);
    const stacks = features.filter((f) => f.kind === "stack");
    expect(stacks).toHaveLength(3);
    const shared = stacks.find((f) => f.kind === "stack" && f.stack.objects.length === 2);
    expect(
      shared && shared.kind === "stack" ? shared.stack.objects.map((o) => o.name) : [],
    ).toEqual(["A", "B"]);
  });

  it("lists every object of a cluster in name order and reports its expansion zoom", () => {
    const index = buildClusterIndex(objects, 17);
    const cluster = index.features(LATVIA_BOUNDS, 7).find((f) => f.kind === "cluster");
    if (!cluster || cluster.kind !== "cluster") {
      throw new Error("expected a cluster");
    }
    expect(index.objectsIn(cluster.clusterId).map((o) => o.name)).toEqual(["A", "B", "C"]);
    expect(cluster.expansionZoom).toBeGreaterThan(7);
  });
});
