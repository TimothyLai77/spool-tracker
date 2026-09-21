import { Button, Grid, Group, Stack, Text, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import dayjs from "dayjs";
import type { CreateStagedJobInput } from "@shared/types";
import { useCreateStagedJobMutation } from "../../api/stagedJobsApi";
import { getApiIssues, getErrorMessage } from "../../api/errors";

/**
 * Manual staged-job entry (DESIGN.md §5, §7, T10).
 *
 * For prints the printer didn't detect (offline, no printer configured,
 * T11): name, print date, and an optional filament amount — the amount can
 * be left unknown and is filled in at commit time, exactly like the
 * unparseable-grams case printer detection produces.
 *
 * Numeric fields stay strings while typing, coerced with `Number()` on
 * submit (DESIGN §7); the date is a `YYYY-MM-DD` string.
 */

/**
 * Form values. Strings until submit; date is `YYYY-MM-DD` (Mantine
 * `DatePickerInput` value type).
 */
interface NewStagedJobFormValues {
  name: string;
  filamentUsedGrams: string;
  date: string | null;
}

/**
 * Render the manual-entry form (inline card on the staged jobs page).
 * @returns The form.
 */
const NewStagedJobForm = () => {
  const [createStagedJob, { isLoading: saving }] = useCreateStagedJobMutation();

  /** Starting values; reused after a successful add (keeps today's date). */
  const initialValues: NewStagedJobFormValues = {
    name: "",
    filamentUsedGrams: "",
    date: dayjs().format("YYYY-MM-DD"),
  };

  const form = useForm<NewStagedJobFormValues>({
    initialValues,
    validate: {
      name: (v) => (v.trim() ? null : "Name is required"),
      filamentUsedGrams: (v) =>
        !v.trim() ? null : Number(v) > 0 ? null : "Must be greater than 0",
      date: (v) => (v ? null : "Date is required"),
    },
  });

  /**
   * Submit: coerce numerics, drop a blank amount (unknown for now), call
   * create. 400-class failures land per-field; anything else is a toast.
   * Success resets the form (keeping today's date).
   */
  const handleSubmit = form.onSubmit((values) => {
    const trimmedGrams = values.filamentUsedGrams.trim();
    const date = values.date;
    // The form rules make the date required; this guard only narrows the
    // type for the request body.
    if (date === null) return;
    const body: CreateStagedJobInput = {
      name: values.name.trim(),
      date,
      ...(trimmedGrams !== "" ? { filamentUsedGrams: Number(trimmedGrams) } : {}),
    };

    return createStagedJob(body)
      .unwrap()
      .then(() => {
        notifications.show({ message: "Staged job added.", color: "teal" });
        // Back to the starting values (empty name/grams, today's date).
        form.reset();
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
      <Stack gap="md">
        <Grid gap="md">
          <Grid.Col span={{ base: 12, sm: 5 }}>
            <TextInput
              label="Name"
              placeholder="e.g. Gear housing"
              required
              data-testid="staged-new-name"
              {...form.getInputProps("name", { withError: true })}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <TextInput
              label="Filament used (g)"
              inputMode="decimal"
              placeholder="unknown for now"
              data-testid="staged-new-grams"
              {...form.getInputProps("filamentUsedGrams", { withError: true })}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 3 }}>
            <DatePickerInput
              label="Print date"
              required
              value={form.values.date}
              onChange={(value) => form.setFieldValue("date", value)}
              valueFormat="YYYY-MM-DD"
              data-testid="staged-new-date"
            />
          </Grid.Col>
        </Grid>
        <Group justify="flex-end">
          <Text size="xs" c="dimmed" mr="auto">
            Leave the amount blank if you don&apos;t know it — you&apos;ll fill it in
            at commit.
          </Text>
          <Button type="submit" loading={saving}>
            Add staged job
          </Button>
        </Group>
      </Stack>
    </form>
  );
};

export default NewStagedJobForm;
