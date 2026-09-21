import { Card, Container, Group, Stack, Text, Title } from "@mantine/core";
import { useState } from "react";
import type { StagedJob } from "@shared/types";
import { useListStagedJobsQuery } from "../api/stagedJobsApi";
import CommitStagedJobFlow from "../features/staged/CommitStagedJobFlow";
import NewStagedJobForm from "../features/staged/NewStagedJobForm";
import StagedJobList from "../features/staged/StagedJobList";

/**
 * Staged jobs (DESIGN.md §7, T10) — finished prints awaiting a spool.
 *
 * Two sources: printer detection (T11 — the list polls every 15 s so new
 * entries appear without a refresh) and manual entry below. The commit flow
 * is a row action; committing debits the spool, records the job, and removes
 * the staged row server-side in one transaction.
 */
const StagedJobsPage = () => {
  // Poll every 15 s (DESIGN §7) so printer-detected entries appear without
  // a refresh.
  const { data: stagedJobs, isLoading, isError } = useListStagedJobsQuery(undefined, {
    pollingInterval: 15_000,
  });
  const [committing, setCommitting] = useState<StagedJob | null>(null);

  return (
    <Container size="lg" py="sm">
      <Stack gap="lg">
        {/* Header: title + count */}
        <Group justify="space-between" align="baseline" wrap="wrap" gap="md">
          <Title order={2}>Staged jobs</Title>
          {!isLoading && stagedJobs && (
            <Text ff="monospace" size="sm" c="dimmed">
              {stagedJobs.length}{" "}
              {stagedJobs.length === 1 ? "waiting" : "waiting"}
            </Text>
          )}
        </Group>

        {/* The queue */}
        {isLoading ? (
          <Text c="dimmed">Loading…</Text>
        ) : isError ? (
          <Text c="red">Could not load staged jobs.</Text>
        ) : stagedJobs && stagedJobs.length > 0 ? (
          <StagedJobList jobs={stagedJobs} onCommit={setCommitting} />
        ) : (
          <Text c="dimmed">
            Nothing waiting. Prints finished on the printer will land here
            automatically; you can also add one manually below.
          </Text>
        )}

        {/* Manual entry */}
        <Card withBorder radius="md" p="md">
          <Stack gap="md">
            <Text size="sm" tt="uppercase" c="dimmed" fw={500}>
              Add manually
            </Text>
            <NewStagedJobForm />
          </Stack>
        </Card>
      </Stack>

      {/* Commit flow — mounted only while a staged job is being committed */}
      {committing && (
        <CommitStagedJobFlow staged={committing} onClose={() => setCommitting(null)} />
      )}
    </Container>
  );
};

export default StagedJobsPage;
