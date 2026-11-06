import React from 'react';
import { StoreProvider } from './store';
import { useRoute } from './lib/router';
import { Shell } from './components/Shell';
import { Dashboard } from './views/Dashboard';
import { Calls } from './views/Calls';
import { CallDetail } from './views/CallDetail';
import { Upload } from './views/Upload';
import { FollowUps } from './views/FollowUps';
import { Customers } from './views/Customers';
import { Products } from './views/Products';
import { CustomerProfile } from './views/CustomerProfile';
import { DialogHost } from './components/Dialog';
import { ToastHost } from './components/Toast';
import { DriveWatcher } from './components/DriveWatcher';
import { Drive } from './views/Drive';

const Routes: React.FC = () => {
  const route = useRoute();
  const qs = route.query.toString();
  return (
    <Shell view={route.view} id={route.id}>
      {route.view === 'dashboard' && <Dashboard />}
      {route.view === 'calls' &&
        (route.id ? (
          <CallDetail key={route.id} id={route.id} />
        ) : (
          <Calls
            key={qs}
            initialQuery={route.query.get('q') || undefined}
            initialCategory={route.query.get('category') || undefined}
            initialRange={route.query.get('range') || undefined}
          />
        ))}
      {route.view === 'upload' && <Upload />}
      {route.view === 'followups' && <FollowUps />}
      {route.view === 'customers' &&
        (route.id ? <CustomerProfile key={route.id} id={route.id} /> : <Customers key={qs} startNew={route.query.get('new') === '1'} />)}
      {route.view === 'products' && <Products />}
      {route.view === 'drive' && <Drive key={qs} openId={route.query.get('open') || undefined} />}
    </Shell>
  );
};

export default function App() {
  return (
    <StoreProvider>
      <Routes />
      <DialogHost />
      <ToastHost />
      <DriveWatcher />
    </StoreProvider>
  );
}
