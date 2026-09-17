import { Container, Stack, Text, Title } from "@mantine/core";
import { useParams } from "react-router-dom";

/**
 * Spool detail (ui-plan §5.2). Placeholder for this step — the real layout
 * (gauge, stats, actions, job history) lands in step 6.
 */
const SpoolDetailPage = () => {
  const { id } = useParams();

  return (
    <Container size="lg">
      <Stack gap="sm">
        <Title order={2}>Spool</Title>
        <Text c="dimmed" ff="monospace" size="sm" truncate>
          {id}
        </Text>
        <Text c="dimmed">Detail lands in a later step.</Text>
      </Stack>
    </Container>
  );
};

export default SpoolDetailPage;
