/* background.js */
let activeTabId = null;
let tabTimes = {};
let tabTitles = {};
let startTime = 0;

chrome.tabs.onActivated.addListener(activeInfo => {
    trackTime();
    activeTabId = activeInfo.tabId;
    startTime = Date.now();
    
    chrome.tabs.get(activeTabId, tab => {
        tabTitles[activeTabId] = tab.title;
    });
});

chrome.windows.onFocusChanged.addListener(windowId => {
    trackTime();
    activeTabId = windowId === chrome.windows.WINDOW_ID_NONE ? null : activeTabId;
    startTime = activeTabId ? Date.now() : 0;
});

function trackTime() {
    if (activeTabId !== null && startTime !== 0) {
        const elapsedTime = Date.now() - startTime;
        tabTimes[activeTabId] = (tabTimes[activeTabId] || 0) + elapsedTime;
        chrome.storage.local.set({ tabTimes, tabTitles }, () => {
            chrome.runtime.sendMessage({ action: "updateDashboard" }); // ダッシュボードに更新通知
        });
        startTime = Date.now();
    }
}

setInterval(trackTime, 1000);

// Chrome 起動時にダッシュボードを開く
chrome.runtime.onStartup.addListener(() => {
    chrome.windows.create({
        url: "dashboard.html",
        type: "popup",
        width: 600,
        height: 400
    });
});
