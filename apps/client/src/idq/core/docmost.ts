/**
 * Everything IDQ features use from Docmost's client, in one place: features
 * import from here, not from Docmost's folders. If Docmost moves or renames
 * one of these, this is the file to fix.
 */

// Infrastructure
export { default as api } from "@/lib/api-client";
export { default as i18n } from "@/i18n";
export { getAppUrl, getFileUrl } from "@/lib/config.ts";
export { lazyWithPrefetch } from "@/lib/lazy-prefetch.ts";
export type { IPagination } from "@/lib/types.ts";

// UI components
export { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
export { DocumentTitle } from "@/components/ui/document-title.tsx";
export { EmptyState } from "@/components/ui/empty-state.tsx";
export { default as CopyTextButton } from "@/components/common/copy";
export { default as SettingsTitle } from "@/components/settings/settings-title.tsx";

// Current user and layout
export { default as useUserRole } from "@/hooks/use-user-role.tsx";
export { userAtom } from "@/features/user/atoms/current-user-atom.ts";
export { mobileSidebarAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom.ts";
export { useToggleSidebar } from "@/components/layouts/global/hooks/hooks/use-toggle-sidebar.ts";
// Look of the entries of the space sidebar
export { default as spaceSidebarClasses } from "@/features/space/components/sidebar/space-sidebar.module.css";

// Spaces, pages and the sidebar tree
export { useGetSpaceBySlugQuery } from "@/features/space/queries/space-query.ts";
export { buildPageUrl } from "@/features/page/page.utils.ts";
export { uploadFile } from "@/features/page/services/page-service.ts";
export { invalidateOnCreatePage } from "@/features/page/queries/page-query.ts";
export { treeDataAtom } from "@/features/page/tree/atoms/tree-data-atom";
export { treeModel } from "@/features/page/tree/model/tree-model";
export type { SpaceTreeNode } from "@/features/page/tree/types";
export { useQueryEmit } from "@/features/websocket/use-query-emit";

// Search and labels
export { searchSuggestions } from "@/features/search/services/search-service.ts";
export type { ILabel } from "@/features/label/types/label.types.ts";
