import { Container, Stack, Text, Title } from "@mantine/core";

/**
 * Spool form page — create host (ui-plan §5.3). Placeholder for this step;
 * the form component lands in step 5.
 */
const SpoolFormPage = () => (
  <Container size="lg">
    <Stack gap="sm">
      <Title order={2}>New spool</Title>
      <Text c="dimmed">The spool form lands in a later step.</Text>
    </Stack>
  </Container>
);

export default SpoolFormPage;
