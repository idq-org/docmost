import { useMemo, useState } from "react";
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Container,
  Group,
  Loader,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconArrowLeft,
  IconFileImport,
  IconInfoCircle,
  IconLock,
  IconMap,
  IconSearch,
} from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  CustomAvatar,
  DocumentTitle,
  EmptyState,
  useUserRole,
} from "@/idq/core/docmost";
import {
  useAdminMembersQuery,
  useAdminUpdateMutation,
} from "../queries/idq-member-map-query";
import { IAdminMember, MemberVisibility } from "../types";
import { PROVINCE_OPTIONS } from "../province-options";
import { MEMBER_MAP_URL } from "../urls";
import { ImportModal } from "../admin/import-modal";
import "../i18n";

type Edit = { provinceCode: string | null; visibility: MemberVisibility };

function sameAs(member: IAdminMember, edit: Edit) {
  return (
    edit.visibility === (member.visibility ?? "hidden") &&
    (edit.visibility === "hidden" || edit.provinceCode === member.provinceCode)
  );
}

/**
 * Admins put on the map the members who gave their consent: by hand, or
 * from a list. Members see who did it, and can change or remove it in their
 * profile; what members chose themselves can't be changed here.
 */
export default function IdqMemberMapAdminPage() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const { data: members, isError } = useAdminMembersQuery(isAdmin);
  const save = useAdminUpdateMutation();
  const [edits, setEdits] = useState<Map<string, Edit>>(new Map());
  const [search, setSearch] = useState("");
  const [importOpened, importModal] = useDisclosure(false);

  const visibilityOptions = [
    { value: "hidden", label: t("Not on the map") },
    { value: "count", label: t("Without name") },
    { value: "named", label: t("With name") },
  ];

  const current = (member: IAdminMember): Edit =>
    edits.get(member.id) ?? {
      provinceCode: member.provinceCode,
      visibility: member.visibility ?? "hidden",
    };

  const setEdit = (member: IAdminMember, edit: Edit) =>
    setEdits((prev) => {
      const next = new Map(prev);
      if (sameAs(member, edit)) next.delete(member.id);
      else next.set(member.id, edit);
      return next;
    });

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (members ?? []).filter(
      (m) =>
        !query ||
        (m.name ?? "").toLowerCase().includes(query) ||
        m.email.toLowerCase().includes(query),
    );
  }, [members, search]);

  const invalid = [...edits.values()].some(
    (e) => e.visibility !== "hidden" && !e.provinceCode,
  );

  if (!isAdmin) {
    return (
      <EmptyState
        icon={IconMap}
        title={t("Only workspace admins can manage the members map")}
        description={t("Each member chooses in their own profile.")}
      />
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={IconMap}
        title={t("Failed to load the members")}
        description={t("Try again in a few minutes.")}
      />
    );
  }

  const handleSave = () => {
    const updates = [...edits].map(([userId, edit]) => ({
      userId,
      visibility: edit.visibility,
      provinceCode: edit.visibility === "hidden" ? null : edit.provinceCode,
    }));
    save.mutate(updates, {
      onSuccess: (result) => {
        setEdits(new Map());
        notifications.show({
          message:
            result.skipped.length === 0
              ? t("Saved: {{count}} members", { count: result.updated })
              : t(
                  "Saved: {{count}} members. {{skipped}} left as they were: in the meantime they chose in their profile, or are no longer active.",
                  { count: result.updated, skipped: result.skipped.length },
                ),
        });
      },
    });
  };

  return (
    <Container size="lg" py="xl">
      <DocumentTitle title={t("Manage the members map")} />
      <Stack gap="lg">
        <div>
          <Anchor component={Link} to={MEMBER_MAP_URL} size="sm">
            <Group gap={4} component="span">
              <IconArrowLeft size={14} />
              {t("Members map")}
            </Group>
          </Anchor>
          <Title order={1} size="h2" mt={4}>
            {t("Manage the members map")}
          </Title>
        </div>

        <Alert variant="light" icon={<IconInfoCircle />}>
          {t(
            "Put on the map only the members who gave their consent. They see that an admin did it, and can change or remove it in their profile. What a member chose in their profile can't be changed here.",
          )}
        </Alert>

        <Group justify="space-between">
          <TextInput
            placeholder={t("Search by name or email")}
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            w={280}
          />
          <Group gap="sm">
            <Button
              variant="default"
              leftSection={<IconFileImport size={16} />}
              onClick={importModal.open}
              disabled={!members}
            >
              {t("Import from a file")}
            </Button>
            {edits.size > 0 && (
              <Button variant="default" onClick={() => setEdits(new Map())}>
                {t("Discard changes")}
              </Button>
            )}
            <Button
              onClick={handleSave}
              disabled={edits.size === 0 || invalid}
              loading={save.isPending}
            >
              {edits.size > 0
                ? t("Save {{count}} changes", { count: edits.size })
                : t("Save")}
            </Button>
          </Group>
        </Group>

        {!members ? (
          <Group justify="center" mt="xl">
            <Loader size="sm" />
          </Group>
        ) : (
          <Table.ScrollContainer minWidth={720}>
            <Table verticalSpacing="xs" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>
                    {/* With a context: Docmost translates "Member" as a workspace member */}
                    {t("Member", { context: "idq" })}
                  </Table.Th>
                  <Table.Th w={240}>{t("Province")}</Table.Th>
                  <Table.Th w={170}>{t("On the map")}</Table.Th>
                  <Table.Th w={170}>{t("Set by")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visible.map((member) => {
                  const edit = current(member);
                  const locked = member.chosenBy === "member";
                  const changed = edits.has(member.id);
                  const missingProvince =
                    edit.visibility !== "hidden" && !edit.provinceCode;
                  const name = member.name || member.email;
                  return (
                    <Table.Tr key={member.id}>
                      <Table.Td>
                        <Group gap="sm" wrap="nowrap">
                          <CustomAvatar
                            avatarUrl={member.avatarUrl ?? undefined}
                            name={name}
                            size={28}
                          />
                          <div style={{ minWidth: 0 }}>
                            <Text size="sm" fw={500} lineClamp={1}>
                              {name}
                            </Text>
                            <Text size="xs" c="dimmed" lineClamp={1}>
                              {member.email}
                            </Text>
                          </div>
                        </Group>
                      </Table.Td>
                      {locked ? (
                        <Table.Td colSpan={2}>
                          <Text size="sm" c="dimmed">
                            {t(
                              "Chosen in their profile: only they can see and change it.",
                            )}
                          </Text>
                        </Table.Td>
                      ) : (
                        <>
                          <Table.Td>
                            <Select
                              size="xs"
                              aria-label={t("Province of {{name}}", { name })}
                              placeholder={t("Choose a province")}
                              data={PROVINCE_OPTIONS}
                              value={
                                edit.visibility === "hidden"
                                  ? null
                                  : edit.provinceCode
                              }
                              onChange={(value) =>
                                setEdit(member, {
                                  provinceCode: value,
                                  // Choosing a province puts the member on the map,
                                  // without name unless the admin says otherwise.
                                  visibility: !value
                                    ? "hidden"
                                    : edit.visibility === "hidden"
                                      ? "count"
                                      : edit.visibility,
                                })
                              }
                              searchable
                              clearable
                              error={missingProvince}
                              comboboxProps={{ withinPortal: true }}
                            />
                          </Table.Td>
                          <Table.Td>
                            <Select
                              size="xs"
                              aria-label={t("Visibility of {{name}}", { name })}
                              data={visibilityOptions}
                              value={edit.visibility}
                              allowDeselect={false}
                              onChange={(value) =>
                                setEdit(member, {
                                  ...edit,
                                  visibility: (value ??
                                    "hidden") as MemberVisibility,
                                })
                              }
                              comboboxProps={{ withinPortal: true }}
                            />
                          </Table.Td>
                        </>
                      )}
                      <Table.Td>
                        {changed ? (
                          <Badge variant="light">{t("Not saved")}</Badge>
                        ) : locked ? (
                          <Badge
                            variant="light"
                            color="gray"
                            leftSection={<IconLock size={12} />}
                          >
                            {t("The member")}
                          </Badge>
                        ) : member.chosenBy === "admin" ? (
                          <Text size="sm">{member.setByName}</Text>
                        ) : (
                          <Text size="sm" c="dimmed">
                            —
                          </Text>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Stack>

      <ImportModal
        opened={importOpened}
        onClose={importModal.close}
        members={members ?? []}
        onApply={(changes) => {
          setEdits((prev) => {
            const next = new Map(prev);
            for (const change of changes) {
              const edit = {
                provinceCode: change.provinceCode,
                visibility: change.visibility,
              };
              if (sameAs(change.member, edit)) next.delete(change.member.id);
              else next.set(change.member.id, edit);
            }
            return next;
          });
          importModal.close();
          notifications.show({
            message: t(
              "Filled in {{count}} members: check the table, then save.",
              { count: changes.length },
            ),
          });
        }}
      />
    </Container>
  );
}
