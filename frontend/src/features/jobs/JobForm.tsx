import {
  Button,
  Grid,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import dayjs from "dayjs";
import type { EditJobInput, Job, Spool } from "@shared/types";
import { mgToGrams } from "@shared/units";
import {
  useCreateJobMutation,
  useEditJobMutation,
} from "../../api/jobsApi";
import { useListProjectsQuery } from "../../api/projectsApi";
import { getApiIssues, getErrorMessage } from "../../api/errors";
import { currencySymbol, formatGrams } from "../../lib/format";

/**
 * The job form (DESIGN.md §7, T7) — one component, two modes:
 * create (new job on `spool`) and edit (`job` present → PATCH).
 *
 * - Numeric fields stay strings while typing, coerced with `Number()` on
 *   submit (DESIGN §7). Grams at the edge; the API converts to mg.
 * - `cost` is optional in both modes: blank on submit → field omitted.
 *   Create: the server derives it from the spool's price per gram.
 *   Edit: the stored cost is kept (the API is partial).
 * - The print date is editable on create only — `EditJobInput` carries no
 *   `date`, so edit mode shows it read-only.
 * - Editing `filamentUsedGrams` rebalances the spool server-side; an
 *   over-draft 400 lands as a per-field error under the grams field
 *   (the API's issue field name matches the form field name).
 */

/**
 * Form values. Numeric fields stay strings until submit; the date is a
 * `YYYY-MM-DD` string (Mantine 9 `DatePickerInput` value type), formatted by
 * dayjs at the edges.
 */
interface JobFormValues {
  name: string;
  filamentUsedGrams: string;
  date: string | null;
  cost: string;
  /** Project id, or `""` for no project (the invisible default). */
  project: string;
}

export interface JobFormProps {
  /** The spool the job draws from (create target; edit: the job's spool). */
  spool: Spool;
  /** Present when editing — the form starts from this job's values. */
  job?: Job;
  /** Called after a successful save (the host closes its modal). */
  onSaved?: () => void;
  /** Cancel-button behaviour. */
  onCancel?: () => void;
}

/**
 * Render the create/edit job form.
 * @param spool The spool the job draws from.
 * @param job The job to edit, when in edit mode.
 * @param onSaved Post-save hook (close modal, etc.).
 * @param onCancel Cancel hook (close modal, etc.).
 * @returns The form.
 */
const JobForm = ({ spool, job, onSaved, onCancel }: JobFormProps) => {
  const [createJob] = useCreateJobMutation();
  const [editJob] = useEditJobMutation();
  const { data: projects = [] } = useListProjectsQuery();

  const initial: JobFormValues = job
    ? {
        name: job.name,
        filamentUsedGrams: String(mgToGrams(job.filamentUsedMg)),
        date: dayjs(job.date).format("YYYY-MM-DD"),
        cost: String(job.costCents / 100),
        project: job.projectId ?? "",
      }
    : {
        name: "",
        filamentUsedGrams: "",
        date: dayjs().format("YYYY-MM-DD"),
        cost: "",
        project: "",
      };

  /** Select options: an explicit "No project" plus every stored project. */
  const projectOptions = [
    { label: "No project", value: "" },
    ...projects.map((p) => ({ label: p.name, value: p.id })),
  ];

  const form = useForm<JobFormValues>({
    initialValues: initial,
    validate: {
      name: (v) => (v.trim() ? null : "Name is required"),
      filamentUsedGrams: (v) =>
        !v.trim()
          ? "Required"
          : Number(v) > 0
            ? null
            : "Must be greater than 0",
      // Create only — the edit API has no date field.
      date: !job ? (v) => (v ? null : "Date is required") : () => null,
      cost: (v) => (!v.trim() ? null : Number(v) >= 0 ? null : "Must be 0 or more"),
    },
  });

  /**
   * Submit: coerce numerics, drop a blank cost, call create or edit.
   * A validation 400 (incl. over-draft) lands as per-field errors;
   * anything else is a toast.
   */
  const handleSubmit = form.onSubmit((values) => {
    const trimmedCost = values.cost.trim();
    const request = job
      ? editJob({
          id: job.id,
          body: {
            name: values.name.trim(),
            filamentUsedGrams: Number(values.filamentUsedGrams),
            ...(trimmedCost !== "" ? { cost: Number(trimmedCost) } : {}),
            // Blank unassigns from the current project; a value reassigns.
            projectId: values.project === "" ? null : values.project,
          } satisfies EditJobInput,
        })
      : createJob({
          spoolId: spool.id,
          name: values.name.trim(),
          filamentUsedGrams: Number(values.filamentUsedGrams),
          // "YYYY-MM-DD" parses to UTC midnight; required on create, so set.
          date: values.date ?? undefined,
          ...(trimmedCost !== "" ? { cost: Number(trimmedCost) } : {}),
          ...(values.project !== "" ? { projectId: values.project } : {}),
        });

    // RTK Query 2.12 mutation promises never reject — the returned promise
    // resolves to `{ data }` on success and `{ error }` on failure
    // (asSafePromise inside buildInitiate). `.unwrap()` restores the
    // classic resolve-on-success / reject-on-failure semantics this form
    // is written against.
    return request
      .unwrap()
      .then(() => {
        notifications.show({
          message: job ? "Job saved." : "Job added.",
          color: "teal",
        });
        onSaved?.();
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
    <form onSubmit={handleSubmit}>
      <Grid gap="md">
        <Grid.Col span={12}>
          <TextInput
            label="Name"
            required
            data-testid="job-name"
            {...form.getInputProps("name", { withError: true })}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <TextInput
            label="Filament used (g)"
            required
            inputMode="decimal"
            data-testid="job-grams"
            {...form.getInputProps("filamentUsedGrams", { withError: true })}
          />
          <Text size="xs" c="dimmed" mt={4}>
            {job
              ? "Changing this rebalances the spool"
              : `${formatGrams(spool.leftMg)} left on this spool`}
          </Text>
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          {job ? (
            <Stack gap={4}>
              <Text size="xs" tt="uppercase" c="dimmed" fw={500}>
                Print date
              </Text>
              <Text>{dayjs(job.date).format("YYYY-MM-DD")}</Text>
            </Stack>
          ) : (
            <DatePickerInput
              label="Print date"
              required
              value={form.values.date}
              onChange={(value) => form.setFieldValue("date", value)}
              valueFormat="YYYY-MM-DD"
              data-testid="job-date"
            />
          )}
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <TextInput
            label={`Cost (${currencySymbol()})`}
            inputMode="decimal"
            placeholder={job ? "blank keeps the current cost" : "auto from spool"}
            data-testid="job-cost"
            {...form.getInputProps("cost", { withError: true })}
          />
          <Text size="xs" c="dimmed" mt={4}>
            Optional — left blank, it&apos;s {job ? "kept as is" : "derived from the spool"}
          </Text>
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <Select
            label="Project"
            data={projectOptions}
            data-testid="job-project"
            {...form.getInputProps("project")}
          />
          <Text size="xs" c="dimmed" mt={4}>
            Optional — groups this job under a project
          </Text>
        </Grid.Col>
      </Grid>
      <Group mt="lg" justify="flex-end">
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">{job ? "Save job" : "Add job"}</Button>
      </Group>
    </form>
  );
};

export default JobForm;
