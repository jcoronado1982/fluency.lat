import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './layout/Sidebar';
import Header from './layout/Header';
import Footer from './layout/Footer';
import { useAppContext } from '../../context/AppContext';
import config from '../../config';
import { getModuleOverlays } from '../index';

/**
 * Shell autenticado del módulo dashboard (sidebar, header, footer, overlays).
 * Solo existe en disco si el módulo está en sparse-checkout.
 */
export default function DashboardShell() {
    const { isSidebarOpen, setIsSidebarOpen } = useAppContext();
    const moduleOverlays = getModuleOverlays(config);

    // Árbol estable: nunca condicionar el layout completo (evita remount del Outlet).
    return (
        <div className="app-layout">
            <Sidebar />

            {isSidebarOpen && (
                <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />
            )}

            <div className={`main-content ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
                <Header />
                <main className="page-content">
                    <Outlet />
                </main>
                <Footer />
            </div>

            {moduleOverlays.map((overlay, index) => (
                <React.Fragment key={index}>{overlay}</React.Fragment>
            ))}
        </div>
    );
}
