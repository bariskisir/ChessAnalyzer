// Mounts the React analysis workspace with development lifecycle checks.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.scss';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
