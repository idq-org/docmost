// IDQ entries of the space sidebar. space-sidebar.tsx renders this component
// with a single hook line, so new IDQ entries are added here.
import { BoardSidebarItem } from "@/idq/tasks/components/board-sidebar-item";

export function IdqSpaceSidebarItems({ spaceSlug }: { spaceSlug: string }) {
  if (!spaceSlug) return null;
  return (
    <>
      {/* Task board (issue #3) */}
      <BoardSidebarItem spaceSlug={spaceSlug} />
    </>
  );
}
