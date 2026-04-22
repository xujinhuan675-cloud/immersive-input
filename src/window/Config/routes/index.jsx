import { Navigate } from 'react-router-dom';

import TranslatePage from '../pages/TranslatePage';
import General from '../pages/GeneralPage';
import History from '../pages/History';
import Hotkey from '../pages/Hotkey';
import AIFeatures from '../pages/AIFeatures';
import Account from '../pages/Account';

const routes = [
    {
        path: '/general',
        element: <General />,
    },
    {
        path: '/translate',
        element: <TranslatePage />,
    },
    {
        path: '/recognize',
        element: <Navigate to='/translate?tab=recognize' replace />,
    },
    {
        path: '/hotkey',
        element: <Hotkey />,
    },
    {
        path: '/service',
        element: <Navigate to='/translate' replace />,
    },
    {
        path: '/history',
        element: <History />,
    },
    {
        path: '/about',
        element: <Navigate to='/general' replace />,
    },
    {
        path: '/ai',
        element: <AIFeatures />,
    },
    {
        path: '/account',
        element: <Account />,
    },
    {
        path: '/',
        element: <Navigate to='/general' />,
    },
];

export default routes;
