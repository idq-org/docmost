import { IAdminMemberUpdate, IAdminUpdateResult } from "../types";

/** Below the server's limit per request (ADMIN_UPDATE_MAX, 1000). */
export const ADMIN_UPDATE_BATCH = 500;

/**
 * Sends the changes one batch after the other and adds up the results. Each
 * change is independent and saving one twice is harmless, so if a batch
 * fails the earlier ones stay saved and the admin can simply save again.
 */
export async function saveInBatches(
  updates: readonly IAdminMemberUpdate[],
  send: (batch: IAdminMemberUpdate[]) => Promise<IAdminUpdateResult>,
  size = ADMIN_UPDATE_BATCH,
): Promise<IAdminUpdateResult> {
  const total: IAdminUpdateResult = { updated: 0, skipped: [] };
  for (let i = 0; i < updates.length; i += size) {
    const result = await send(updates.slice(i, i + size));
    total.updated += result.updated;
    total.skipped.push(...result.skipped);
  }
  return total;
}
