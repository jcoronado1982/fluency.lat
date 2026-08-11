import React from 'react';
import { Outlet } from 'react-router-dom';

/** Rutas públicas sin chrome (landing, login). */
export default function BareLayout() {
    return <Outlet />;
}
