import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App.jsx';
import { MobileApp } from './MobileApp.jsx';
import { isMobileMode } from './utils/mobile.js';

const Root = isMobileMode() ? MobileApp : App;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
