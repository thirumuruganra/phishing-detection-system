// checksus.js
export function createDetectionNotification(result) {
    const message =
        result === 'blacklist'
            ? 'Suspicious site detected!'
            : 'Safe site detected';

    chrome.notifications.create('suspicious-url-notif', {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Phish Alert',
        message: message,
        buttons: [{ title: 'Open PhishTank' }],
        priority: 2
    });
}

export async function sendUrlToBackend(url) {
    try {
        const response = await fetch('http://127.0.0.1:8000/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        const data = await response.json();
        if (data.prediction == "legitimate") {
            return "whitelist";
        } else if (data.prediction == "phishing") {
            return "blacklist";
        }
    } catch (error) {
        console.error('Backend request failed:', error);
        return 'unknown';
    }
}

export async function sendEmailDataToBackend(emailData) {
    try {
        const response = await fetch('http://127.0.0.1:8000/predict_email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(emailData)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log("Backend response for email scan:", data);
        return data.prediction;

    } catch (error) {
        console.error('Backend request for email scan failed:', error);
        return 'error';
    }
}