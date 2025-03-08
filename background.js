let activeTabId = null;
let tabTimes = {};
let tabTitles = {};
let startTime = 0;

// タブがアクティブになったときの処理
chrome.tabs.onActivated.addListener(activeInfo => {
    trackTime(); // 前のタブの閲覧時間を記録
    activeTabId = activeInfo.tabId;
    startTime = Date.now();
    
    chrome.tabs.get(activeTabId, tab => {
        if (chrome.runtime.lastError) {
            console.warn("Tab information could not be retrieved:", chrome.runtime.lastError.message);
            return;
        }
        tabTitles[activeTabId] = tab.title;
    });
});

// ウィンドウのフォーカスが変わったときの処理
chrome.windows.onFocusChanged.addListener(windowId => {
    trackTime();
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        activeTabId = null;
        startTime = 0;
    } else {
        chrome.tabs.query({ active: true, windowId }, tabs => {
            if (chrome.runtime.lastError) {
                console.warn("Error querying tabs:", chrome.runtime.lastError.message);
                return;
            }
            if (tabs.length > 0) {
                activeTabId = tabs[0].id;
                startTime = Date.now();
            }
        });
    }
});

// 1秒ごとに滞在時間を更新する
setInterval(() => {
    trackTime();
}, 1000);

// タブが閉じられたときの処理
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (tabId === activeTabId) {
        trackTime();
        activeTabId = null;
        startTime = 0;
    }
    
    // タブの情報をローカルストレージから削除
    delete tabTimes[tabId];
    delete tabTitles[tabId];
    chrome.storage.local.set({ tabTimes, tabTitles });
});

// タブの閲覧時間を記録
function trackTime() {
    if (activeTabId !== null && startTime !== 0) {
        const elapsedTime = Date.now() - startTime;
        tabTimes[activeTabId] = (tabTimes[activeTabId] || 0) + elapsedTime;
        chrome.storage.local.set({ tabTimes, tabTitles }, () => {
            chrome.runtime.sendMessage({ action: "updateDashboard" });
        });
        startTime = Date.now();
    }
}

// Chrome 起動時にダッシュボードを開く
chrome.runtime.onStartup.addListener(() => {
    chrome.windows.create({
        url: "dashboard.html",
        type: "popup",
        width: 600,
        height: 400
    });
});

// 閲覧時間順にタブをソート
function sortTabsByTime() {
    chrome.storage.local.get(["tabTimes"], data => {
        const tabTimes = data.tabTimes || {};
        
        chrome.tabs.query({}, tabs => {
            const openTabIds = tabs.map(tab => tab.id);
            
            // 閲覧時間が長い順にタブIDをソート
            const sortedTabIds = Object.entries(tabTimes)
                .sort((a, b) => b[1] - a[1])
                .map(entry => parseInt(entry[0]))
                .filter(tabId => openTabIds.includes(tabId));

            console.log("閲覧時間順のタブIDリスト:", sortedTabIds);
            
            // 並び替えのメッセージを送信
            chrome.runtime.sendMessage({ action: "sortTabs", sortedTabIds });
        });
    });
}

// メッセージを受け取ってタブをソート
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "sortTabsRequest") {
        sortTabsByTime();
    }
});
