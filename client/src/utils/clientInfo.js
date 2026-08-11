export function getClientInfo() {
    const ua = navigator.userAgent;

    let deviceType = 'desktop';
    if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) {
        deviceType = 'tablet';
    } else if (/Mobi|Android|iPhone|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
        deviceType = 'mobile';
    }

    let browser = 'Other';
    if (/Edg\//i.test(ua)) browser = 'Edge';
    else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
    else if (/Firefox\//i.test(ua)) browser = 'Firefox';
    else if (/Chrome\//i.test(ua)) browser = 'Chrome';
    else if (/Safari\//i.test(ua)) browser = 'Safari';

    let os = 'Other';
    if (/Windows/i.test(ua)) os = 'Windows';
    else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
    else if (/Linux/i.test(ua)) os = 'Linux';

    return {
        device_type: deviceType,
        browser,
        os,
    };
}

export function formatDeviceType(type) {
    const labels = {
        mobile: 'Mobile',
        tablet: 'Tablet',
        desktop: 'Desktop',
        unknown: 'Unknown',
    };
    return labels[type] || type;
}
