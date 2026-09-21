import {
  Anchor,
  Button,
  Card,
  Container,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useNavigate, useParams } from "react-router-dom";
import type { Job, Spool } from "@shared/types";
import { useGetProjectQuery } from "../api/projectsApi";
import { useListSpoolsQuery } from "../api/spoolsApi";
import JobList from "../features/jobs/JobList";
import ProjectDeleteModal from "../features/projects/ProjectDeleteModal";
import ProjectRenameModal from "../features/projects/ProjectRenameModal";
import { formatCents, formatDate, formatGrams } from "../lib/format";
import { useState } from "react";

/**
 * Project detail (DESIGN.md §7, T9) — a totals header over the project's
 * jobs, reusing the shared JobList.
 *
 * Totals (`totalFilamentMg`, `totalCostCents`, `jobCount`, `lastJobDate`)
 * are derived server-side by SUM/COUNT/MAX over the member jobs; the RTK
 * `Project` tag keeps them live — a job create/edit/delete/reassign from
 * anywhere invalidates it.
 *
 * A project's jobs span many spools, so JobList's edit dialogs resolve the
 * spool per job from the (already-cached) spool list. Deleting a spool
 * cascades its jobs, so every listed job always resolves to a live spool.
 */

/**
 * One stat in the totals header: a small-caps label over a mono value.
 * @param label The stat name.
 * @param value The display value (already formatted).
 * @returns The stat block.
 */
const Stat = ({ label, value }: { label: string; value: string }) => (
  <Stack gap={2}>
    <Text size="xs" tt="uppercase" c="dimmed" fw={500}>
      {label}
    </Text>
    <Text ff="monospace" size="lg" fw={500}>
      {value}
    </Text>
  </Stack>
);

const ProjectDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useGetProjectQuery(id ?? "");
  const { data: spools = [] } = useListSpoolsQuery();

  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // id → spool, for the per-job edit-dialog resolution below.
  const spoolById = new Map(spools.map((s) => [s.id, s]));
  const resolveSpool = (job: Job): Spool => spoolById.get(job.spoolId)!;

  if (isLoading) {
    return (
      <Container py="sm">
        <Text c="dimmed">Loading…</Text>
      </Container>
    );
  }

  if (isError || !data) {
    return (
      <Container py="sm">
        <Stack gap="sm">
          <Text c="dimmed">Project not found.</Text>
          <Button variant="subtle" onClick={() => navigate("/projects")}>
            Back to projects
          </Button>
        </Stack>
      </Container>
    );
  }

  const { project, jobs } = data;

  return (
    <Container size="lg" py="sm">
      <Stack gap="lg">
        {/* Header */}
        <Stack gap="xs">
          <Anchor href="/projects" c="dimmed" size="sm" visibleFrom="xs">
            ← Projects
          </Anchor>
          <Title order={2}>{project.name}</Title>
        </Stack>

        {/* Totals header — derived, never stored */}
        <Card withBorder radius="md" p="md">
          <Group gap="xl" wrap="wrap">
            <Stat label="Filament" value={formatGrams(project.totalFilamentMg)} />
            <Stat label="Cost" value={formatCents(project.totalCostCents)} />
            <Stat label="Jobs" value={String(project.jobCount)} />
            <Stat
              label="Last job"
              value={project.lastJobDate ? formatDate(project.lastJobDate) : "—"}
            />
          </Group>
        </Card>

        {/* Member jobs — the shared JobList (edit/delete included) */}
        <JobList resolveSpool={resolveSpool} jobs={jobs} />

        {/* Actions */}
        <Group>
          <Button onClick={() => setRenaming(true)}>Rename</Button>
          <Button variant="light" color="red" onClick={() => setDeleting(true)}>
            Delete project
          </Button>
        </Group>
      </Stack>

      {/* Rename / delete — mounted only while open; delete leaves the page */}
      {renaming && (
        <ProjectRenameModal project={project} onClose={() => setRenaming(false)} />
      )}
      {deleting && (
        <ProjectDeleteModal
          project={project}
          onClose={() => setDeleting(false)}
          onDeleted={() => navigate("/projects")}
        />
      )}
    </Container>
  );
};

export default ProjectDetailPage;
