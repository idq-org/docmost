// IDQ routes. App.tsx has a single hook line for each group below, so new
// IDQ pages are added here and Docmost's router file doesn't change.
import { Route } from "react-router-dom";
import { lazyWithPrefetch } from "@/idq/core/docmost";

const IdqMcpSettingsPage = lazyWithPrefetch(
  () => import("@/idq/mcp/pages/idq-mcp-settings-page.tsx"),
);
const IdqTaskBoardPage = lazyWithPrefetch(
  () => import("@/idq/tasks/pages/idq-task-board-page.tsx"),
);
const IdqMemberMapPage = lazyWithPrefetch(
  () => import("@/idq/member-map/pages/idq-member-map-page.tsx"),
);
const IdqMemberMapAdminPage = lazyWithPrefetch(
  () => import("@/idq/member-map/pages/idq-member-map-admin-page.tsx"),
);

/** Routes inside the app layout (sidebar and header). */
export const idqLayoutRoutes = (
  <>
    {/* Task board of a space (issue #3) */}
    <Route path={"/s/:spaceSlug/board"} element={<IdqTaskBoardPage />} />
    {/* Members map (issue #4) */}
    <Route path={"/map"} element={<IdqMemberMapPage />} />
    <Route path={"/map/manage"} element={<IdqMemberMapAdminPage />} />
  </>
);

/** Routes under /settings. */
export const idqSettingsRoutes = (
  <>
    <Route path={"account/idq-mcp"} element={<IdqMcpSettingsPage />} />
  </>
);
