import { Anchor, Text } from "@mantine/core";
import { Trans, useTranslation } from "react-i18next";
import { buildLicenseUrl, buildSourceUrl } from "./build-source-url";
import "./i18n";

const COMMIT = import.meta.env.VITE_IDQ_SOURCE_COMMIT;

type SourceLinkProps = {
  compact?: boolean;
};

export function SourceLink({ compact = false }: SourceLinkProps) {
  const { t } = useTranslation();

  return (
    <Text size="xs" c="dimmed" ta="center" px="md" py="xs">
      <Anchor
        href={buildSourceUrl(COMMIT)}
        target="_blank"
        rel="noopener noreferrer"
        inherit
      >
        {t("Source code")}
      </Anchor>
      {" · "}
      {compact ? (
        <Anchor
          href={buildLicenseUrl(COMMIT)}
          target="_blank"
          rel="noopener noreferrer"
          inherit
        >
          AGPL-3.0
        </Anchor>
      ) : (
        <Trans
          i18nKey="Based on Docmost, licensed under <license>AGPL-3.0</license>, with modifications by Informatici di Quartiere ETS"
          components={{
            license: (
              <Anchor
                href={buildLicenseUrl(COMMIT)}
                target="_blank"
                rel="noopener noreferrer"
                inherit
              />
            ),
          }}
        />
      )}
    </Text>
  );
}
