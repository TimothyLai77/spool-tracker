import { Badge, Button, Group, Stack, Table, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import type { StagedJob } from "@shared/types";
import { useDeleteStagedJobMutation } from "../../api/stagedJobsApi";
import { getErrorMessage } from "../../api/errors";
import { formatDate, formatGrams } from "../../lib/format";

/**
 * Staged-job list (DESIGN.md §7, T10).
 *
 * One row per finished print awaiting commit: name, print date, known
 * filament (em-dash when the amount is still unknown), and where it came
 * from (manual entry, or AMS channel / printer once T11 lands). Row actions:
 * Commit (opens the flow, owned by the page) and Delete (discard — no spool
 * is ever involved, so no confirmation ceremony).
 */

export interface StagedJobListProps {
  /** The staged jobs to render (server-ordered, most recent first). */
  jobs: StagedJob[];
  /** Opens the commit flow for a staged job (the page owns the modal). */
  onCommit: (job: StagedJob) => void;
}

/**
 * Render the staged-job table.
 * @param jobs The staged jobs, most recent first.
 * @param onCommit Commit-flow hook.
 * @returns The table.
 */
const StagedJobList = ({ jobs, onCommit }: StagedJobListProps) => {
  const [deleteStagedJob, { isLoading: deleting }] = useDeleteStagedJobMutation();

  /**
   * Discard a staged job; failures toast, success just refetches via
   * invalidation.
   * @param job The staged job to delete.
   */
  const handleDelete = (job: StagedJob) => {
    deleteStagedJob(job.id)
      .unwrap()
      .then(() =>
        notifications.show({ message: "Staged job discarded.", color: "teal" })
      )
      .catch((error) =>
        notifications.show({ message: getErrorMessage(error), color: "red" })
      );
  };

  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Name</Table.Th>
          <Table.Th>Date</Table.Th>
          <Table.Th ta="right">Filament</Table.Th>
          <Table.Th>Source</Table.Th>
          <Table.Th />
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {jobs.map((job) => (
          <Table.Tr key={job.id}>
            <Table.Td fw={500}>{job.name}</Table.Td>
            <Table.Td ff="monospace" fw={400}>
              {formatDate(job.date)}
            </Table.Td>
            <Table.Td ff="monospace" fw={400} ta="right">
              {job.filamentUsedMg !== null
                ? formatGrams(job.filamentUsedMg)
                : "—"}
            </Table.Td>
            <Table.Td>
              <SourceBadge job={job} />
            </Table.Td>
            <Table.Td ta="right">
              <Group gap={4} justify="flex-end">
                <Button
                  size="xs"
                  variant="subtle"
                  color="red"
                  onClick={() => handleDelete(job)}
                  disabled={deleting}
                  data-testid={`staged-delete-${job.id}`}
                >
                  Discard
                </Button>
                <Button
                  size="xs"
                  onClick={() => onCommit(job)}
                  data-testid={`staged-commit-${job.id}`}
                >
                  Commit
                </Button>
              </Group>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
};

/**
 * Where the staged job came from. Printer detection (T11) sets `printerId`
 * and usually an `amsChannel`; until then everything is manual entry.
 * @param job The staged job.
 * @returns The source badge.
 */
const SourceBadge = ({ job }: { job: StagedJob }) => {
  if (job.amsChannel !== null) {
    return (
      <Group gap={4} wrap="nowrap">
        <Badge size="sm" variant="light">
          AMS ch {job.amsChannel}
        </Badge>
        {job.filamentUsedMg === null && (
          <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
            grams unknown
          </Text>
        )}
      </Group>
    );
  }
  return (
    <Group gap={4} wrap="nowrap">
      <Badge size="sm" variant="light" color="gray">
        manual
      </Badge>
      {job.filamentUsedMg === null && (
        <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
          grams unknown
        </Text>
      )}
    </Group>
  );
};

export default StagedJobList;
