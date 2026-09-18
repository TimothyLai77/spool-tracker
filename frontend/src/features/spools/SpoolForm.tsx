import {
  Box,
  Button,
  Grid,
  Group,
  Stack,
  Text,
  TextInput,
  Textarea,
  type TextareaProps,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useNavigate } from "react-router-dom";
import { normBrand, normColour, normFinish, normMaterial } from "@shared/normalize";
import { mgToGrams } from "@shared/units";
import type { Spool } from "@shared/types";
import { useCreateSpoolMutation, useEditSpoolMutation, useSpoolAttributesQuery } from "../../api/spoolsApi";
import { getApiIssues, getErrorMessage } from "../../api/errors";

/**
 * The spool form (ui-plan §5.3) — one component, two hosts:
 * full page for create (SpoolFormPage), modal on SpoolDetail for edit (step 6).
 *
 * - Suggestions: `<input list>` + `<datalist>` from `/api/spool-attributes`.
 * - Normalized preview: a `Stored as …` hint when the raw value differs from
 *   its canonical form (storage normalizes; the user sees it before saving).
 * - Numeric fields are strings while typing, coerced with `Number()` on
 *   submit (DESIGN §7). `inputmode="decimal"` gives phones the numeric pad.
 * - A 400 `{ issues }` body maps 1:1 onto field errors (ui-plan §6).
 */

/** Form values. Numeric fields stay strings until submit. */
interface SpoolFormValues {
  name: string;
  brand: string;
  material: string;
  colour: string;
  colourHex: string;
  finish: string;
  initialWeightGrams: string;
  cost: string;
  notes: string;
}

const EMPTY_VALUES: SpoolFormValues = {
  name: "",
  brand: "",
  material: "",
  colour: "",
  colourHex: "",
  finish: "",
  initialWeightGrams: "1000",
  cost: "",
  notes: "",
};

/** `#rrggbb` — mirrors the backend validator's rule. */
const COLOUR_HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * The `Stored as …` hint, shown only when the raw input differs from its
 * normalized form.
 * @param raw The user's current input.
 * @param norm The normalized form that would be stored.
 * @returns The hint element, or null when there is nothing to preview.
 */
const NormalizedHint = ({ raw, norm }: { raw: string; norm: string }) => {
  if (!raw.trim() || raw.trim() === norm) return null;
  return (
    <Text size="xs" c="dimmed" mt={4}>
      Stored as {norm}
    </Text>
  );
};

export interface SpoolFormProps {
  /** Present when editing — the form starts from this spool's values. */
  spool?: Spool;
  /** Called after a successful save (page navigates away, modal closes). */
  onSaved?: () => void;
  /** Cancel-button behaviour; defaults to navigating back to the shelf. */
  onCancel?: () => void;
}

/**
 * Render the create/edit spool form.
 * @param spool The spool to edit, when in edit mode.
 * @param onSaved Post-save hook (navigation / close).
 * @returns The form.
 */
const SpoolForm = ({ spool, onSaved, onCancel }: SpoolFormProps) => {
  const handleCancel = onCancel ?? (() => navigate("/"));
  const navigate = useNavigate();
  const { data: attributes } = useSpoolAttributesQuery();
  const [createSpool] = useCreateSpoolMutation();
  const [editSpool] = useEditSpoolMutation();

  const initial: SpoolFormValues = spool
    ? {
        name: spool.name,
        brand: spool.brand,
        material: spool.material,
        colour: spool.colour,
        colourHex: spool.colourHex ?? "",
        finish: spool.finish ?? "",
        initialWeightGrams: String(mgToGrams(spool.initialWeightMg)),
        cost: String(spool.costCents / 100),
        notes: spool.notes ?? "",
      }
    : EMPTY_VALUES;

  const form = useForm<SpoolFormValues>({
    initialValues: initial,
    validate: {
      name: (v) => (v.trim() ? null : "Name is required"),
      brand: (v) => (v.trim() ? null : "Brand is required"),
      material: (v) => (v.trim() ? null : "Material is required"),
      colour: (v) => (v.trim() ? null : "Colour is required"),
      colourHex: (v) =>
        v.trim() && !COLOUR_HEX_RE.test(v.trim()) ? "Must be #rrggbb" : null,
      initialWeightGrams: (v) =>
        !v.trim() ? "Required" : Number(v) > 0 ? null : "Must be greater than 0",
      cost: (v) =>
        !v.trim() ? "Required" : Number(v) >= 0 ? null : "Must be 0 or more",
    },
  });

  /**
   * Submit: coerce numerics, drop empty optionals, call create or edit.
   * A validation 400 lands as per-field errors; anything else is a toast.
   */
  const handleSubmit = form.onSubmit((values) => {
    const payload = {
      name: values.name.trim(),
      brand: values.brand.trim(),
      material: values.material.trim(),
      colour: values.colour.trim(),
      initialWeightGrams: Number(values.initialWeightGrams),
      cost: Number(values.cost),
      ...(values.colourHex.trim() ? { colourHex: values.colourHex.trim() } : {}),
      ...(values.finish.trim() ? { finish: values.finish.trim() } : {}),
      ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
    };

    const request = spool
      ? editSpool({ id: spool.id, body: payload })
      : createSpool(payload);

    return request
      .then(() => {
        notifications.show({ message: "Spool saved.", color: "teal" });
        if (onSaved) onSaved();
        else navigate("/");
      })
      .catch((error) => {
        const issues = getApiIssues(error);
        if (issues) {
          const fieldErrors: Record<string, string> = {};
          for (const issue of issues) fieldErrors[issue.field] = issue.message;
          form.setErrors(fieldErrors);
        } else {
          notifications.show({
            message: getErrorMessage(error),
            color: "red",
          });
        }
      });
  });

  return (
    <form onSubmit={handleSubmit}>
      <Grid gap="md">
        <Grid.Col span={12}>
          <TextInput
            label="Name"
            data-testid="spool-name"
            {...form.getInputProps("name")}
          />
          <Text size="xs" c="dimmed" mt={4}>
            Your label for this spool
          </Text>
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <TextInput
            label="Brand"
            required
            list="spool-attributes-brand"
            data-testid="spool-brand"
            {...form.getInputProps("brand")}
          />
          <NormalizedHint
            raw={form.values.brand}
            norm={normBrand(form.values.brand)}
          />
          <datalist id="spool-attributes-brand">
            {attributes?.brands.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <TextInput
            label="Material"
            required
            list="spool-attributes-material"
            data-testid="spool-material"
            {...form.getInputProps("material")}
          />
          <NormalizedHint
            raw={form.values.material}
            norm={normMaterial(form.values.material)}
          />
          <datalist id="spool-attributes-material">
            {attributes?.materials.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 4 }}>
          <TextInput
            label="Colour"
            required
            list="spool-attributes-colour"
            data-testid="spool-colour"
            {...form.getInputProps("colour")}
          />
          <NormalizedHint
            raw={form.values.colour}
            norm={normColour(form.values.colour)}
          />
          <datalist id="spool-attributes-colour">
            {attributes?.colours.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 8 }}>
          <TextInput
            label="Colour hex"
            placeholder="#1a1a1a"
            data-testid="spool-colourhex"
            rightSection={
              <Box
                aria-hidden
                className="st-swatch-dot"
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  backgroundColor: COLOUR_HEX_RE.test(form.values.colourHex.trim())
                    ? form.values.colourHex.trim()
                    : "var(--mantine-color-gray-2)",
                }}
              />
            }
            {...form.getInputProps("colourHex")}
          />
          <Text size="xs" c="dimmed" mt={4}>
            Optional — drives the swatch and gauge
          </Text>
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <TextInput
            label="Finish"
            list="spool-attributes-finish"
            placeholder="glossy, satin, matte…"
            data-testid="spool-finish"
            {...form.getInputProps("finish")}
          />
          <NormalizedHint
            raw={form.values.finish}
            norm={normFinish(form.values.finish)}
          />
          <datalist id="spool-attributes-finish">
            {attributes?.finishes.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <TextInput
            label="Initial weight (g)"
            required
            inputMode="decimal"
            data-testid="spool-weight"
            {...form.getInputProps("initialWeightGrams")}
          />
        </Grid.Col>
        <Grid.Col span={12}>
          <TextInput
            label="Cost ($)"
            required
            inputMode="decimal"
            placeholder="12.99"
            data-testid="spool-cost"
            {...form.getInputProps("cost")}
          />
        </Grid.Col>
        <Grid.Col span={12}>
          <Textarea
            label="Notes"
            placeholder="Additional Notes"
            autosize
            minRows={2}
            data-testid="spool-notes"
            {...form.getInputProps("notes") as TextareaProps}
          />
        </Grid.Col>
      </Grid>
      <Group mt="lg" justify="flex-end">
        <Button variant="default" onClick={handleCancel}>
          Cancel
        </Button>
        <Button type="submit">Save spool</Button>
      </Group>
    </form>
  );
};

export default SpoolForm;
