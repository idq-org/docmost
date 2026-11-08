import type { ElementType } from "react";
import { UnstyledButton } from "@mantine/core";
import { Link, useLocation } from "react-router-dom";
import { useAtom } from "jotai";
import clsx from "clsx";
import {
  mobileSidebarAtom,
  spaceSidebarClasses as classes,
  useToggleSidebar,
} from "./docmost";

type SpaceSidebarEntryProps = {
  to: string;
  icon: ElementType;
  label: string;
};

/** An entry of the space sidebar, with the same look as Docmost's. */
export function SpaceSidebarEntry({
  to,
  icon: Icon,
  label,
}: SpaceSidebarEntryProps) {
  const location = useLocation();
  const [mobileSidebarOpened] = useAtom(mobileSidebarAtom);
  const toggleMobileSidebar = useToggleSidebar(mobileSidebarAtom);
  const active = location.pathname.toLowerCase() === to.toLowerCase();

  return (
    <UnstyledButton
      component={Link}
      to={to}
      className={clsx(classes.menu, active && classes.activeButton)}
      aria-current={active ? "page" : undefined}
      onClick={() => {
        if (mobileSidebarOpened) toggleMobileSidebar();
      }}
    >
      <div className={classes.menuItemInner}>
        <Icon size={18} className={classes.menuItemIcon} stroke={2} />
        <span>{label}</span>
      </div>
    </UnstyledButton>
  );
}
