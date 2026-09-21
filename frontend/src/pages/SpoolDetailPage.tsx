import {
  Anchor,
  Button,
  Card,
  Container,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useState } from "react";
import { notifications } from "@mantine/notifications";
import { useNavigate, useParams } from "react-router-dom";
import {
  useDeleteSpoolMutation,
  useFinishSpoolMutation,
  useGetSpoolQuery,
} from "../api/spoolsApi";
import { useListJobsQuery } from "../api/jobsApi";
import { getErrorMessage } from "../api/errors";
import JobForm from "../features/jobs/JobForm";
import JobList from "../features/jobs/JobList";
import SpoolGauge from "../features/spools/SpoolGauge";
import SpoolForm from "../features/spools/SpoolForm";
import { formatCents, formatDate, formatGrams } from "../lib/format";

/**
 * Spool detail (ui-plan §5.2) — the signature layout:
 * large gauge + the spool's own colour doing the talking, mono stats,
 * notes, job history (T6), and the actions that change a spool's life:
 * Edit (modal, reuses SpoolForm), Finish (confirm if jobs exist),
 * Delete (type-to-confirm, finished spools only).
 */
const SpoolDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: spool, isLoading, isError } = useGetSpoolQuery(id ?? "");
  const { data: jobs = [], isLoading: jobsLoading } = useListJobsQuery({
    spoolId: id,
  });

  const [addJobOpen, setAddJobOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const [finishSpool, { isLoading: finishing }] = useFinishSpoolMutation();
  const [deleteSpool, { isLoading: deleting }] = useDeleteSpoolMutation();

  if (isLoading) return <Container py="sm"><Text c="dimmed">Loading…</Text></Container>;

  if (isError || !spool) {
    return (
      <Container py="sm">
        <Stack gap="sm">
          <Text c="dimmed">Spool not found.</Text>
          <Button variant="subtle" onClick={() => navigate("/")}>
            Back to spools
          </Button>
        </Stack>
      </Container>
    );
  }

  const percent =
    spool.initialWeightMg > 0
      ? Math.round((spool.leftMg / spool.initialWeightMg) * 100)
      : 0;

  /** Finish the spool; a 400 (over-draft) lands as a toast. */
  const handleFinish = () =>
    finishSpool(spool.id)
      .then(() => {
        notifications.show({ message: "Spool finished.", color: "teal" });
        setFinishOpen(false);
      })
      .catch((error) =>
        notifications.show({ message: getErrorMessage(error), color: "red" })
      );

  /** Delete requires typing the spool's name first (ui-plan §5.2). */
  const handleDelete = () =>
    deleteSpool(spool.id)
      .then(() => {
        notifications.show({ message: "Spool deleted.", color: "red" });
        navigate("/");
      })
      .catch((error) => {
        notifications.show({ message: getErrorMessage(error), color: "red" });
        setDeleteOpen(false);
      });

  return (
    <Container size="lg" py="sm">
      <Stack gap="lg">
        {/* Header */}
        <Stack gap="xs">
          <Anchor href="/" c="dimmed" size="sm" visibleFrom="xs">
            ← Spools
          </Anchor>
          <Group align="baseline" gap="sm">
            <Title order={2}>{spool.name}</Title>
            <Text c="dimmed" size="sm">
              {spool.brand} · {spool.material.toUpperCase()}
              {spool.finish ? ` · ${spool.finish}` : ""}
            </Text>
          </Group>
        </Stack>

        {/* Gauge + stats */}
        <Card withBorder radius="md" p="md">
          <Group gap="xl" align="center" wrap="wrap">
            <SpoolGauge spool={spool} size="lg" />
            <Stack gap="xs">
              <Text ff="monospace" size="lg">
                {formatGrams(spool.leftMg)} / {formatGrams(spool.initialWeightMg)}
                <Text component="span" c="dimmed" size="sm">
                  {"  "}({percent}%)
                </Text>
              </Text>
              <Text ff="monospace" size="sm" c="dimmed">
                {formatCents(spool.costCents)} · {spool.jobCount}{" "}
                {spool.jobCount === 1 ? "job" : "jobs"}
              </Text>
              <Text ff="monospace" size="sm" c="dimmed">
                added {formatDate(spool.createdAt)}
              </Text>
            </Stack>
          </Group>
        </Card>

        {/* Notes */}
        {spool.notes && (
          <Stack gap="xs">
            <Text size="sm" tt="uppercase" c="dimmed" fw={500}>
              Notes
            </Text>
            <Text>{spool.notes}</Text>
          </Stack>
        )}

        {/* Job history (T7) — server-ordered, real data */}
        <Stack gap="xs">
          <Group justify="space-between" align="baseline">
            <Text size="sm" tt="uppercase" c="dimmed" fw={500}>
              Jobs
            </Text>
            {/* A finished spool is retired — no new jobs on it. */}
            {!spool.isFinished && (
              <Button size="xs" variant="light" onClick={() => setAddJobOpen(true)}>
                Add job
              </Button>
            )}
          </Group>
          {jobsLoading ? (
            <Text c="dimmed">Loading…</Text>
          ) : (
            <JobList spool={spool} jobs={jobs} />
          )}
        </Stack>

        {/* Actions */}
        <Group>
          {spool.isFinished ? (
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>
              Delete spool
            </Button>
          ) : (
            <>
              <Button onClick={() => setEditOpen(true)}>Edit</Button>
              <Button
                variant="light"
                onClick={() => (spool.jobCount > 0 ? setFinishOpen(true) : handleFinish())}
              >
                Finish spool
              </Button>
            </>
          )}
        </Group>
      </Stack>

      {/* Add job — JobForm in create mode */}
      <Modal
        opened={addJobOpen}
        onClose={() => setAddJobOpen(false)}
        title="Add job"
        size="md"
      >
        <JobForm
          spool={spool}
          onSaved={() => setAddJobOpen(false)}
          onCancel={() => setAddJobOpen(false)}
        />
      </Modal>

      {/* Edit — reuses the create form */}
      <Modal
        opened={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit spool"
        size="md"
      >
        <SpoolForm spool={spool} onSaved={() => setEditOpen(false)} onCancel={() => setEditOpen(false)} />
      </Modal>

      {/* Finish confirmation, only when the spool has jobs */}
      <Modal opened={finishOpen} onClose={() => setFinishOpen(false)} title="Finish spool?" size="xs">
        <Stack gap="md">
          <Text>
            This spool has {spool.jobCount} job{spool.jobCount === 1 ? "" : "s"}.{" "}
            Finishing removes it from the active shelf.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setFinishOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleFinish} loading={finishing}>
              Finish
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Delete — type the spool name to confirm */}
      <Modal
        opened={deleteOpen}
        onClose={() => {
          setDeleteOpen(false);
          setDeleteConfirmText("");
        }}
        title="Delete spool?"
        size="xs"
      >
        <Stack gap="md">
          <Text>
            This deletes “{spool.name}” permanently. Type the spool name to confirm.
          </Text>
          <TextInput
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.currentTarget.value)}
            placeholder={spool.name}
          />
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                setDeleteOpen(false);
                setDeleteConfirmText("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={deleteConfirmText !== spool.name}
              onClick={handleDelete}
              loading={deleting}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
};

export default SpoolDetailPage;
