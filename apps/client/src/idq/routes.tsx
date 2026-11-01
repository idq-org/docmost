// IDQ routes. App.tsx has a single hook line for each group below, so new
// IDQ pages are added here and Docmost's router file doesn't change.
import { Route } from "react-router-dom";
import { lazyWithPrefetch } from "@/lib/lazy-prefetch.ts";

const IdqMcpSettingsPage = lazyWithPrefetch(
  () => import("@/idq/mcp/pages/idq-mcp-settings-page.tsx"),
);

/** Routes under /settings. */
export const idqSettingsRoutes = (
  <>
    <Route path={"account/idq-mcp"} element={<IdqMcpSettingsPage />} />
  </>
);
