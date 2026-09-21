import {
  Badge,
  Button,
  Group,
  Modal,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { useState } from "react";
import { notifications } from "@mantine/notifications";
import type { Job, Spool } from "@shared/types";
import { useDeleteJobMutation } from "../../api/jobsApi";
import { getErrorMessage } from "../../api/errors";
import { formatCents, formatDate, formatGrams } from "../../lib/format";
import EditJobModal from "./EditJobModal";

/**
 * Job list (DESIGN.md §7, T7, T9) — reusable table for a run of jobs, in
 * server order (date desc). Hosted by SpoolDetail and ProjectDetail, so it
 * renders whatever the host passes and owns its own edit/delete dialogs.
 *
 * - The edit dialog needs the job's spool (to re-run JobForm's create/edit
 *   logic against the right balance). A spool's list has one spool; a
 *   project's spans many — so the host supplies a per-job `resolveSpool`
 *   instead of a single `spool` prop. Deleting a spool cascades its jobs,
 *   so a listed job always resolves to a live spool.
 * - The project column (and its `projectName` badge) appears only when at
 *   least one row has a project — the opt-in stays invisible (DESIGN §1).
 * - Numbers are mono and right-aligned (house table style, lib/format).
 * - Delete is a light confirm (a job delete just rebalances the spool;
 *   the type-the-name ceremony is reserved for spool deletion).
 */

export interface JobListProps {
  /**
   * Resolve the spool a job draws from (edit-dialog context).
   * @param job The job whose spool is needed.
   * @returns The job's spool.
   */
  resolveSpool: (job: Job) => Spool;
  /** Jobs to render, already ordered by the server. */
  jobs: Job[];
}

/**
 * Render the job list.
 * @param resolveSpool Resolves each job's spool for the edit dialogs.
 * @param jobs The jobs to show, server-ordered.
 * @returns The list (or an empty-state line).
 */
const JobList = ({ resolveSpool, jobs }: JobListProps) => {
  const [editing, setEditing] = useState<Job | null>(null);
  const [deleting, setDeleting] = useState<Job | null>(null);
  const [deleteJob, { isLoading: deletingBusy }] = useDeleteJobMutation();

  const showProject = jobs.some((job) => job.projectName !== null);

  /** Delete the pending job; the spool credits back server-side. */
  const handleDelete = () =>
    deleteJob(deleting!.id)
      .then(() => {
        notifications.show({ message: "Job deleted.", color: "red" });
        setDeleting(null);
      })
      .catch((error) => {
        notifications.show({ message: getErrorMessage(error), color: "red" });
      });

  if (jobs.length === 0) {
    return <Text c="dimmed">No jobs yet.</Text>;
  }

  return (
    <>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Date</Table.Th>
            <Table.Th ta="right">Used</Table.Th>
            <Table.Th ta="right">Cost</Table.Th>
            {showProject && <Table.Th>Project</Table.Th>}
            <Table.Th />

          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {jobs.map((job) => (
            <Table.Tr key={job.id}>
              <Table.Td>{job.name}</Table.Td>
              <Table.Td ff="monospace" fw={400}>
                {formatDate(job.date)}
              </Table.Td>
              <Table.Td ff="monospace" fw={400} ta="right">
                {formatGrams(job.filamentUsedMg)}
              </Table.Td>
              <Table.Td ff="monospace" fw={400} ta="right">
                {formatCents(job.costCents)}
              </Table.Td>
              {showProject && (
                <Table.Td>
                  {job.projectName ? (
                    <Badge variant="light">{job.projectName}</Badge>
                  ) : (
                    <Text c="dimmed">—</Text>
                  )}
                </Table.Td>
              )}
              <Table.Td ta="right">
                <Group gap={4} justify="flex-end">
                  <Button
                    size="xs"
                    variant="subtle"
                    onClick={() => setEditing(job)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="xs"
                    variant="subtle"
                    color="red"
                    onClick={() => setDeleting(job)}
                  >
                    Delete
                  </Button>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      {/* Edit — thin modal host around the shared JobForm */}
      {editing && (
        <EditJobModal
          opened
          onClose={() => setEditing(null)}
          spool={resolveSpool(editing)}
          job={editing}
        />
      )}

      {/* Delete — light confirm */}
      <Modal
        opened={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete job?"
        size="xs"
      >
        <Stack gap="md">
          <Text>
            Delete “{deleting?.name}”? The spool is rebalanced —{" "}
            {formatGrams(deleting?.filamentUsedMg ?? 0)} goes back onto it.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={deletingBusy}
              onClick={handleDelete}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
};

export default JobList;
