import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App.jsx';
import { MobileApp } from './MobileApp.jsx';
import { PlaybackWindow } from './PlaybackWindow.jsx';
import { getBootMode } from './utils/mode.js';

function pickRoot() {
  switch (getBootMode()) {
    case 'playback':
      return PlaybackWindow;
    case 'mobile':
      return MobileApp;
    default:
      return App;
  }
}

const Root = pickRoot();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
