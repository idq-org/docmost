import { Group, Loader, Modal, Tabs } from "@mantine/core";
import { IconTags, IconUsers } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useTaskSettings } from "../hooks/use-task-settings";
import { LabelVocabularyForm } from "./label-vocabulary-form";
import { AssigneeMappings } from "./assignee-mappings";

type BoardSettingsModalProps = {
  spaceId: string;
  opened: boolean;
  onClose: () => void;
};

/** Workspace settings of the task board, for workspace admins. */
export function BoardSettingsModal({
  spaceId,
  opened,
  onClose,
}: BoardSettingsModalProps) {
  const { t } = useTranslation();
  const { vocabulary, statuses } = useTaskSettings();

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("Board settings")}
      size="lg"
    >
      <Tabs defaultValue="labels" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="labels" leftSection={<IconTags size={16} />}>
            {t("Labels")}
          </Tabs.Tab>
          <Tabs.Tab value="people" leftSection={<IconUsers size={16} />}>
            {t("People in charge")}
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="labels">
          {vocabulary ? (
            // Mounted when the tab opens: the form starts from saved values.
            <LabelVocabularyForm
              vocabulary={vocabulary}
              statuses={statuses}
              onSaved={onClose}
            />
          ) : (
            <Group justify="center" py="md">
              <Loader size="sm" />
            </Group>
          )}
        </Tabs.Panel>
        <Tabs.Panel value="people">
          <AssigneeMappings spaceId={spaceId} />
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}
