import { describe, expect, it, vi } from "vitest";
import { saveInBatches } from "./save-in-batches";
import { IAdminMemberUpdate } from "../types";

const updates = (n: number): IAdminMemberUpdate[] =>
  Array.from({ length: n }, (_, i) => ({
    userId: `u${i}`,
    visibility: "count",
    provinceCode: "BO",
  }));

describe("saveInBatches", () => {
  it("sends every change, in order, at most `size` per request", async () => {
    const send = vi.fn(async (batch: IAdminMemberUpdate[]) => ({
      updated: batch.length - 1,
      skipped: [
        { userId: batch[0].userId, reason: "chosen-by-member" as const },
      ],
    }));
    const result = await saveInBatches(updates(1201), send, 500);

    expect(send.mock.calls.map(([batch]) => batch.length)).toEqual([
      500, 500, 201,
    ]);
    expect(send.mock.calls.flatMap(([batch]) => batch)).toEqual(updates(1201));
    expect(result).toEqual({
      updated: 1198,
      skipped: ["u0", "u500", "u1000"].map((userId) => ({
        userId,
        reason: "chosen-by-member",
      })),
    });
  });

  it("sends nothing without changes", async () => {
    const send = vi.fn();
    expect(await saveInBatches([], send)).toEqual({ updated: 0, skipped: [] });
    expect(send).not.toHaveBeenCalled();
  });

  it("stops at the first failed batch", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ updated: 2, skipped: [] })
      .mockRejectedValueOnce(new Error("network"));
    await expect(saveInBatches(updates(6), send, 2)).rejects.toThrow("network");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("stays under the server's limit by default", async () => {
    const send = vi.fn(async (_batch: IAdminMemberUpdate[]) => ({
      updated: 0,
      skipped: [],
    }));
    await saveInBatches(updates(2500), send);
    expect(send).toHaveBeenCalledTimes(5);
    for (const [batch] of send.mock.calls) {
      expect(batch.length).toBeLessThanOrEqual(1000);
    }
  });
});
