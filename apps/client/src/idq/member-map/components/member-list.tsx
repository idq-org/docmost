import {
  Badge,
  Group,
  Stack,
  Text,
  Title,
  VisuallyHidden,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { REGIONS } from "../geo/italy-grid";
import { PROVINCE_BY_CODE } from "../map-geometry";
import { IMemberMap } from "../types";
import { ProvinceMembersDetail, provinceName } from "./province-members";
import classes from "../member-map.module.css";

type MemberListProps = {
  map: IMemberMap;
  highlighted: string | null;
  onHighlight: (code: string | null) => void;
};

/**
 * The same information as the map, as a list by region: for screen readers,
 * and to read on a phone. Regions from north to south, provinces with the
 * most members first.
 */
export function MemberList({ map, highlighted, onHighlight }: MemberListProps) {
  const { t } = useTranslation();

  const regions = REGIONS.map((region) => {
    const provinces = map.provinces.filter(
      (p) => PROVINCE_BY_CODE.get(p.code)?.region === region.code,
    );
    return {
      ...region,
      provinces,
      members: provinces.reduce((sum, p) => sum + p.members, 0),
    };
  }).filter((region) => region.provinces.length > 0);

  return (
    <Stack gap="lg">
      {regions.map((region) => (
        <section
          key={region.code}
          aria-labelledby={`idq-region-${region.code}`}
        >
          <div className={classes.regionTitle}>
            <Title order={3} size="h4" id={`idq-region-${region.code}`}>
              {region.name}
            </Title>
            <Text size="sm" c="dimmed">
              {t("{{count}} members", { count: region.members })}
            </Text>
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {region.provinces.map((province) => (
              <li
                key={province.code}
                className={classes.provinceRow}
                data-highlighted={highlighted === province.code || undefined}
                onMouseEnter={() => onHighlight(province.code)}
                onMouseLeave={() => onHighlight(null)}
              >
                <Group justify="space-between" wrap="nowrap" mb={4}>
                  <Text fw={600}>
                    {provinceName(province.code)}{" "}
                    <Text span c="dimmed" size="sm">
                      ({province.code})
                    </Text>
                  </Text>
                  <Badge
                    variant="light"
                    radius="xl"
                    size="lg"
                    aria-hidden="true"
                  >
                    {province.members}
                  </Badge>
                  <VisuallyHidden>
                    {t("{{count}} members", { count: province.members })}
                  </VisuallyHidden>
                </Group>
                <ProvinceMembersDetail province={province} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Stack>
  );
}
