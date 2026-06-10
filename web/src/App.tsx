import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { Home } from './pages/Home';
import { Transfer } from './pages/Transfer';
import { Prompts } from './pages/Prompts';
import { Devices } from './pages/Devices';
import { Settings } from './pages/Settings';
import { Welcome } from './pages/Welcome';
import { DesignSystem } from './pages/DesignSystem';

const isDev = import.meta.env.DEV;

export default function App() {
  return (
    <Routes>
      <Route path="/welcome" element={<Welcome />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<Home />} />
        <Route path="/transfer" element={<Transfer />} />
        <Route path="/prompts" element={<Prompts />} />
        <Route path="/devices" element={<Devices />} />
        <Route path="/settings" element={<Settings />} />
        {isDev && <Route path="/design-system" element={<DesignSystem />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
