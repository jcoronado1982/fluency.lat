import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useAppContext } from '../../context/AppContext';
import config from '../../config';
import { getDashboardTranslations } from './config/translations';
import { useLearningStats } from './hooks/useLearningStats';
import DashboardHero from './features/DashboardHero';
import PageLoader from '../../components/common/PageLoader';
import './DashboardHome.css';
import { getCourseDirectionFromStudyLanguage } from '../../contracts/courseDirection.js';

export default function DashboardHome() {
    const { user, isAuthenticated } = useAuth();
    const { language = 'en', studyLanguage = 'en' } = useAppContext();
    const t = getDashboardTranslations(language);
    const courseDirection = getCourseDirectionFromStudyLanguage(studyLanguage);
    const { stats, loading: statsLoading } = useLearningStats(
        isAuthenticated && config.features.flashcards,
        courseDirection,
    );

    const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || '';

    if (statsLoading) {
        const title = language === 'es' ? 'Cargando Estadísticas' : 'Loading Stats';
        const subtitle = language === 'es' ? 'Preparando tu panel de aprendizaje' : 'Preparing your learning dashboard';
        const status = language === 'es' ? 'Obteniendo progreso...' : 'Fetching progress...';
        return (
            <PageLoader
                title={title}
                subtitle={subtitle}
                status={status}
                progress={50}
            />
        );
    }

    return (
        <div className="dashboard-home shell-content-inner">
            {config.features.flashcards && (
                <>
                    <DashboardHero
                        stats={stats}
                        statsLoading={statsLoading}
                        labels={t}
                        language={language}
                        userName={firstName}
                        userEmail={user?.email}
                        courseDirection={courseDirection}
                    />
                </>
            )}
        </div>
    );
}
