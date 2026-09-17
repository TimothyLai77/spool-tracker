import { Container, Stack, Text, Title } from "@mantine/core";

/** Staged jobs page (T10). Placeholder until staged jobs land. */
const StagedJobsPage = () => (
  <Container size="lg">
    <Stack gap="sm">
      <Title order={2}>Staged jobs</Title>
      <Text c="dimmed">Lands in a later phase (T10).</Text>
    </Stack>
  </Container>
);

export default StagedJobsPage;
