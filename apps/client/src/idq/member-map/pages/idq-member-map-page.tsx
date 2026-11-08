import { useState } from "react";
import {
  Anchor,
  Button,
  Container,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconMap, IconSettings } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DocumentTitle, EmptyState, useUserRole } from "@/idq/core/docmost";
import { useMemberMapQuery } from "../queries/idq-member-map-query";
import { MapStats } from "../components/map-stats";
import { DotMap } from "../components/dot-map";
import { MemberList } from "../components/member-list";
import { MyLocationBanner } from "../components/my-location-banner";
import { MEMBER_MAP_MANAGE_URL, MEMBER_MAP_SETTINGS_URL } from "../urls";
import classes from "../member-map.module.css";
import "../i18n";

export default function IdqMemberMapPage() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const { data: map, isError } = useMemberMapQuery();
  const [highlighted, setHighlighted] = useState<string | null>(null);

  if (isError) {
    return (
      <EmptyState
        icon={IconMap}
        title={t("Failed to load the members map")}
        description={t("Try again in a few minutes.")}
      />
    );
  }

  return (
    <Container size="xl" py="xl">
      <DocumentTitle title={t("Members map")} />
      <Stack gap="lg">
        <div>
          <Group justify="space-between" align="center" wrap="nowrap">
            <Title order={1} size="h2">
              {t("Members map")}
            </Title>
            {isAdmin && (
              <Button
                component={Link}
                to={MEMBER_MAP_MANAGE_URL}
                variant="default"
                size="xs"
                leftSection={<IconSettings size={14} />}
              >
                {t("Manage")}
              </Button>
            )}
          </Group>
          <Text c="dimmed" mt={4}>
            {t(
              "Where the members live, by province. Each member chooses whether to be on the map, and whether to show their name.",
            )}
          </Text>
        </div>

        {!map ? (
          <Group justify="center" mt="xl">
            <Loader size="sm" />
          </Group>
        ) : (
          <>
            <MapStats totals={map.totals} />
            <MyLocationBanner />

            <div className={classes.layout}>
              <div className={classes.mapColumn}>
                <Paper withBorder radius="md" p="md">
                  <DotMap
                    map={map}
                    highlighted={highlighted}
                    onHighlight={setHighlighted}
                  />
                </Paper>
              </div>

              <section aria-labelledby="idq-member-list-title">
                <Title order={2} size="h3" id="idq-member-list-title" mb="sm">
                  {t("Members by province")}
                </Title>
                {map.totals.members === 0 ? (
                  <Text c="dimmed">
                    {t("Nobody is on the map yet.")}{" "}
                    <Anchor component={Link} to={MEMBER_MAP_SETTINGS_URL}>
                      {t("Be the first: add your province.")}
                    </Anchor>
                  </Text>
                ) : (
                  <MemberList
                    map={map}
                    highlighted={highlighted}
                    onHighlight={setHighlighted}
                  />
                )}
              </section>
            </div>

            <Text size="xs" c="dimmed">
              {t("Provinces and boundaries:")}{" "}
              <Anchor
                href="https://www.istat.it"
                target="_blank"
                rel="noreferrer"
                inherit
              >
                ISTAT
              </Anchor>{" "}
              (
              <Anchor
                href="https://creativecommons.org/licenses/by/4.0/"
                target="_blank"
                rel="noreferrer"
                inherit
              >
                CC BY 4.0
              </Anchor>
              ).
            </Text>
          </>
        )}
      </Stack>
    </Container>
  );
}
