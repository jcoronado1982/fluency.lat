import { Navigate, useLocation } from 'react-router-dom';

/**
 * Evita bucles de React Router cuando destino === pathname actual.
 */
export default function SafeRedirect({ to, replace = true }) {
    const location = useLocation();
    if (location.pathname === to) return null;
    return <Navigate to={to} replace={replace} state={location.state} />;
}
