import { useId, useMemo, useState } from "react";
import { Group, Popover, Stack, Text } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import { PROVINCES } from "../geo/italy-grid";
import {
  buildMapLayers,
  clusterMarkers,
  COLS,
  MarkerCluster,
  MEMBER_LEVELS,
  MemberLevel,
  memberLevel,
  ROWS,
} from "../map-geometry";
import { IMemberMap, IProvinceMembers } from "../types";
import {
  ProvinceMembersDetail,
  provinceName,
  regionNameOf,
} from "./province-members";
import classes from "../member-map.module.css";

// Static: computed once, when the page is first opened.
let layers: ReturnType<typeof buildMapLayers> | null = null;
const getLayers = () => (layers ??= buildMapLayers());

/** Size of a marker, in screen pixels. */
const MARKER_SIZE = 24;
/** Markers may overlap this much before they merge. */
const OVERLAP = 0.8;

type DotMapProps = {
  map: IMemberMap;
  /** Province highlighted from outside (e.g. the list). */
  highlighted: string | null;
  onHighlight: (code: string | null) => void;
};

/**
 * Italy as a grid of dots, one per pixel of the province grid, coloured by
 * the members of the province. A marker with the number of members sits on
 * each province that has some; pointing at a province shows its count, and
 * a marker opens the names that members chose to show.
 */
export function DotMap({ map, highlighted, onHighlight }: DotMapProps) {
  const { t, i18n } = useTranslation();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const { ref, width } = useElementSize();
  const [pinned, setPinned] = useState<string | null>(null);
  const [peek, setPeek] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { areas, dots, activeDots } = getLayers();
  const byCode = useMemo(
    () => new Map(map.provinces.map((p) => [p.code, p])),
    [map],
  );

  // Markers merge when they would overlap, so more on small screens.
  const pxPerCell = width / COLS;
  const clusters = useMemo(() => {
    if (!pxPerCell) return [];
    const size = (MARKER_SIZE * OVERLAP) / pxPerCell;
    return clusterMarkers(map.provinces, { width: size, height: size });
  }, [map, pxPerCell]);

  const openId = peek ?? pinned;
  const open = clusters.find((c) => c.id === openId);
  const active = new Set<string>([
    ...(open?.codes ?? []),
    ...(highlighted ? [highlighted] : []),
  ]);

  const levelOf = (code: string) => memberLevel(byCode.get(code)?.members ?? 0);
  const listFormat = new Intl.ListFormat(i18n.language, {
    type: "conjunction",
  });
  const membersLabel = (count: number) => t("{{count}} members", { count });
  const clusterLabel = (cluster: MarkerCluster) =>
    `${listFormat.format(cluster.codes.map(provinceName))}: ${membersLabel(cluster.members)}`;

  const selectProvince = (code: string) => {
    const cluster = clusters.find((c) => c.codes.includes(code));
    setPinned(cluster ? cluster.id : null);
    setMessage(
      cluster
        ? null
        : t("No members in {{province}} yet", {
            province: provinceName(code),
          }),
    );
  };

  let status: string;
  if (highlighted) {
    const count = byCode.get(highlighted)?.members ?? 0;
    status = `${provinceName(highlighted)} · ${
      count ? membersLabel(count) : t("No members yet")
    }`;
  } else if (message) {
    status = message;
  } else if (open) {
    status = clusterLabel(open);
  } else {
    status = t("Select a province to see its members");
  }

  return (
    <Stack gap="xs">
      <div
        ref={ref}
        className={classes.mapFrame}
        style={{ aspectRatio: `${COLS} / ${ROWS}` }}
        onPointerLeave={() => {
          onHighlight(null);
          setMessage(null);
        }}
      >
        <svg
          viewBox={`0 0 ${COLS} ${ROWS}`}
          className={classes.mapSvg}
          role="img"
          aria-labelledby={`${uid}-title`}
        >
          <title id={`${uid}-title`}>
            {t(
              "Map of Italy with the members by province. Members: {{members}}; provinces: {{provinces}}.",
              {
                members: map.totals.members,
                provinces: map.totals.provinces,
              },
            )}
          </title>
          {PROVINCES.map(({ code }) => (
            <path
              key={code}
              d={dots.get(code)}
              className={classes.dots}
              data-level={levelOf(code)}
            />
          ))}
          {[...active].map((code) => (
            <path
              key={code}
              d={activeDots.get(code)}
              className={classes.activeDots}
              data-level={levelOf(code)}
            />
          ))}
          {PROVINCES.map(({ code }) => (
            <path
              key={code}
              d={areas.get(code)}
              className={classes.area}
              onPointerEnter={() => onHighlight(code)}
              onClick={() => selectProvince(code)}
            />
          ))}
        </svg>

        {clusters.map((cluster) => (
          <MapMarker
            key={cluster.id}
            cluster={cluster}
            byCode={byCode}
            label={clusterLabel(cluster)}
            opened={openId === cluster.id}
            onPeek={(on) => setPeek(on ? cluster.id : null)}
            onToggle={() => {
              setMessage(null);
              setPinned(pinned === cluster.id ? null : cluster.id);
            }}
            onDismiss={() => {
              setPinned(null);
              setPeek(null);
            }}
          />
        ))}
      </div>

      <Text size="sm" c="dimmed" className={classes.status} aria-hidden="true">
        {status}
      </Text>
      <MapLegend />
    </Stack>
  );
}

function LegendDot({ level }: { level: MemberLevel }) {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 1 1"
      aria-hidden="true"
      className={classes.legendDot}
    >
      <circle
        cx={0.5}
        cy={0.5}
        r={0.45}
        className={classes.dots}
        data-level={level}
      />
    </svg>
  );
}

/** What the colours mean. Hidden from screen readers: the list says it all. */
function MapLegend() {
  const { t } = useTranslation();
  const labels: Record<MemberLevel, string> = {
    0: t("No members"),
    1: "1",
    2: "2–4",
    3: t("5 or more"),
  };
  return (
    <Group gap="md" justify="center" aria-hidden="true">
      {MEMBER_LEVELS.map((level) => (
        <Group key={level} gap={6} wrap="nowrap">
          <LegendDot level={level} />
          <Text size="xs" c="dimmed">
            {labels[level]}
          </Text>
        </Group>
      ))}
    </Group>
  );
}

type MapMarkerProps = {
  cluster: MarkerCluster;
  byCode: ReadonlyMap<string, IProvinceMembers>;
  label: string;
  opened: boolean;
  onPeek: (on: boolean) => void;
  onToggle: () => void;
  onDismiss: () => void;
};

function MapMarker({
  cluster,
  byCode,
  label,
  opened,
  onPeek,
  onToggle,
  onDismiss,
}: MapMarkerProps) {
  const { t } = useTranslation();
  const [x, y] = cluster.anchor;

  return (
    <Popover
      opened={opened}
      onDismiss={onDismiss}
      position="top"
      offset={10}
      width={260}
      shadow="md"
      withArrow
      withinPortal
      returnFocus={false}
    >
      <Popover.Target>
        <button
          type="button"
          className={classes.marker}
          data-active={opened || undefined}
          style={{ left: `${(x / COLS) * 100}%`, top: `${(y / ROWS) * 100}%` }}
          aria-label={label}
          onMouseEnter={() => onPeek(true)}
          onMouseLeave={() => onPeek(false)}
          onFocus={() => onPeek(true)}
          onBlur={() => onPeek(false)}
          onClick={onToggle}
        >
          {cluster.members}
        </button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="md">
          {cluster.codes.map((code) => {
            const province = byCode.get(code)!;
            return (
              <Stack key={code} gap={6}>
                <div>
                  <Text size="sm" fw={600}>
                    {provinceName(code)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {regionNameOf(code)} ·{" "}
                    {t("{{count}} members", { count: province.members })}
                  </Text>
                </div>
                <ProvinceMembersDetail province={province} />
              </Stack>
            );
          })}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
