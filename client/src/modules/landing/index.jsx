import LandingPage from './LandingPage';

const landingModule = {
    id: 'landing',
    enabled: (config) => config.features.landing,
    routes: () => [{
        path: '/',
        element: <LandingPage />,
        layout: 'bare',
        public: true,
    }],
};

export default landingModule;
