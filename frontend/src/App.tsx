import { AppShell, Box, Group, NavLink, Stack, Text, UnstyledButton } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import "@mantine/notifications/styles.css";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import HomePage from "./pages/HomePage";
import SpoolDetailPage from "./pages/SpoolDetailPage";
import SpoolFormPage from "./pages/SpoolFormPage";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import StagedJobsPage from "./pages/StagedJobsPage";
import SettingsPage from "./pages/SettingsPage";

/**
 * App shell (ui-plan §4): one layout, two faces.
 * - phone (< md / 768 px): fixed bottom tab bar — thumb-reachable, and the
 *   staged-jobs entry stays visible for the "next to the printer" moment.
 * - desktop (>= md): 200 px left rail.
 *
 * Nav state comes from the router (no active-state duplication).
 */

/** The four sections; order = tab order on phone. */
const NAV_ITEMS = [
  { label: "Spools", path: "/" },
  { label: "Projects", path: "/projects" },
  { label: "Staged jobs", path: "/staged" },
  { label: "Settings", path: "/settings" },
] as const;

/**
 * Whether a nav path matches the current location. "/" is exact (it is a
 * prefix of everything); the others match their subtree (e.g. /spools/:id).
 * @param path Nav item path.
 * @param pathname Current location pathname.
 * @returns True when the nav item is the active section.
 */
const isSectionActive = (path: string, pathname: string): boolean =>
  path === "/" ? pathname === "/" : pathname.startsWith(path);

/** Left rail, desktop only. */
const Rail = ({ pathname }: { pathname: string }) => {
  const navigate = useNavigate();

  return (
    <AppShell.Navbar visibleFrom="md">
      <Stack gap="xs" p="md" h="100%">
        <Text fw={700} tt="uppercase" fs="xs" c="dimmed" mt="sm" mb="md">
          Spool Tracker
        </Text>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            label={item.label}
            active={isSectionActive(item.path, pathname)}
            onClick={() => navigate(item.path)}
            style={{ width: "100%" }}
          />
        ))}
      </Stack>
    </AppShell.Navbar>
  );
};

/** Bottom tab bar, phone only. Safe-area padded; 48 px+ touch targets. */
const MobileTabBar = ({ pathname }: { pathname: string }) => {
  const navigate = useNavigate();

  return (
    <Box
      className="st-tabbar"
      pos="fixed"
      bottom={0}
      left={0}
      right={0}
      style={{ zIndex: 100 }}
      hiddenFrom="md"
    >
      <Group justify="space-around" w="100%" component="nav" aria-label="Sections">
        {NAV_ITEMS.map((item) => {
          const active = isSectionActive(item.path, pathname);
          return (
            <UnstyledButton
              key={item.path}
              className={active ? "st-tab st-tab-active" : "st-tab"}
              onClick={() => navigate(item.path)}
              aria-current={active ? "page" : undefined}
            >
              <Text ta="center" size="sm" c="inherit" truncate>
                {item.label}
              </Text>
            </UnstyledButton>
          );
        })}
      </Group>
    </Box>
  );
};

const App = () => {
  const { pathname } = useLocation();

  return (
    <>
      <Notifications position="top-center" />
      {/* navbar config (Mantine 9): 200 px rail from md up; below md the
          breakpoint zeroes the width/offset and the slot is hidden, leaving
          the bottom tab bar as the only nav. */}
      <AppShell padding="md" navbar={{ width: 200, breakpoint: "md" }}>
        <Rail pathname={pathname} />
        <AppShell.Main className="st-main">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/spools/new" element={<SpoolFormPage />} />
            <Route path="/spools/:id" element={<SpoolDetailPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:id" element={<ProjectDetailPage />} />
            <Route path="/staged" element={<StagedJobsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </AppShell.Main>
        <MobileTabBar pathname={pathname} />
      </AppShell>
    </>
  );
};

export default App;
