import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
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
