import {
  Button,
  Container,
  Group,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useState } from "react";
import { Link } from "react-router-dom";
import { notifications } from "@mantine/notifications";
import type { Project } from "@shared/types";
import { useCreateProjectMutation, useListProjectsQuery } from "../api/projectsApi";
import { getErrorMessage } from "../api/errors";
import { formatCents, formatDate, formatGrams } from "../lib/format";
import ProjectDeleteModal from "../features/projects/ProjectDeleteModal";
import ProjectRenameModal from "../features/projects/ProjectRenameModal";

/**
 * Projects — the project list (DESIGN.md §7, T9).
 *
 * A directory: one row per project with its derived totals (filament, cost,
 * job count, last job — all computed server-side, never stored). Create is an
 * inline input in the header; rename and delete are row actions with light
 * modals (a project delete keeps its jobs, so no type-the-name ceremony).
 *
 * The feature is invisible unless used (DESIGN §1): with no projects this is
 * a quiet empty state, not a nudge.
 */
const ProjectsPage = () => {
  const { data: projects, isLoading, isError } = useListProjectsQuery();
  const [createProject, { isLoading: creating }] = useCreateProjectMutation();

  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);

  /** Create a project from the header input; 400-class failures toast. */
  const handleCreate = () => {
    const name = newName.trim();
    if (name === "") return;
    createProject({ name })
      .unwrap()
      .then(() => {
        notifications.show({ message: "Project created.", color: "teal" });
        setNewName("");
      })
      .catch((error) =>
        notifications.show({ message: getErrorMessage(error), color: "red" })
      );
  };

  return (
    <Container size="lg" py="sm">
      <Stack gap="lg">
        {/* Header: title + count, and the inline create form */}
        <Group justify="space-between" align="center" wrap="wrap" gap="md">
          <Group align="baseline" gap="sm">
            <Title order={2}>Projects</Title>
            {!isLoading && projects && (
              <Text ff="monospace" size="sm" c="dimmed">
                {projects.length} {projects.length === 1 ? "project" : "projects"}
              </Text>
            )}
          </Group>
          <Group gap="xs">
            <TextInput
              label="New project"
              placeholder="e.g. Prints for Alice"
              value={newName}
              onChange={(e) => setNewName(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              style={{ width: 220 }}
              data-testid="project-new-name"
            />
            <Button
              onClick={handleCreate}
              loading={creating}
              disabled={newName.trim() === ""}
            >
              Add
            </Button>
          </Group>
        </Group>

        {isLoading ? (
          <Text c="dimmed">Loading…</Text>
        ) : isError ? (
          <Text c="red">Could not load projects.</Text>
        ) : projects && projects.length > 0 ? (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th ta="right">Jobs</Table.Th>
                <Table.Th ta="right">Filament</Table.Th>
                <Table.Th ta="right">Cost</Table.Th>
                <Table.Th>Last job</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {projects.map((project) => (
                <Table.Tr key={project.id}>
                  <Table.Td>
                    <Link to={`/projects/${project.id}`}>{project.name}</Link>
                  </Table.Td>
                  <Table.Td ff="monospace" fw={400} ta="right">
                    {project.jobCount}
                  </Table.Td>
                  <Table.Td ff="monospace" fw={400} ta="right">
                    {formatGrams(project.totalFilamentMg)}
                  </Table.Td>
                  <Table.Td ff="monospace" fw={400} ta="right">
                    {formatCents(project.totalCostCents)}
                  </Table.Td>
                  <Table.Td ff="monospace" fw={400}>
                    {project.lastJobDate ? formatDate(project.lastJobDate) : "—"}
                  </Table.Td>
                  <Table.Td ta="right">
                    <Group gap={4} justify="flex-end">
                      <Button
                        size="xs"
                        variant="subtle"
                        onClick={() => setRenaming(project)}
                      >
                        Rename
                      </Button>
                      <Button
                        size="xs"
                        variant="subtle"
                        color="red"
                        onClick={() => setDeleting(project)}
                      >
                        Delete
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : (
          <Text c="dimmed">
            No projects yet. Projects group jobs into totals — add one here,
            or pick one from the job form.
          </Text>
        )}
      </Stack>

      {/* Rename / delete — mounted only while a target is chosen */}
      {renaming && (
        <ProjectRenameModal project={renaming} onClose={() => setRenaming(null)} />
      )}
      {deleting && (
        <ProjectDeleteModal project={deleting} onClose={() => setDeleting(null)} />
      )}
    </Container>
  );
};

export default ProjectsPage;
