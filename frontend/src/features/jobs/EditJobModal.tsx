import { Modal } from "@mantine/core";
import type { Job, Spool } from "@shared/types";
import JobForm from "./JobForm";

/**
 * Edit-job dialog (DESIGN.md §7, T7) — a thin `Modal` host for `JobForm`
 * in edit mode. The form does the work (field errors, rebalance toast);
 * this component only owns the open/close shell.
 */

export interface EditJobModalProps {
  /** Controls visibility. */
  opened: boolean;
  /** Closes the dialog (backdrop, X, cancel, or after a successful save). */
  onClose: () => void;
  /** The spool the job draws from (the job's spool). */
  spool: Spool;
  /** The job being edited. */
  job: Job;
}

/**
 * Render the edit-job modal.
 * @param opened Controls visibility.
 * @param onClose Closes the dialog.
 * @param spool The spool the job draws from.
 * @param job The job being edited.
 * @returns The modal.
 */
const EditJobModal = ({ opened, onClose, spool, job }: EditJobModalProps) => (
  <Modal opened={opened} onClose={onClose} title="Edit job" size="md">
    <JobForm
      spool={spool}
      job={job}
      onSaved={onClose}
      onCancel={onClose}
    />
  </Modal>
);

export default EditJobModal;
