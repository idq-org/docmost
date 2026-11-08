import { Alert, Anchor } from "@mantine/core";
import { IconMapPin } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMyLocationQuery } from "../queries/idq-member-map-query";
import { provinceName } from "./province-members";
import { MEMBER_MAP_SETTINGS_URL } from "../urls";

/** Where the current user is on the map, with a link to change it. */
export function MyLocationBanner() {
  const { t } = useTranslation();
  const { data: mine } = useMyLocationQuery();
  if (!mine) return null;

  const onMap = mine.visibility !== "hidden" && mine.provinceCode;
  const province = onMap ? provinceName(mine.provinceCode!) : "";

  return (
    <Alert
      variant="light"
      color={onMap ? "green" : "blue"}
      icon={<IconMapPin />}
    >
      {!onMap
        ? t("You are not on the map.")
        : mine.setBy
          ? mine.visibility === "named"
            ? t(
                "{{admin}} put you on the map in {{province}}, with your name.",
                {
                  admin: mine.setBy.name ?? t("An admin"),
                  province,
                },
              )
            : t(
                "{{admin}} put you on the map in {{province}}, without your name.",
                { admin: mine.setBy.name ?? t("An admin"), province },
              )
          : mine.visibility === "named"
            ? t("You are on the map in {{province}}, with your name.", {
                province,
              })
            : t("You are on the map in {{province}}, without your name.", {
                province,
              })}{" "}
      <Anchor component={Link} to={MEMBER_MAP_SETTINGS_URL} inherit>
        {onMap ? t("Change") : t("Add your province")}
      </Anchor>
    </Alert>
  );
}
