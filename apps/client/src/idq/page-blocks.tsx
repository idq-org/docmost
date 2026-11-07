// IDQ blocks under the page title. full-editor.tsx renders this component
// with a single hook line, so new IDQ blocks (e.g. deadlines, #12) are added
// here.
import { TaskPagePanel } from "@/idq/tasks/components/task-page-panel";

type IdqPageBlocksProps = {
  pageId: string;
  spaceId: string;
  spaceSlug: string;
};

export function IdqPageBlocks({
  pageId,
  spaceId,
  spaceSlug,
}: IdqPageBlocksProps) {
  if (!pageId || !spaceId) return null;
  return (
    <>
      {/* Task fields and linked materials (issue #3) */}
      <TaskPagePanel pageId={pageId} spaceId={spaceId} spaceSlug={spaceSlug} />
    </>
  );
}
