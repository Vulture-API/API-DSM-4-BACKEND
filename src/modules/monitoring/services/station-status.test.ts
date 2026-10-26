import { describe, expect, it } from "vitest";

import { stationStatus } from "@/modules/monitoring/services/station-status.js";

const now = new Date("2026-10-08T12:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("stationStatus", () => {
  it.each([
    ["nunca comunicou", null, 0, "Offline"],
    ["exatamente no limite", ago(10 * 60_000), 0, "Online"],
    ["1 ms depois do limite", ago(10 * 60_000 + 1), 0, "Offline"],
    ["comunicando sem alerta", ago(60_000), 0, "Online"],
    ["comunicando com alerta", ago(60_000), 2, "Com alerta"],
    ["offline com alerta", ago(11 * 60_000), 2, "Offline"],
  ] as const)("%s", (_case, last, alerts, expected) => {
    expect(stationStatus(last, alerts, now, 10)).toBe(expected);
  });
});
