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
    console.log("ソートリクエスト受信 - タブを並び替えます");

    chrome.storage.local.get(["tabTimes"], data => {
        const tabTimes = data.tabTimes || {};

        chrome.tabs.query({ currentWindow: true }, tabs => {
            if (!tabs || tabs.length === 0) {
                console.warn("開いているタブが見つかりません");
                return;
            }

            const openTabIds = tabs.map(tab => tab.id);

            // 閲覧時間が長い順にタブIDをソート
            const sortedTabIds = Object.entries(tabTimes)
                .map(([tabId, time]) => [parseInt(tabId), time]) // 文字列のタブIDを数値に変換
                .filter(([tabId, time]) => openTabIds.includes(tabId)) // 開いているタブのみ対象
                .sort((a, b) => b[1] - a[1]) // 時間が長い順
                .map(entry => entry[0]); // タブIDのリスト

            console.log("ソート後のタブIDリスト:", sortedTabIds);

            if (sortedTabIds.length === 0) {
                console.warn("ソートするタブがありません");
                return;
            }

            // タブの位置を一括で更新する（非同期処理を制御）
            async function moveTabsInOrder() {
                for (let i = 0; i < sortedTabIds.length; i++) {
                    let tabId = sortedTabIds[i];
                    try {
                        await new Promise((resolve, reject) => {
                            chrome.tabs.move(tabId, { index: i }, () => {
                                if (chrome.runtime.lastError) {
                                    console.warn(`タブ移動エラー (${tabId}):`, chrome.runtime.lastError.message);
                                    reject(chrome.runtime.lastError);
                                } else {
                                    console.log(`タブ ${tabId} を位置 ${i} に移動`);
                                    resolve();
                                }
                            });
                        });
                    } catch (error) {
                        console.error(`タブ ${tabId} の移動に失敗しました`, error);
                    }
                }
            }

            moveTabsInOrder().then(() => {
                console.log("全てのタブの並び替えが完了しました");
                chrome.runtime.sendMessage({ action: "sortedTabs" });
            });
        });
    });
}

// メッセージを受け取ってタブをソート
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("メッセージ受信:", message);

    if (message.action === "sortByElapsedTimeRequest") {
        console.log("ソートリクエストを処理中...");
        sortTabsByTime();
        sendResponse({ status: "ok" });
    }
});


