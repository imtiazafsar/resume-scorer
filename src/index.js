import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import Admin from './Admin';
import Enterprise from './Enterprise';
import LinkedIn from './LinkedIn';

const path = window.location.pathname;
const isAdmin      = path.startsWith('/admin');
const isEnterprise = path.startsWith('/enterprise');
const isLinkedIn   = path.startsWith('/linkedin');
const isJobMatch   = path.startsWith('/job-match');

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  isAdmin      ? <Admin /> :
  isEnterprise ? <Enterprise /> :
  isLinkedIn   ? <LinkedIn /> :
  isJobMatch   ? <App mode="job" /> :
                 <App mode="general" />
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}
