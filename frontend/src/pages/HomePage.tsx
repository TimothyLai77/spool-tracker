import {
  Anchor,
  Button,
  Container,
  Grid,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useNavigate } from "react-router-dom";
import { useListSpoolsQuery } from "../api/spoolsApi";
import SpoolCard from "../features/spools/SpoolCard";

/**
 * Home — the spool shelf (ui-plan §5.1).
 *
 * The shelf itself is the page: title row with active/finished counts and the
 * create action (button on desktop, FAB on phone), then the active grid, then
 * a muted finished section. 1 / 2 / 3 / 4 columns across breakpoints.
 */
const HomePage = () => {
  const navigate = useNavigate();
  const { data: spools, isLoading } = useListSpoolsQuery();

  const active = spools?.filter((s) => !s.isFinished) ?? [];
  const finished = spools?.filter((s) => s.isFinished) ?? [];

  return (
    <Container size="lg" py="sm">
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Group align="baseline" gap="sm">
            <Title order={2}>Spools</Title>
            {!isLoading && (
              <Text ff="monospace" size="sm" c="dimmed">
                {active.length} active · {finished.length} finished
              </Text>
            )}
          </Group>
          {/* Desktop create action; phone gets the FAB below. */}
          <Button visibleFrom="md" onClick={() => navigate("/spools/new")}>
            + New spool
          </Button>
        </Group>

        {active.length > 0 ? (
          <Grid gap="md">
            {active.map((spool) => (
              <Grid.Col
                key={spool.id}
                span={{ base: 12, sm: 6, lg: 4, xl: 3 }}
              >
                <SpoolCard spool={spool} />
              </Grid.Col>
            ))}
          </Grid>
        ) : (
          !isLoading && (
            <Stack gap="sm" align="flex-start">
              <Text c="dimmed">No spools yet.</Text>
              <Button size="xs" onClick={() => navigate("/spools/new")}>
                Add your first spool
              </Button>
            </Stack>
          )
        )}

        {finished.length > 0 && (
          <Stack gap="sm">
            <Text size="sm" tt="uppercase" c="dimmed" fw={500}>
              Finished
            </Text>
            <Grid gap="md">
              {finished.map((spool) => (
                <Grid.Col
                  key={spool.id}
                  span={{ base: 12, sm: 6, lg: 4, xl: 3 }}
                >
                  <SpoolCard spool={spool} />
                </Grid.Col>
              ))}
            </Grid>
          </Stack>
        )}
      </Stack>

      {/* Phone-only create action, above the tab bar (ui-plan §5.1). */}
      <Anchor
        href="/spools/new"
        className="st-fab"
        hiddenFrom="md"
        aria-label="New spool"
      >
        +
      </Anchor>
    </Container>
  );
};

export default HomePage;
