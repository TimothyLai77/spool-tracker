import { Button, Card, Container, Group, Paper, Text, Title } from "@mantine/core";
import { useMantineColorScheme } from "@mantine/core";

/**
 * App shell placeholder. MantineProvider + redux Provider live in main.tsx;
 * the router, real pages (Home, SpoolDetail, …) and the Notifications host
 * land in the next step. This block renders representative components so the
 * theme can be verified by eye before the shell replaces it.
 */
const ThemePreview = () => {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  return (
    <Container size="md" py="xl">
      <Group justify="space-between" align="center" mb="lg">
        <Title order={2}>Spool Tracker</Title>
        <Button variant="subtle" onClick={() => toggleColorScheme()}>
          {colorScheme === "dark" ? "Light mode" : "Dark mode"}
        </Button>
      </Group>
      <Card withBorder radius="md" p="md" mb="md">
        <Group justify="space-between" align="center">
          <Group gap="xs" align="center">
            <span
              aria-hidden
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: "#1a1a1a",
                display: "inline-block",
              }}
            />
            <Text size="xs" tt="uppercase" c="dimmed" fw={500}>
              esun · PLA · satin
            </Text>
          </Group>
          <Text span ff="monospace" c="dimmed">
            712 g / 750 g
          </Text>
        </Group>
        <Title order={4} mt="xs">
          Shelf spool one
        </Title>
        <Group mt="sm">
          <Button size="xs">Save spool</Button>
          <Button size="xs" variant="default">
            Finish spool
          </Button>
        </Group>
      </Card>
      <Paper withBorder radius="md" p="sm">
        <Text ff="monospace" size="sm">
          $12.99 · 4 jobs · 40.25 g
        </Text>
      </Paper>
    </Container>
  );
};

const App = () => <ThemePreview />;

export default App;
