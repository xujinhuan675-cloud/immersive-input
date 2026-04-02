import { Navigate } from 'react-router-dom';

import Translate from '../pages/Translate';
import Recognize from '../pages/Recognize';
import General from '../pages/General';
import Service from '../pages/Service';
import History from '../pages/History';
import Hotkey from '../pages/Hotkey';
import Backup from '../pages/Backup';
import About from '../pages/About';
import AIFeatures from '../pages/AIFeatures';
import Account from '../pages/Account';

const routes = [
    {
        path: '/general',
        element: <General />,
    },
    {
        path: '/translate',
        element: <Translate />,
    },
    {
        path: '/recognize',
        element: <Recognize />,
    },
    {
        path: '/hotkey',
        element: <Hotkey />,
    },
    {
        path: '/service',
        element: <Service />,
    },
    {
        path: '/history',
        element: <History />,
    },
    {
        path: '/backup',
        element: <Backup />,
    },
    {
        path: '/about',
        element: <About />,
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
