import { Container, Divider, Group, Title } from "@mantine/core";

/**
 * App shell placeholder. MantineProvider + redux Provider live in main.tsx;
 * the router, real pages (Home, SpoolDetail, …) and the Notifications host
 * land in phase 3+.
 */
const App = () => (
  <>
    <Group h={60} px="md" align="center" pos="relative">
      <Title order={3}>Spool Tracker</Title>
    </Group>
    <Divider />
    <Container mt="md" ta="center" c="dimmed">
      Nothing here yet — spool pages land in phase 3.
    </Container>
  </>
);

export default App;
