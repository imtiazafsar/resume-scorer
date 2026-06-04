import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import Admin from './Admin';
import Enterprise from './Enterprise';

const path = window.location.pathname;
const isAdmin      = path.startsWith('/admin');
const isEnterprise = path.startsWith('/enterprise');

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(isAdmin ? <Admin /> : isEnterprise ? <Enterprise /> : <App />);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}
