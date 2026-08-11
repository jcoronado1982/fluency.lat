import React from 'react';
import { Outlet } from 'react-router-dom';
import config from '../../config';
import { getModuleOverlays } from '../../modules';

/** Fallback compartido cuando el módulo dashboard no está en sparse-checkout. */
export default function MinimalAppShell() {
    const moduleOverlays = getModuleOverlays(config);

    return (
        <div className="minimal-app-shell">
            <main className="page-content">
                <Outlet />
            </main>
            {moduleOverlays.map((overlay, index) => (
                <React.Fragment key={index}>{overlay}</React.Fragment>
            ))}
        </div>
    );
}
