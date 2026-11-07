import type { ReactNode } from "react";
import { ActionIcon, Button, Group, Stack, Text, Tooltip } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconExternalLink,
  IconFileDescription,
  IconPaperclip,
  IconPlus,
  IconX,
} from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { getFileUrl } from "@/lib/config.ts";
import { useRemoveTaskLinkMutation } from "../queries/idq-task-query";
import { formatFileSize } from "../task-display";
import { ITaskLink } from "../types";
import { AddMaterialModal } from "./add-material-modal";
import classes from "./task-panel.module.css";

type LinkedMaterialsProps = {
  taskPageId: string;
  spaceId: string;
  spaceSlug: string;
  links: ITaskLink[];
  canEdit: boolean;
};

/** Pages, files and links of a task, in the task panel. */
export function LinkedMaterials({
  taskPageId,
  spaceId,
  spaceSlug,
  links,
  canEdit,
}: LinkedMaterialsProps) {
  const { t } = useTranslation();
  const [adding, { open, close }] = useDisclosure(false);

  return (
    <>
      <Group justify="space-between" mt={4}>
        <Text size="xs" fw={600} c="dimmed" className={classes.sectionTitle}>
          {t("Linked materials")}
        </Text>
        {canEdit && (
          <Button
            size="compact-xs"
            variant="subtle"
            leftSection={<IconPlus size={14} />}
            onClick={open}
          >
            {t("Add")}
          </Button>
        )}
      </Group>

      {links.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t("No linked materials yet.")}
        </Text>
      ) : (
        <Stack gap={0}>
          {links.map((link) => (
            <LinkRow
              key={link.id}
              link={link}
              taskPageId={taskPageId}
              currentSpaceSlug={spaceSlug}
              canEdit={canEdit}
            />
          ))}
        </Stack>
      )}

      {canEdit && (
        <AddMaterialModal
          taskPageId={taskPageId}
          spaceId={spaceId}
          opened={adding}
          onClose={close}
        />
      )}
    </>
  );
}

function LinkRow({
  link,
  taskPageId,
  currentSpaceSlug,
  canEdit,
}: {
  link: ITaskLink;
  taskPageId: string;
  currentSpaceSlug: string;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const remove = useRemoveTaskLinkMutation(taskPageId);
  const { icon, target, detail } = describeLink(link, currentSpaceSlug, t);

  return (
    <Group gap="xs" wrap="nowrap" className={classes.linkRow}>
      <span className={classes.linkIcon}>{icon}</span>
      {target}
      {detail && (
        <Text size="xs" c="dimmed" truncate className={classes.linkDetail}>
          {detail}
        </Text>
      )}
      {canEdit && (
        <Tooltip label={t("Remove")} withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            ml="auto"
            aria-label={t("Remove {{title}}", { title: link.title })}
            onClick={() => remove.mutate(link.id)}
          >
            <IconX size={14} />
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  );
}

function describeLink(
  link: ITaskLink,
  currentSpaceSlug: string,
  t: (key: string) => string,
): { icon: ReactNode; target: ReactNode; detail: string | null } {
  if (link.type === "page" && link.page) {
    const page = link.page;
    return {
      icon: page.icon ? (
        <Text size="sm">{page.icon}</Text>
      ) : (
        <IconFileDescription size={16} />
      ),
      target: (
        <Text
          component={Link}
          to={buildPageUrl(
            page.spaceSlug ?? undefined,
            page.slugId,
            page.title ?? undefined,
          )}
          size="sm"
          truncate
          className={classes.linkTitle}
        >
          {page.title || t("Untitled")}
        </Text>
      ),
      // Only say where the page is when it's in another space.
      detail: page.spaceSlug !== currentSpaceSlug ? page.spaceName : null,
    };
  }

  if (link.type === "attachment" && link.attachment) {
    const file = link.attachment;
    return {
      icon: <IconPaperclip size={16} />,
      target: (
        <Text
          component="a"
          href={getFileUrl(
            `/api/files/${file.id}/${encodeURIComponent(file.fileName)}`,
          )}
          target="_blank"
          rel="noopener"
          size="sm"
          truncate
          className={classes.linkTitle}
        >
          {file.fileName}
        </Text>
      ),
      detail: file.fileSize === null ? null : formatFileSize(file.fileSize),
    };
  }

  return {
    icon: <IconExternalLink size={16} />,
    target: (
      <Text
        component="a"
        href={link.url ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        size="sm"
        truncate
        className={classes.linkTitle}
      >
        {link.title}
      </Text>
    ),
    detail: hostname(link.url),
  };
}

function hostname(url: string | null): string | null {
  try {
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
}
