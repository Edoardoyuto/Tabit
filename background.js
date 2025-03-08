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
        startTime = Date.now();

        chrome.storage.local.set({ tabTimes, tabTitles }, () => {
            console.log("滞在時間更新:", tabTimes); // デバッグ用
            chrome.runtime.sendMessage({ action: "updateDashboard" }, () => {
                console.log("updateDashboard メッセージ送信");
            });
        });
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

        chrome.tabs.query({ currentWindow: true }, tabs => {
            const openTabIds = tabs.map(tab => tab.id);

            // 閲覧時間が長い順にタブIDをソート
            const sortedTabIds = Object.entries(tabTimes)
                .sort((a, b) => b[1] - a[1])
                .map(entry => parseInt(entry[0]))
                .filter(tabId => openTabIds.includes(tabId));

            console.log("📌 ソート後のタブIDリスト:", sortedTabIds);

            // タブを左から順番に並べ替え
            sortedTabIds.forEach((tabId, index) => {
                chrome.tabs.move(tabId, { index }, () => {
                    if (chrome.runtime.lastError) {
                        console.warn("タブ移動エラー:", chrome.runtime.lastError.message);
                    }
                });
            });

            // 並び替え完了のメッセージを送信
            chrome.runtime.sendMessage({ action: "sortedTabs" });
        });
    });
}

// メッセージを受け取ってタブをソート
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "sortTabsRequest") {
        console.log("🛠 ソートリクエスト受信 - タブを並び替えます");
        sortTabsByTime();
    }
});
