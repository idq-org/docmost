// IDQ entries of the settings menu. settings-sidebar.tsx has a single hook
// line for each group below, so new IDQ settings pages are added here.
import type { ElementType } from "react";
import { IconPlugConnected } from "@tabler/icons-react";
import "@/idq/mcp/i18n";

type IdqSettingsItem = {
  label: string;
  icon: ElementType;
  path: string;
};

/** Items of the "Account" group. */
export const idqAccountSettingsItems: IdqSettingsItem[] = [
  // MCP and personal API keys (issue #5)
  {
    label: "IDQ MCP",
    icon: IconPlugConnected,
    path: "/settings/account/idq-mcp",
  },
];
