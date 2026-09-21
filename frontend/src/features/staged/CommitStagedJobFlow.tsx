import {
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useEffect } from "react";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import type { CommitStagedJobInput, StagedJob } from "@shared/types";
import { mgToGrams } from "@shared/units";
import { useCommitStagedJobMutation } from "../../api/stagedJobsApi";
import { useListProjectsQuery } from "../../api/projectsApi";
import { useListSpoolsQuery } from "../../api/spoolsApi";
import { getApiIssues, getErrorMessage } from "../../api/errors";
import { currencySymbol, formatGrams } from "../../lib/format";

/**
 * Commit-flow dialog (DESIGN.md §7, §10, T10).
 *
 * Mounted only while a staged job is being committed (the page renders
 * `{committing && <CommitStagedJobFlow …/>}`), so the form initializes from
 * the staged job on mount — no open/close state to sync.
 *
 * - Spool: required. `defaultSpoolId` pre-selects when given — T11 will
 *   resolve it from `ams_mappings` (channel → spool); the UI is wired for it
 *   now.
 * - Grams: required on commit (the job is the permanent record). Pre-filled
 *   from the staged job's known amount when it has one, always editable.
 * - Cost: optional; blank → derived from the spool's price per gram.
 * - Project: optional (the invisible default, DESIGN §1).
 *
 * An over-draft 400 lands as a per-field error under the grams field; the
 * staged row survives server-side (the commit transaction rolled back).
 */

export interface CommitStagedJobFlowProps {
  /** The staged job being committed. */
  staged: StagedJob;
  /** Pre-selected spool (AMS mapping, T11); undefined = no pre-select. */
  defaultSpoolId?: string;
  /** Closes the dialog (backdrop, X, cancel, or after a successful commit). */
  onClose: () => void;
}

/**
 * Form values. Numeric fields stay strings until submit (DESIGN §7: coerce
 * with `Number()` on submit); grams/cost are blankable.
 */
interface CommitFormValues {
  spool: string;
  filamentUsedGrams: string;
  cost: string;
  /** Project id, or `""` for no project. */
  project: string;
}

/**
 * Render the commit dialog.
 * @param staged The staged job being committed.
 * @param defaultSpoolId Pre-selected spool, when a mapping resolves one.
 * @param onClose Close hook.
 * @returns The modal (always open while mounted).
 */
const CommitStagedJobFlow = ({
  staged,
  defaultSpoolId,
  onClose,
}: CommitStagedJobFlowProps) => {
  const [commitStagedJob, { isLoading: committing }] = useCommitStagedJobMutation();
  const { data: spools = [] } = useListSpoolsQuery();
  const { data: projects = [] } = useListProjectsQuery();

  const spoolOptions = spools.map((spool) => ({
    label: `${spool.name} — ${formatGrams(spool.leftMg)} left`,
    value: spool.id,
  }));
  const projectOptions = [
    { label: "No project", value: "" },
    ...projects.map((p) => ({ label: p.name, value: p.id })),
  ];

  const form = useForm<CommitFormValues>({
    initialValues: {
      // The spool list is async: the pre-select (T11's AMS mapping) is
      // applied below once it has loaded, not here.
      spool: "",
      filamentUsedGrams:
        staged.filamentUsedMg !== null ? String(mgToGrams(staged.filamentUsedMg)) : "",
      cost: "",
      project: "",
    },
    validate: {
      spool: (v) => (v ? null : "Pick the spool this print used"),
      filamentUsedGrams: (v) =>
        !v.trim()
          ? "Required to commit"
          : Number(v) > 0
            ? null
            : "Must be greater than 0",
      cost: (v) => (!v.trim() ? null : Number(v) >= 0 ? null : "Must be 0 or more"),
    },
  });

  // Apply the AMS pre-select once the spool list has loaded (the form's
  // initial values can't see an async list). Only fills the field while the
  // user hasn't chosen anything, and only when the id is a real spool.
  useEffect(() => {
    if (
      spools.length > 0 &&
      form.values.spool === "" &&
      defaultSpoolId !== undefined &&
      spools.some((s) => s.id === defaultSpoolId)
    ) {
      form.setFieldValue("spool", defaultSpoolId);
    }
  }, [spools, defaultSpoolId, form.values.spool, form]);

  /**
   * Submit: coerce numerics, drop a blank cost, call the commit. The API's
   * issue field names match the form field names, so 400s (incl. over-draft)
   * land per-field; anything else is a toast.
   */
  const handleSubmit = form.onSubmit((values) => {
    const trimmedCost = values.cost.trim();
    const body: CommitStagedJobInput = {
      spoolId: values.spool,
      filamentUsedGrams: Number(values.filamentUsedGrams),
      ...(trimmedCost !== "" ? { cost: Number(trimmedCost) } : {}),
      ...(values.project !== "" ? { projectId: values.project } : {}),
    };

    return commitStagedJob({ id: staged.id, body })
      .unwrap()
      .then((job) => {
        notifications.show({
          message: `Committed “${job.name}” to the spool.`,
          color: "teal",
        });
        onClose();
      })
      .catch((error) => {
        const issues = getApiIssues(error);
        if (issues) {
          const fieldErrors: Record<string, string> = {};
          for (const issue of issues) fieldErrors[issue.field] = issue.message;
          form.setErrors(fieldErrors);
        } else {
          notifications.show({ message: getErrorMessage(error), color: "red" });
        }
      });
  });

  return (
    <Modal opened onClose={onClose} title={`Commit “${staged.name}”`} size="sm">
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <Select
            label="Spool"
            required
            data={spoolOptions}
            searchable
            data-testid="commit-spool"
            {...form.getInputProps("spool", { withError: true })}
          />
          <TextInput
            label="Filament used (g)"
            required
            inputMode="decimal"
            data-testid="commit-grams"
            {...form.getInputProps("filamentUsedGrams", { withError: true })}
          />
          <TextInput
            label={`Cost (${currencySymbol()})`}
            inputMode="decimal"
            placeholder="auto from spool"
            data-testid="commit-cost"
            {...form.getInputProps("cost", { withError: true })}
          />
          <Text size="xs" c="dimmed">
            Optional — left blank, it&apos;s derived from the spool
          </Text>
          <Select
            label="Project"
            data={projectOptions}
            data-testid="commit-project"
            {...form.getInputProps("project")}
          />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={committing} disabled={spools.length === 0}>
              Commit job
            </Button>
          </Group>
          {spools.length === 0 && (
            <Text size="xs" c="orange">
              Add a spool before you can commit a staged job.
            </Text>
          )}
        </Stack>
      </form>
    </Modal>
  );
};

export default CommitStagedJobFlow;
