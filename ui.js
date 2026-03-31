// ui.js
import { sendEmailDataToBackend } from './checksus.js';

function loadAllItems() {
    chrome.storage.local.get(null, function(items) {
        const whitelistUrlList = document.getElementById('whitelist-list-url');
        const blacklistUrlList = document.getElementById('blacklist-list-url');
        const blacklistEmailList = document.getElementById('blacklist-list-email');

        if (whitelistUrlList) whitelistUrlList.innerHTML = '';
        if (blacklistUrlList) blacklistUrlList.innerHTML = '';
        if (blacklistEmailList) blacklistEmailList.innerHTML = '';

        for (const [key, value] of Object.entries(items)) {
            if (typeof value === 'string' && key.startsWith('http')) {
                const classification = value;
                const cardHTML = `
                    <div class="card">
                        <span class="icon ${classification === "blacklist" ? "warn-icon" : "safe-icon"}">${classification === "blacklist" ? "!" : "✔"}</span>
                        <div class="card-details">
                            <h3>${classification === "blacklist" ? "Blacklisted" : "Whitelisted"} URL</h3>
                            <p class="url">${key}</p>
                        </div>
                    </div>
                `;
                if (classification === "blacklist" && blacklistUrlList) blacklistUrlList.innerHTML += cardHTML;
                if (classification === "whitelist" && whitelistUrlList) whitelistUrlList.innerHTML += cardHTML;
            } else if (typeof value === 'object' && value.type === 'email') {
                if (value.classification === 'blacklist' && blacklistEmailList) {
                    const { from, subject, body } = value;
                    const truncatedBody = body.length > 15 ? body.substring(0, 15) + '...' : body;
                    const cardHTML = `
                        <div class="card">
                            <div class="card-details">
                                <h3>Suspicious Mail</h3>
                                <p class="email-address">${from}</p>
                                <div class="email-details-card">
                                    <span class="icon warn-icon">!</span>
                                    <div>
                                        <span class="email-subject">${subject}</span>
                                        <span class="email-body">${truncatedBody}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                    blacklistEmailList.innerHTML += cardHTML;
                }
            }
        }
    });
}

chrome.storage.onChanged.addListener(function(changes, areaName) {
    if (areaName === "local") loadAllItems();
});

document.addEventListener('DOMContentLoaded', function () {
    loadAllItems();

    const threatsList = document.getElementById('threats-list');
    const tempAlert = document.querySelector('.temporary-alert');
    const navTabs = document.querySelectorAll('.nav-tab');
    const sliderUnderline = document.querySelector('.slider-underline');
    const contentSlider = document.querySelector('.content-slider');
    const closeAlertBtn = document.getElementById('close-alert-btn');
    const scanUrlBtn = document.getElementById('scan-url-btn');
    const scanEmailBtn = document.getElementById('scan-email-btn');
    const navBtn = document.getElementById('nav-btn');
    const actionsContainer = document.querySelector('.actions-container');

    chrome.tabs.query({ active: true, currentWindow: true }, async function(tabs) {
        const tab = tabs[0];
        if (tab && tab.url) {
            chrome.storage.local.get([tab.url], function(result) {
                if (result[tab.url] === 'blacklist') {
                    tempAlert.classList.remove('hidden');
                    const cardHTML = `
                        <div class="card">
                            <span class="icon warn-icon">!</span>
                            <div class="card-details">
                                <h3>Blacklisted URL</h3>
                                <p class="url">${tab.url}</p>
                            </div>
                        </div>
                    `;
                    if (threatsList) threatsList.innerHTML = cardHTML;
                }
            });
        }
    });

    function updateSlider(tab) {
        const tabWidth = tab.offsetWidth;
        const tabOffsetLeft = tab.offsetLeft;
        sliderUnderline.style.width = `${tabWidth}px`;
        sliderUnderline.style.transform = `translateX(${tabOffsetLeft}px)`;
        const tabIndex = parseInt(tab.dataset.tab);
        const contentWidth = contentSlider.querySelector('.tab-content').offsetWidth;
        contentSlider.style.transform = `translateX(-${tabIndex * contentWidth}px)`;
        navTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
    }
    const initialActiveTab = document.querySelector('.nav-tab.active');
    if (initialActiveTab) setTimeout(() => updateSlider(initialActiveTab), 0);
    navTabs.forEach(tab => {
        tab.addEventListener('click', (event) => {
            event.preventDefault();
            updateSlider(tab);
        });
    });

    if (closeAlertBtn && tempAlert) {
        closeAlertBtn.addEventListener('click', () => {
            tempAlert.classList.add('hidden');
        });
    }

    if (scanUrlBtn && scanEmailBtn) {
        scanUrlBtn.addEventListener('click', () => {
            scanUrlBtn.classList.add('active');
            scanEmailBtn.classList.remove('active');
        });
        scanEmailBtn.addEventListener('click', async () => {
            scanEmailBtn.classList.add('active');
            scanUrlBtn.classList.remove('active');
            
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                showToast("Error: No active tab found.");
                return;
            }

            try {
                const injectionResults = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js'],
                });

                const emailData = injectionResults[0].result;
                if (emailData && emailData.sender && emailData.subject && emailData.body) {
                    showToast("Scanning email content...");
                    const prediction = await sendEmailDataToBackend(emailData);
                    
                    let classification = 'unknown';
                    if (prediction === 'phishing') {
                        classification = 'blacklist';
                        showToast('Warning! Email classified as PHISHING.');
                    } else if (prediction === 'legitimate') {
                        classification = 'whitelist';
                        showToast('Email appears to be legitimate.');
                    } else {
                        showToast('Could not determine email status.');
                    }

                    if (classification !== 'unknown') {
                        const emailKey = 'email_' + Date.now();
                        const emailEntry = {
                            type: 'email',
                            classification: classification,
                            from: emailData.sender,
                            subject: emailData.subject,
                            body: emailData.body
                        };
                        chrome.storage.local.set({ [emailKey]: emailEntry });
                    }
                } else {
                    showToast("Could not find email content to scan.");
                }
            } catch (err) {
                console.error("Script injection or backend communication failed:", err);
                showToast("Failed to scan the webpage.");
            }
        });
    }

    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    const clearAllBtn = document.getElementById('clear-all-btn');
    const clearWhitelistBtn = document.getElementById('clear-whitelist-btn');
    const clearBlacklistBtn = document.getElementById('clear-blacklist-btn');

    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', () => {
            chrome.storage.local.clear(() => {
                loadAllItems();
                showToast('All history cleared successfully!');
            });
        });
    }

    if (clearWhitelistBtn) {
        clearWhitelistBtn.addEventListener('click', () => {
            chrome.storage.local.get(null, function(items) {
                const keysToRemove = Object.keys(items).filter(key => {
                    const value = items[key];
                    if (typeof value === 'string') return value === 'whitelist';
                    if (typeof value === 'object') return value.classification === 'whitelist';
                    return false;
                });
                chrome.storage.local.remove(keysToRemove, () => {
                    loadAllItems();
                    showToast('Whitelist cleared successfully!');
                });
            });
        });
    }

    if (clearBlacklistBtn) {
        clearBlacklistBtn.addEventListener('click', () => {
            chrome.storage.local.get(null, function(items) {
                const keysToRemove = Object.keys(items).filter(key => {
                    const value = items[key];
                    if (typeof value === 'string') return value === 'blacklist';
                    if (typeof value === 'object') return value.classification === 'blacklist';
                    return false;
                });
                chrome.storage.local.remove(keysToRemove, () => {
                    loadAllItems();
                    showToast('Blacklist cleared successfully!');
                });
            });
        });
    }
    
    if (navBtn && actionsContainer) {
        navBtn.addEventListener('click', () => {
            actionsContainer.classList.toggle('collapsed');
        });
    }

    const listHeaders = document.querySelectorAll('.list-header');
    listHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const listContainer = header.closest('.list-container');
            if (listContainer) {
                listContainer.classList.toggle('collapsed');
            }
        });
    });

    document.getElementById('user-btn')?.addEventListener('click', () => console.log("User button clicked!"));
    document.getElementById('settings-btn')?.addEventListener('click', () => console.log("Settings button clicked!"));

});