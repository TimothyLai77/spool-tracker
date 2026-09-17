import { Card, Group, Stack, Text } from "@mantine/core";
import { Link } from "react-router-dom";
import type { Spool } from "@shared/types";
import { formatCents, formatGrams } from "../../lib/format";
import SpoolGauge, { spoolLevel, spoolLevelColor } from "./SpoolGauge";

/**
 * A spool card on the Home shelf (ui-plan §5.1).
 *
 * Whole card tappable (an `<a>` — keyboard + screen-reader friendly):
 * caption line (swatch dot + `brand · MATERIAL · finish`), name in the
 * display face, then the gauge with its mono stats.
 */

/**
 * The `brand · MATERIAL · finish` caption parts, finish omitted when unset.
 * @param spool The spool.
 * @returns The caption text.
 */
const captionFor = (spool: Spool): string =>
  [spool.brand, spool.material, spool.finish ?? ""]
    .filter(Boolean)
    .join(" · ");

/**
 * Render one spool as a shelf card.
 * @param spool The spool wire shape.
 * @returns The card (links to `/spools/:id`).
 */
const SpoolCard = ({ spool }: { spool: Spool }) => {
  const level = spoolLevel(spool);

  return (
    <Link to={`/spools/${spool.id}`} className="st-card-link">
      <Card withBorder radius="md" p="md" h="100%">
        <Group gap="xs" align="center" mb="xs" wrap="nowrap">
          <span
            aria-hidden
            className="st-swatch-dot"
            style={{
              backgroundColor: spool.colourHex ?? "var(--mantine-color-gray-5)",
            }}
          />
          <Text size="xs" tt="uppercase" c="dimmed" fw={500} truncate>
            {captionFor(spool)}
          </Text>
        </Group>
        <Text
          fw={600}
          fs="1.125rem"
          truncate
          style={{ fontFamily: "var(--mantine-font-family-headings)" }}
        >
          {spool.name}
        </Text>
        <Group mt="sm" align="center" justify="space-between">
          <Group align="center" gap="sm">
            <SpoolGauge spool={spool} size="sm" />
            <Stack gap={2}>
              <Text
                ff="monospace"
                size="sm"
                fw={500}
                c={spoolLevelColor(level) ?? undefined}
              >
                {level === "empty" ? "empty" : formatGrams(spool.leftMg)}
                {level !== "empty" && ` / ${formatGrams(spool.initialWeightMg)}`}
              </Text>
              <Text ff="monospace" size="xs" c="dimmed">
                {formatCents(spool.costCents)} · {spool.jobCount}{" "}
                {spool.jobCount === 1 ? "job" : "jobs"}
              </Text>
            </Stack>
          </Group>
        </Group>
      </Card>
    </Link>
  );
};

export default SpoolCard;
