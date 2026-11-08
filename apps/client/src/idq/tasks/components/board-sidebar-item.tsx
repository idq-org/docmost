import { IconLayoutKanban } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { SpaceSidebarEntry } from "@/idq/core/space-sidebar-entry";
import { taskBoardUrl } from "../task-display";
import "../i18n";

export function BoardSidebarItem({ spaceSlug }: { spaceSlug: string }) {
  const { t } = useTranslation();
  return (
    <SpaceSidebarEntry
      to={taskBoardUrl(spaceSlug)}
      icon={IconLayoutKanban}
      label={t("Board")}
    />
  );
}
