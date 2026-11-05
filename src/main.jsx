import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { AppProvider } from './context/AppContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { CatalogProvider } from './context/CatalogContext.jsx';
import ActivityReporter from './components/ActivityReporter.jsx';
import AppErrorBoundary from './components/AppErrorBoundary.jsx';
import './styles/styles.css';
import './styles/cinema.css';
import './styles/binder.css';
import './styles/connected.css';
import './styles/auth.css';
import './styles/admin.css';

createRoot(document.getElementById('root')).render(
  <StrictMode><AuthProvider><CatalogProvider><AppProvider><ActivityReporter /><AppErrorBoundary><App /></AppErrorBoundary></AppProvider></CatalogProvider></AuthProvider></StrictMode>,
);
