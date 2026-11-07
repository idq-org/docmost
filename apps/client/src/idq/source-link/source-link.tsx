import { Anchor, Text } from "@mantine/core";
import { buildLicenseUrl, buildSourceUrl } from "./build-source-url";

const COMMIT = import.meta.env.VITE_IDQ_SOURCE_COMMIT;

export function SourceLink() {
  return (
    <Text size="xs" c="dimmed" ta="center" px="md" py="xs">
      <Anchor
        href={buildSourceUrl(COMMIT)}
        target="_blank"
        rel="noopener noreferrer"
        inherit
      >
        Source code
      </Anchor>
      {" · "}
      Based on Docmost, licensed under{" "}
      <Anchor
        href={buildLicenseUrl(COMMIT)}
        target="_blank"
        rel="noopener noreferrer"
        inherit
      >
        AGPL-3.0
      </Anchor>
      , with modifications by Informatici di Quartiere ETS
    </Text>
  );
}
