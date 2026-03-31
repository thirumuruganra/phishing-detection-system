// background.js

import { createDetectionNotification } from './checksus.js';
import { sendUrlToBackend } from './checksus.js';

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    const newUrl = changeInfo.url;
    
    if (newUrl.startsWith('chrome://') || 
        newUrl.startsWith('about:') || 
        newUrl.startsWith('edge://') ||
        newUrl.startsWith('chrome-extension://') ||
        newUrl.startsWith('https://mail.google.com')) {
      console.log(`Skipping internal/whitelisted URL: ${newUrl}`);
      return;
    }
    
    console.log(`URL DETECTED & STORED: ${newUrl}`);
    const result = await sendUrlToBackend(newUrl);
    console.log(`URL: ${newUrl} classified as ${result}`);
    if (result === 'blacklist' || result === 'whitelist') {
      chrome.storage.local.set({ [newUrl]: result });
      createDetectionNotification(result);
    }
  }
});

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    if (notificationId === 'suspicious-url-notif' && buttonIndex === 0) {
        chrome.action.openPopup();
    }
});

chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationId === 'suspicious-url-notif') {
        chrome.action.openPopup();
    }
});