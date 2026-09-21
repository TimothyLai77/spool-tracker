import { Button, Group, Modal, Stack, TextInput } from "@mantine/core";
import { useState } from "react";
import { notifications } from "@mantine/notifications";
import type { Project } from "@shared/types";
import { useEditProjectMutation } from "../../api/projectsApi";
import { getErrorMessage } from "../../api/errors";

/**
 * Rename-project dialog (T9) — a single name field in a `Modal`. Mounted
 * only while a project is being renamed (the host renders `{project &&
 * <ProjectRenameModal …/>}`), so the field initializes from the project on
 * mount — no open/close state syncing to get wrong.
 */

export interface ProjectRenameModalProps {
  /** The project to rename. */
  project: Project;
  /** Closes the dialog (backdrop, X, cancel, or after a successful save). */
  onClose: () => void;
}

/**
 * Render the rename-project modal.
 * @param project The project to rename.
 * @param onClose Close hook.
 * @returns The modal (always open while mounted).
 */
const ProjectRenameModal = ({ project, onClose }: ProjectRenameModalProps) => {
  const [name, setName] = useState(project.name);
  const [editProject, { isLoading: saving }] = useEditProjectMutation();

  /** Save the new name; 400-class failures toast, success closes. */
  const handleSave = () => {
    const trimmed = name.trim();
    if (trimmed === "") return;
    editProject({ id: project.id, body: { name: trimmed } })
      .unwrap()
      .then(() => {
        notifications.show({ message: "Project renamed.", color: "teal" });
        onClose();
      })
      .catch((error) =>
        notifications.show({ message: getErrorMessage(error), color: "red" })
      );
  };

  return (
    <Modal opened onClose={onClose} title="Rename project" size="xs">
      <Stack gap="md">
        <TextInput
          label="Name"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          data-testid="project-rename-name"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            loading={saving}
            disabled={name.trim() === "" || name.trim() === project.name}
          >
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default ProjectRenameModal;
