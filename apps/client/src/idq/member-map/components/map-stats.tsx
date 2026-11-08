import { Paper, SimpleGrid, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { IMemberMap } from "../types";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Paper withBorder radius="md" px="md" py="sm">
      <Text size="xs" c="dimmed" fw={600} tt="uppercase">
        {label}
      </Text>
      <Text fz={26} fw={700} lh={1.25}>
        {value}
      </Text>
    </Paper>
  );
}

export function MapStats({ totals }: { totals: IMemberMap["totals"] }) {
  const { t } = useTranslation();
  return (
    <SimpleGrid cols={3} spacing="sm" maw={520}>
      {/* "Members" has a context: Docmost translates it as workspace members */}
      <Stat label={t("Members", { context: "idq" })} value={totals.members} />
      <Stat label={t("Provinces")} value={totals.provinces} />
      <Stat label={t("Regions")} value={totals.regions} />
    </SimpleGrid>
  );
}
