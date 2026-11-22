import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Anchor,
  Button,
  Group,
  Radio,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PROVINCE_OPTIONS } from "../province-options";
import {
  useMyLocationQuery,
  useSetMyLocationMutation,
} from "../queries/idq-member-map-query";
import { MemberVisibility } from "../types";
import { MEMBER_MAP_SETTINGS_ANCHOR, MEMBER_MAP_URL } from "../urls";
import "../i18n";

/**
 * Province and visibility on the members map, in the profile page. Nobody is
 * on the map until they choose to be, or an admin puts them on it with their
 * consent (shown here, and the member can override it). Whatever the member
 * saves is their own choice, which admins can't change; "Don't show me" also
 * forgets the province on the server.
 */
export function MemberLocationSettings() {
  const { t } = useTranslation();
  const location = useLocation();
  const sectionRef = useRef<HTMLElement>(null);
  const { data: saved } = useMyLocationQuery();
  const save = useSetMyLocationMutation();
  const [visibility, setVisibility] = useState<MemberVisibility>("hidden");
  const [province, setProvince] = useState<string | null>(null);

  useEffect(() => {
    if (!saved) return;
    setVisibility(saved.visibility);
    setProvince(saved.provinceCode);
  }, [saved]);

  // Links from the map open the profile page on this section.
  useEffect(() => {
    if (location.hash === `#${MEMBER_MAP_SETTINGS_ANCHOR}`) {
      sectionRef.current?.scrollIntoView({ block: "start" });
    }
  }, [location.hash]);

  const hidden = visibility === "hidden";
  // Until the member saves, the choice isn't theirs (nobody decided, or an
  // admin did): saving it as it is makes it theirs, "Don't show me" included.
  const changed =
    !!saved &&
    (saved.chosenBy !== "member" ||
      visibility !== saved.visibility ||
      (!hidden && province !== saved.provinceCode));
  const valid = hidden || !!province;

  return (
    <section
      ref={sectionRef}
      id={MEMBER_MAP_SETTINGS_ANCHOR}
      aria-labelledby="idq-member-map-settings-title"
      style={{ scrollMarginTop: 80 }}
    >
      <Text size="md" id="idq-member-map-settings-title">
        {t("Members map")}
      </Text>
      <Text size="sm" c="dimmed">
        {t(
          "Show the other members which province you live in: only the province, never your town or address. Only members logged in to the workspace see the map.",
        )}
      </Text>

      {saved?.chosenBy === "admin" && (
        <Alert variant="light" mt="md" icon={<IconInfoCircle />}>
          {t(
            "{{admin}} put you on the map, with your consent. You can change or remove it here: from then on it's your choice.",
            { admin: saved.setBy?.name ?? t("An admin") },
          )}
        </Alert>
      )}
      {saved && saved.chosenBy === null && (
        <Text size="sm" c="dimmed" mt="sm">
          {t(
            "You haven't chosen yet. Until you do, an admin can put you on the map, if you gave your consent. Saving any choice here, \"Don't show me\" included, means only you can change it.",
          )}
        </Text>
      )}

      <Radio.Group
        mt="md"
        label={t("On the map")}
        value={visibility}
        onChange={(value) => setVisibility(value as MemberVisibility)}
      >
        <Stack gap="xs" mt="xs">
          <Radio
            value="hidden"
            label={t("Don't show me")}
            description={t(
              "You are not on the map, your province is not kept, and admins can't put you on it.",
            )}
          />
          <Radio
            value="count"
            label={t("Count me, without my name")}
            description={t("You add one to the members of your province.")}
          />
          <Radio
            value="named"
            label={t("Show my name")}
            description={t(
              "Members see your name and avatar in your province.",
            )}
          />
        </Stack>
      </Radio.Group>

      <Select
        mt="md"
        maw={400}
        variant="filled"
        label={t("Province")}
        placeholder={t("Choose your province")}
        data={PROVINCE_OPTIONS}
        value={hidden ? null : province}
        onChange={(value) =>
          setProvince(typeof value === "string" ? value : null)
        }
        searchable
        clearable
        disabled={hidden}
        required={!hidden}
        nothingFoundMessage={t("No province found")}
        comboboxProps={{ withinPortal: true }}
      />

      <Group mt="sm" gap="lg">
        <Button
          disabled={!changed || !valid}
          loading={save.isPending}
          onClick={() =>
            save.mutate({
              visibility,
              provinceCode: hidden ? null : province,
            })
          }
        >
          {t("Save")}
        </Button>
        <Anchor component={Link} to={MEMBER_MAP_URL} size="sm">
          {t("Open the members map")}
        </Anchor>
      </Group>
    </section>
  );
}
