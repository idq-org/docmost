import { Group, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { CustomAvatar } from "@/idq/core/docmost";
import { IProvinceMembers } from "../types";
import { PROVINCE_BY_CODE, REGION_NAME } from "../map-geometry";

export function provinceName(code: string): string {
  return PROVINCE_BY_CODE.get(code)?.name ?? code;
}

export function regionNameOf(code: string): string {
  const region = PROVINCE_BY_CODE.get(code)?.region;
  return (region && REGION_NAME.get(region)) ?? "";
}

/** Who chose to show their name, and how many are only counted. */
export function ProvinceMembersDetail({
  province,
}: {
  province: IProvinceMembers;
}) {
  const { t } = useTranslation();
  const anonymous = province.members - province.named.length;

  return (
    <Stack gap={4}>
      {province.named.length > 0 && (
        <Stack gap={4} component="ul" m={0} p={0} style={{ listStyle: "none" }}>
          {province.named.map((member) => (
            <Group component="li" key={member.id} gap={8} wrap="nowrap">
              <CustomAvatar
                avatarUrl={member.avatarUrl ?? undefined}
                name={member.name ?? ""}
                size={22}
              />
              <Text size="sm" lineClamp={1}>
                {member.name}
              </Text>
            </Group>
          ))}
        </Stack>
      )}
      {anonymous > 0 && (
        <Text size="sm" c="dimmed">
          {province.named.length > 0
            ? t("and {{count}} more without a name", { count: anonymous })
            : t("{{count}} members without a name", { count: anonymous })}
        </Text>
      )}
    </Stack>
  );
}
