import { useTranslation } from "react-i18next";
import { DocumentTitle, SettingsTitle } from "@/idq/core/docmost";
import IdqMcpSettings from "../components/idq-mcp-settings";
import "../i18n";

export default function IdqMcpSettingsPage() {
  const { t } = useTranslation();

  return (
    <>
      <DocumentTitle title={t("IDQ MCP")} />
      <SettingsTitle title={t("IDQ MCP")} />
      <IdqMcpSettings />
    </>
  );
}
