import { Container, Stack, Title } from "@mantine/core";
import SpoolForm from "../features/spools/SpoolForm";

/**
 * Spool form page — create host (ui-plan §5.3). The edit host (modal on
 * SpoolDetail) reuses the same component in step 6.
 */
const SpoolFormPage = () => (
  <Container size="md" py="sm">
    <Stack gap="lg">
      <Title order={2}>New spool</Title>
      <SpoolForm />
    </Stack>
  </Container>
);

export default SpoolFormPage;
