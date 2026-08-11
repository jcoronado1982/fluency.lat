import React, { useState } from 'react';
import { useAdminUsersActivity, useAdminCountriesStats, useAdminDailyStats } from './useAdminDashboardData';
import { formatDeviceType } from '../utils/clientInfo';
import AdminDailyChart from './AdminDailyChart';
import './AdminPage.css';

function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
}

function formatRetention(days) {
    if (!days || days <= 0) return 'New';
    if (days === 1) return '1 day';
    return `${days} days`;
}

function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-US', {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function AdminPage() {
    const [page, setPage] = useState(1);
    const { data, loading, error, setLoading } = useAdminUsersActivity(page);
    const countries = useAdminCountriesStats();
    const dailyStats = useAdminDailyStats(30);

    const onlineCount = data.users.filter((u) => u.is_online).length;
    const maxCountryCount = countries.reduce((max, c) => Math.max(max, c.count), 0);
    const totalUsersLatest = dailyStats.length > 0 ? dailyStats[dailyStats.length - 1].total_users : null;

    return (
        <div className="admin-page">
            <header className="admin-header">
                <h1>Administration Panel</h1>
                <p className="admin-subtitle">
                    {data.total} registered user{data.total !== 1 ? 's' : ''} · {onlineCount} online on this page
                </p>
            </header>

            {dailyStats.length > 0 && (
                <section className="admin-charts">
                    <AdminDailyChart
                        title="Daily active users"
                        color="#38bdf8"
                        points={dailyStats.map((d) => ({ date: d.date, value: d.dau }))}
                    />
                    <AdminDailyChart
                        title="New signups"
                        color="#818cf8"
                        points={dailyStats.map((d) => ({ date: d.date, value: d.new_signups }))}
                    />
                    <AdminDailyChart
                        title="Retained users (7d)"
                        color="#4ade80"
                        points={dailyStats.map((d) => ({ date: d.date, value: d.retained_7d }))}
                    />
                    {totalUsersLatest !== null && (
                        <div className="admin-stat-tile">
                            <div className="admin-chart-header" style={{ marginBottom: 0 }}>
                                <span className="admin-chart-title">Total users</span>
                                <span className="admin-chart-headline">{totalUsersLatest}</span>
                            </div>
                        </div>
                    )}
                </section>
            )}

            {countries.length > 0 && (
                <section className="admin-countries">
                    <h2 className="admin-section-title">Users by country</h2>
                    <ul className="admin-countries-list">
                        {countries.map((c) => (
                            <li key={c.country} className="admin-country-row">
                                <span className="admin-country-name">{c.country}</span>
                                <div className="admin-country-bar-track">
                                    <div
                                        className="admin-country-bar-fill"
                                        style={{
                                            width: `${maxCountryCount > 0 ? (c.count / maxCountryCount) * 100 : 0}%`,
                                        }}
                                    />
                                </div>
                                <span className="admin-country-count">{c.count}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {loading && data.users.length === 0 && <p className="admin-status">Loading users...</p>}
            {error && <p className="admin-error">{error}</p>}

            {(!loading || data.users.length > 0) && !error && (
                <>
                    <div className="admin-table-wrap">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>User</th>
                                    <th>Status</th>
                                    <th>Device</th>
                                    <th>Country</th>
                                    <th>Visits</th>
                                    <th>Avg Time</th>
                                    <th>Current Session</th>
                                    <th>Retention</th>
                                    <th>Last Access</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.users.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="admin-empty">
                                            No registered users yet.
                                        </td>
                                    </tr>
                                ) : (
                                    data.users.map((user) => (
                                        <tr key={user.email} className={user.is_online ? 'row-online' : ''}>
                                            <td>
                                                <div className="admin-user-cell">
                                                    {user.picture && (
                                                        <img
                                                            src={user.picture}
                                                            alt=""
                                                            className="admin-avatar"
                                                        />
                                                    )}
                                                    <div>
                                                        <span className="admin-name">{user.name}</span>
                                                        <span className="admin-email">{user.email}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`status-badge ${user.is_online ? 'online' : 'offline'}`}>
                                                    {user.is_online ? 'Online' : 'Offline'}
                                                </span>
                                            </td>
                                            <td>
                                                {user.device_type ? (
                                                    <div className="admin-device-cell">
                                                        <span className="admin-device-type">
                                                            {formatDeviceType(user.device_type)}
                                                        </span>
                                                        <span className="admin-device-detail">
                                                            {user.browser} · {user.os}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    '—'
                                                )}
                                            </td>
                                            <td>{user.country || '—'}</td>
                                            <td>{user.visit_count}</td>
                                            <td>{formatDuration(user.avg_duration_secs)}</td>
                                            <td>
                                                {user.is_online
                                                    ? formatDuration(user.current_session_secs)
                                                    : '—'}
                                            </td>
                                            <td>{formatRetention(user.retention_days)}</td>
                                            <td>{formatDate(user.last_login)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {data.total_pages > 1 && (
                        <div className="admin-pagination">
                            <button
                                disabled={data.page === 1}
                                onClick={() => {
                                    setPage((p) => p - 1);
                                    setLoading(true);
                                }}
                            >
                                Previous
                            </button>
                            <span className="pagination-info">
                                Page {data.page} of {data.total_pages}
                            </span>
                            <button
                                disabled={data.page === data.total_pages}
                                onClick={() => {
                                    setPage((p) => p + 1);
                                    setLoading(true);
                                }}
                            >
                                Next
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
