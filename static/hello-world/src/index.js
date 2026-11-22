import React from 'react';
import { createRoot } from 'react-dom/client';
// Reset first, so App.css can override it.
import '@atlaskit/css-reset';
import App from './App';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
