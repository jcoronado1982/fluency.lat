import React from 'react';
import { LuLayoutDashboard } from 'react-icons/lu';
import ProtectedRoute from '../../components/common/ProtectedRoute';
import { DASHBOARD_HOME_PATH } from '../routingPaths';
import DashboardShell from './DashboardShell';
import DashboardHome from './DashboardHome';
import { getDashboardTranslations } from './config/translations';

const dashboardModule = {
    id: 'dashboard',
    enabled: (config) => config.features.dashboard,
    appShell: DashboardShell,
    routes: (config) => {
        if (!config.features.dashboard) return [];
        return [{
            path: DASHBOARD_HOME_PATH,
            element: (
                <ProtectedRoute>
                    <DashboardHome />
                </ProtectedRoute>
            ),
        }];
    },
    navSections: ({ language, config }) => {
        if (!config.features.dashboard) return [];
        const t = getDashboardTranslations(language);
        return [{
            id: 'dashboard',
            label: t.sectionLabel,
            items: [{
                id: 'dashboard-home',
                to: DASHBOARD_HOME_PATH,
                icon: <LuLayoutDashboard />,
                color: 'brand',
                name: t.homeName,
                sub: t.homeSub,
            }],
        }];
    },
};

export default dashboardModule;
