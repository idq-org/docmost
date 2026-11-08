import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  FileInput,
  Group,
  Modal,
  ScrollArea,
  SegmentedControl,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { IconFileSpreadsheet } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { IAdminMember } from "../types";
import { provinceName } from "../components/province-members";
import {
  ImportChange,
  ImportFileError,
  ImportRow,
  ImportSkip,
  planImport,
  readImportRows,
} from "./csv-import";

type ImportModalProps = {
  opened: boolean;
  onClose: () => void;
  members: readonly IAdminMember[];
  onApply: (changes: ImportChange[]) => void;
};

/** Excel saves "CSV" in the system encoding, "CSV UTF-8" in UTF-8. */
async function readText(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/**
 * Fills in the management table from a list (CSV). The file is read here, in
 * the browser: nothing is sent until the admin saves the table.
 */
export function ImportModal({
  opened,
  onClose,
  members,
  onApply,
}: ImportModalProps) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [defaultVisibility, setDefaultVisibility] = useState<"count" | "named">(
    "count",
  );

  useEffect(() => {
    if (!opened) {
      setFile(null);
      setRows(null);
      setError(null);
    }
  }, [opened]);

  useEffect(() => {
    setRows(null);
    setError(null);
    if (!file) return;
    readText(file)
      .then((text) => setRows(readImportRows(text)))
      .catch((err) =>
        setError(
          err instanceof ImportFileError && err.message === "columns"
            ? t(
                'The first row must name the columns: "email" and "provincia" (and, if you want, "visibilità").',
              )
            : t("The file can't be read: save it from Excel as CSV."),
        ),
      );
  }, [file]);

  const plan = useMemo(
    () => (rows ? planImport(rows, members, defaultVisibility) : null),
    [rows, members, defaultVisibility],
  );

  const reason = (skip: ImportSkip) => {
    switch (skip.reason) {
      case "no-email":
        return t("No email");
      case "repeated":
        return t("Email repeated in the file");
      case "no-account":
        return t("No Docmost account with this email");
      case "chosen-by-member":
        return t("The member already chose in their profile");
      case "unknown-province":
        return t('Unknown province "{{value}}"', { value: skip.value });
      case "unknown-visibility":
        return t('Unknown visibility "{{value}}"', { value: skip.value });
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("Import from a file")}
      size="lg"
    >
      <Stack gap="md">
        <Text size="sm">
          {t(
            'A CSV file (from Excel: Save as › CSV UTF-8) whose first row names the columns: "email", "provincia" (abbreviation or name) and, if you want, "visibilità" ("con nome" or "senza nome").',
          )}
        </Text>
        <Text size="sm" c="dimmed">
          {t(
            "The file is read in your browser: other columns, such as addresses, never leave your computer. Nothing is saved until you save the table.",
          )}
        </Text>

        <FileInput
          label={t("File")}
          placeholder={t("Choose a CSV file")}
          accept=".csv,text/csv"
          leftSection={<IconFileSpreadsheet size={16} />}
          value={file}
          onChange={setFile}
          clearable
        />

        <div>
          <Text size="sm" fw={500} mb={4}>
            {t("Rows without a visibility")}
          </Text>
          <SegmentedControl
            value={defaultVisibility}
            onChange={(v) => setDefaultVisibility(v as "count" | "named")}
            data={[
              { value: "count", label: t("Count me, without my name") },
              { value: "named", label: t("Show my name") },
            ]}
          />
        </div>

        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}

        {plan && (
          <>
            <Text size="sm" fw={600}>
              {t("{{count}} members to fill in", {
                count: plan.changes.length,
              })}
            </Text>
            {plan.changes.length > 0 && (
              <ScrollArea.Autosize mah={220}>
                <Table striped fz="sm">
                  <Table.Tbody>
                    {plan.changes.map((change) => (
                      <Table.Tr key={change.member.id}>
                        <Table.Td>
                          {change.member.name || change.member.email}
                        </Table.Td>
                        <Table.Td>{provinceName(change.provinceCode)}</Table.Td>
                        <Table.Td c="dimmed">
                          {change.visibility === "named"
                            ? t("With name")
                            : t("Without name")}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea.Autosize>
            )}

            {plan.skips.length > 0 && (
              <>
                <Text size="sm" fw={600}>
                  {t("{{count}} rows left out", { count: plan.skips.length })}
                </Text>
                <ScrollArea.Autosize mah={160}>
                  <Table fz="sm">
                    <Table.Tbody>
                      {plan.skips.map((skip) => (
                        <Table.Tr key={skip.line}>
                          <Table.Td c="dimmed" w={70}>
                            {t("Row {{line}}", { line: skip.line })}
                          </Table.Td>
                          <Table.Td>{skip.email || "—"}</Table.Td>
                          <Table.Td c="dimmed">{reason(skip)}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea.Autosize>
              </>
            )}
          </>
        )}

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button
            disabled={!plan || plan.changes.length === 0}
            onClick={() => plan && onApply(plan.changes)}
          >
            {t("Fill in the table")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
