let activeTabId = null;
let tabElapsedTimes = {}; // タブの閲覧時間
let tabOpenTimes = {}; // タブが最後に見られた時間
let tabTitles = {}; 
let startTime = 0;

// タブがアクティブになったときの処理（最後に見られた時間を記録）
chrome.tabs.onActivated.addListener(activeInfo => {
    trackTime(); // 直前のタブの閲覧時間を記録

    activeTabId = activeInfo.tabId;
    startTime = Date.now();

    // タブが最後に見られた時間を記録
    tabOpenTimes[activeTabId] = Date.now();
    chrome.storage.local.set({ tabOpenTimes });

    // タブのタイトルを記録
    chrome.tabs.get(activeTabId, tab => {
        if (chrome.runtime.lastError) {
            console.warn("Tab information could not be retrieved:", chrome.runtime.lastError.message);
            return;
        }
        tabTitles[activeTabId] = tab.title;
        chrome.storage.local.set({ tabTitles });
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

                // タブが最後に見られた時間を記録
                tabOpenTimes[activeTabId] = Date.now();
                chrome.storage.local.set({ tabOpenTimes });
            }
        });
    }
});

// タブが閉じられたときの処理
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (tabId === activeTabId) {
        trackTime();
        activeTabId = null;
        startTime = 0;
    }
    
    // タブの情報をローカルストレージから削除
    delete tabElapsedTimes[tabId];
    delete tabTitles[tabId];
    delete tabOpenTimes[tabId];

    chrome.storage.local.set({ tabElapsedTimes, tabOpenTimes, tabTitles });
});

// 閲覧時間の記録
function trackTime() {
    if (activeTabId !== null && startTime !== 0) {
        const elapsedTime = Date.now() - startTime;

        tabElapsedTimes[activeTabId] = (tabElapsedTimes[activeTabId] || 0) + elapsedTime;
        chrome.storage.local.set({ tabElapsedTimes });

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
function sortByElapsedTimeRequest() {
    chrome.storage.local.get(["tabElapsedTimes"], data => {
        const tabElapsedTimes = data.tabElapsedTimes || {};
        
        chrome.tabs.query({}, tabs => {
            const openTabIds = tabs.map(tab => tab.id);
            
            // 閲覧時間が長い順にタブIDをソート
            const sortedTabIds = Object.entries(tabElapsedTimes)
                .sort((a, b) => b[1] - a[1])
                .map(entry => parseInt(entry[0]))
                .filter(tabId => openTabIds.includes(tabId));

            console.log("閲覧時間順のタブIDリスト:", sortedTabIds);
            
            // 並び替えのメッセージを送信
            chrome.runtime.sendMessage({ action: "sortTabs", sortedTabIds });
        });
    });
}



function sortByOpenTimeRequest() {
    chrome.storage.local.get(["tabOpenTimes"], data => {
        const tabOpenTimes = data.tabOpenTimes || {};

        chrome.tabs.query({}, tabs => {
            const openTabIds = tabs.map(tab => tab.id);
            
            // 開いた時間が新しい順にタブIDをソート
            const sortedTabIds = Object.entries(tabOpenTimes)
                .sort((a, b) => b[1] - a[1]) // 新しい順（降順）
                .map(entry => parseInt(entry[0]))
                .filter(tabId => openTabIds.includes(tabId));

            console.log("開いた時間順のタブIDリスト:", sortedTabIds);
            
            // 並び替えのメッセージを送信
            chrome.runtime.sendMessage({ action: "sortTabs", sortedTabIds });
        });
    });
}

// メッセージを受け取ってタブをソート
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "sortByElapsedTimeRequest") {
        sortByElapsedTimeRequest();
    } else if (message.action === "sortByOpenTimeRequest") { // ✅ 開いた時間順のリクエスト処理
        sortByOpenTimeRequest();
    }
});




