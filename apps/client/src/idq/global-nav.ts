// IDQ entries of the main sidebar (Home, Favorites, Spaces...).
// global-sidebar.tsx spreads this list with a single hook line, so new IDQ
// entries are added here.
import type { ElementType } from "react";
import { IconMap } from "@tabler/icons-react";
import { MEMBER_MAP_URL } from "@/idq/member-map/urls";
import "@/idq/member-map/i18n";

type IdqNavItem = {
  /** English text, translated by the sidebar */
  label: string;
  icon: ElementType;
  path: string;
  // Docmost's own entries can be disabled: the field keeps the list's type
  disabled?: boolean;
};

export const idqGlobalNavItems: IdqNavItem[] = [
  // Members map (issue #4)
  { label: "Members map", icon: IconMap, path: MEMBER_MAP_URL },
];
