import { UnstyledButton } from "@mantine/core";
import { IconLayoutKanban } from "@tabler/icons-react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAtom } from "jotai";
import clsx from "clsx";
// Same look as the other entries of the space sidebar.
import classes from "@/features/space/components/sidebar/space-sidebar.module.css";
import { mobileSidebarAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom.ts";
import { useToggleSidebar } from "@/components/layouts/global/hooks/hooks/use-toggle-sidebar.ts";
import { taskBoardUrl } from "../task-display";
import "../i18n";

export function BoardSidebarItem({ spaceSlug }: { spaceSlug: string }) {
  const { t } = useTranslation();
  const location = useLocation();
  const [mobileSidebarOpened] = useAtom(mobileSidebarAtom);
  const toggleMobileSidebar = useToggleSidebar(mobileSidebarAtom);
  const url = taskBoardUrl(spaceSlug);

  return (
    <UnstyledButton
      component={Link}
      to={url}
      className={clsx(
        classes.menu,
        location.pathname.toLowerCase() === url.toLowerCase() &&
          classes.activeButton,
      )}
      onClick={() => {
        if (mobileSidebarOpened) toggleMobileSidebar();
      }}
    >
      <div className={classes.menuItemInner}>
        <IconLayoutKanban
          size={18}
          className={classes.menuItemIcon}
          stroke={2}
        />
        <span>{t("Board")}</span>
      </div>
    </UnstyledButton>
  );
}
