import { httpClient } from '../services/httpClient';

export const adminRepository = {
    async getUsersActivity(page = 1, limit = 25) {
        return httpClient.get(`/api/admin/users/activity?page=${page}&limit=${limit}`);
    },
    async getUsersByCountry() {
        return httpClient.get('/api/admin/users/countries');
    },
    async getDailyStats(days = 30) {
        return httpClient.get(`/api/admin/stats/daily?days=${days}`);
    },
};
