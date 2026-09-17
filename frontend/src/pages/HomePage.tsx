import { Button, Container, Group, Stack, Text, Title } from "@mantine/core";
import { useNavigate } from "react-router-dom";

/**
 * Home — the spool shelf (ui-plan §5.1). Placeholder for this step: the
 * title row + entry action exist; the spool grid and gauge land in step 4.
 */
const HomePage = () => {
  const navigate = useNavigate();

  return (
    <Container size="lg">
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Title order={2}>Spools</Title>
          <Button onClick={() => navigate("/spools/new")}>+ New spool</Button>
        </Group>
        <Text c="dimmed">The spool grid lands in the next step.</Text>
      </Stack>
    </Container>
  );
};

export default HomePage;
