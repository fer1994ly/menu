import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { HomeScreen } from '@/features/home/ui/HomeScreen';
import { AppServicesProvider } from './AppServicesProvider';
import { AppShell } from './AppShell';
import { DataVersionProvider, WeekProvider } from './DataProviders';
import { BlockingNotice, LoadingScreen, MoreScreen, NotFound } from './GlobalScreens';

/** Shell + routes. Needs a ready `AppServicesProvider` and a router above it. */
export function AppRoutes() {
  return (
    <DataVersionProvider>
      <WeekProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/mas" element={<MoreScreen />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </WeekProvider>
    </DataVersionProvider>
  );
}

export function App() {
  return (
    <AppServicesProvider loading={<LoadingScreen />} unavailable={(message) => <BlockingNotice message={message} />}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppServicesProvider>
  );
}
