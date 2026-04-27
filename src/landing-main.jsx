import ReactDOM from 'react-dom/client';
import React from 'react';

import LandingPage from './web/LandingPage';
import './web/landing.css';

const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);

root.render(
    <React.StrictMode>
        <LandingPage />
    </React.StrictMode>
);
