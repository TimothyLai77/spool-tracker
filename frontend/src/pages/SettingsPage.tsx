import {
  Container,
  Divider,
  SegmentedControl,
  Stack,
  Text,
  Title,
  useMantineColorScheme,
} from "@mantine/core";

/**
 * Settings page.
 *
 * Appearance (ui-plan §4): the color-scheme toggle lives here on both sizes —
 * one place, less chrome. The choice is persisted across reloads by the
 * `localStorageColorSchemeManager` wired up in `main.tsx` (key
 * `spool-tracker:color-scheme`); the segmented control just reads and writes
 * that state through `useMantineColorScheme`.
 *
 * Printers + AMS mappings land in a later phase (T11).
 */
const SettingsPage = () => {
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  return (
    <Container size="lg">
      <Stack gap="lg">
        <Title order={2}>Settings</Title>

        {/* Appearance */}
        <Stack gap="xs">
          <Text fw={600}>Appearance</Text>
          <Text c="dimmed" size="sm">
            Pick light or dark. Your choice is remembered on this device.
          </Text>
          <SegmentedControl
            value={colorScheme}
            onChange={setColorScheme}
            aria-label="Color scheme"
            data={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
            style={{ width: 220 }}
          />
        </Stack>

        <Divider />

        {/* Printers (T11) */}
        <Stack gap="sm">
          <Text fw={600}>Printers</Text>
          <Text c="dimmed">Lands in a later phase (T11).</Text>
        </Stack>
      </Stack>
    </Container>
  );
};

export default SettingsPage;
