import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import type { Project } from "@shared/types";
import { useDeleteProjectMutation } from "../../api/projectsApi";
import { getErrorMessage } from "../../api/errors";

/**
 * Delete-project confirmation (T9) — a light confirm, mounted only while
 * open. Deleting a project keeps its jobs: they become unassigned personal
 * prints (`ON DELETE SET NULL`), so no type-the-name ceremony (that is
 * reserved for spool deletion, which cascades its history).
 */

export interface ProjectDeleteModalProps {
  /** The project to delete. */
  project: Project;
  /** Closes the dialog (backdrop, X, cancel, or after a successful delete). */
  onClose: () => void;
  /** Optional hook after a successful delete (e.g. navigate away). */
  onDeleted?: () => void;
}

/**
 * Render the delete-project confirmation.
 * @param project The project to delete.
 * @param onClose Close hook.
 * @param onDeleted Post-delete hook (the host leaves the page, etc.).
 * @returns The modal (always open while mounted).
 */
const ProjectDeleteModal = ({ project, onClose, onDeleted }: ProjectDeleteModalProps) => {
  const [deleteProject, { isLoading: deleting }] = useDeleteProjectMutation();

  /** Delete; success closes (and navigates away when the host provides a hook). */
  const handleDelete = () =>
    deleteProject(project.id)
      .unwrap()
      .then(() => {
        notifications.show({
          message: "Project deleted — its jobs are now unassigned.",
          color: "red",
        });
        onDeleted?.();
      })
      .catch((error) =>
        notifications.show({ message: getErrorMessage(error), color: "red" })
      );

  return (
    <Modal opened onClose={onClose} title="Delete project?" size="xs">
      <Stack gap="md">
        <Text>
          Delete “{project.name}”? Its {project.jobCount}{" "}
          {project.jobCount === 1 ? "job is" : "jobs are"} kept and become
          unassigned — the spool balances are untouched.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button color="red" loading={deleting} onClick={handleDelete}>
            Delete
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default ProjectDeleteModal;
