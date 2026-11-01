import { Anchor, Text } from "@mantine/core";
import { buildLicenseUrl, buildSourceUrl } from "./build-source-url";

type SourceLinkProps = {
  commit?: string | null;
};

export function SourceLink({ commit }: SourceLinkProps) {
  return (
    <Text size="xs" c="dimmed" ta="center">
      <Anchor
        href={buildSourceUrl(commit)}
        target="_blank"
        rel="noopener noreferrer"
        inherit
      >
        Source code
      </Anchor>
      {" · "}
      Based on Docmost, licensed under{" "}
      <Anchor
        href={buildLicenseUrl(commit)}
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
