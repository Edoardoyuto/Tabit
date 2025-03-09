let activeTabId = null;
let tabElapsedTimes = {}; // タブの閲覧時間
let tabOpenTimes = {};    // タブが最後に見られた時間
let tabTitles = {};       // タブのタイトル
let startTime = 0;
let priorityUrls = [];    // 優先表示するURLのリスト

console.log("✅ background.js is running");

// Chrome起動時（PC再起動後など）に呼ばれる
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(["priorityUrls"], data => {
    priorityUrls = data.priorityUrls || [];
    console.log("URLリストを復元:", priorityUrls);
  });
});

// 拡張機能がインストール・更新されたときに呼ばれる
chrome.runtime.onInstalled.addListener(() => {
  chrome.windows.create({
    url: "dashboard.html",
    type: "popup",
    width: 600,
    height: 400
  });
});

/**
 * ▼▼▼ メッセージリスナー (一本化) ▼▼▼
 *   - updatePriorityUrls
 *   - sortByElapsedTimeRequest
 *   - sortByOpenTimeRequest
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 優先URLの更新
  if (message.action === "updatePriorityUrls") {
    priorityUrls = message.urls;
    chrome.storage.local.set({ priorityUrls }, () => {
      console.log("✅ 優先URLリストを保存:", priorityUrls);
    });
    return; // 処理終了

  // 閲覧時間順にソート
  } else if (message.action === "sortByElapsedTimeRequest") {
    sortByElapsedTimeRequest();
    return;

  // 開いた時間順にソート
  } else if (message.action === "sortByOpenTimeRequest") {
    sortByOpenTimeRequest();
    return;
  }
});

/**
 * タブがアクティブになったときの処理
 * - 直前のタブの閲覧時間を確定
 * - 新アクティブタブの開始時間を記録
 * - タブの最後に見られた時間(tabOpenTimes)を更新
 * - タブのタイトルを記録
 */
chrome.tabs.onActivated.addListener(activeInfo => {
  trackTime(); // 直前のタブの閲覧時間を更新

  activeTabId = activeInfo.tabId;
  startTime = Date.now();

  // タブの開いた(アクティブになった)時間を記録
  tabOpenTimes[activeTabId] = Date.now();
  chrome.storage.local.set({ tabOpenTimes });

  // タブのタイトルを取得
  chrome.tabs.get(activeTabId, tab => {
    if (chrome.runtime.lastError) {
      console.warn("Tab情報を取得できませんでした:", chrome.runtime.lastError.message);
      return;
    }
    tabTitles[activeTabId] = tab.title;
    chrome.storage.local.set({ tabTitles });
  });
});

/**
 * ウィンドウのフォーカスが変わったとき
 * - フォーカスが外れた時点で前タブの時間を確定
 * - フォーカスが当たったらアクティブタブを更新
 */
chrome.windows.onFocusChanged.addListener(windowId => {
  trackTime(); // 直前タブの閲覧時間を確定

  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // フォーカスがない
    activeTabId = null;
    startTime = 0;
  } else {
    // フォーカスがあるウィンドウのアクティブタブを特定
    chrome.tabs.query({ active: true, windowId }, tabs => {
      if (chrome.runtime.lastError) {
        console.warn("タブ取得エラー:", chrome.runtime.lastError.message);
        return;
      }
      if (tabs.length > 0) {
        activeTabId = tabs[0].id;
        startTime = Date.now();

        // 最後に見られた時間を更新
        tabOpenTimes[activeTabId] = Date.now();
        chrome.storage.local.set({ tabOpenTimes });
      }
    });
  }
});

/**
 * タブが閉じられたとき
 * - 閉じられたタブがアクティブだった場合、時間を確定
 * - 閉じられたタブの情報を削除
 */
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (tabId === activeTabId) {
    trackTime();
    activeTabId = null;
    startTime = 0;
  }
  delete tabElapsedTimes[tabId];
  delete tabOpenTimes[tabId];
  delete tabTitles[tabId];

  chrome.storage.local.set({
    tabElapsedTimes,
    tabOpenTimes,
    tabTitles
  });
});

/**
 * アクティブタブの閲覧時間を確定する
 */
function trackTime() {
  if (activeTabId !== null && startTime !== 0) {
    const elapsedTime = Date.now() - startTime;
    tabElapsedTimes[activeTabId] = (tabElapsedTimes[activeTabId] || 0) + elapsedTime;

    // ストレージに保存してからダッシュボード更新を通知
    chrome.storage.local.set({ tabElapsedTimes }, () => {
      console.log("✅ 時間データ保存完了:", tabElapsedTimes);

      // ダッシュボードに「更新してください」とメッセージ送信
      chrome.runtime.sendMessage({ action: "updateDashboard" }, (response) => {
        // ダッシュボードが開いていない場合、lastErrorが発生する
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message;
          // 「受信先がいない」エラーなら無視、別のエラーなら表示
          if (msg.includes("Receiving end does not exist")) {
            // 何もしない
          } else {
            console.warn("メッセージ送信エラー:", msg);
          }
        } else {
          console.log("✅ メッセージ送信成功:", response);
        }
      });
    });

    // 計測開始時間をリセット
    startTime = Date.now();
  }
}

/**
 * 優先タブを最上位に置いたうえで、sortedTabIdsの順にタブを並べる
 */
function moveTabsInOrder(sortedTabIds) {
    chrome.tabs.query({}, tabs => {
      const priorityTabIds = [];
      const normalTabIds = [];
  
      // タブの URL に優先URLの文字列が含まれていれば優先タブとする
      tabs.forEach(tab => {
        if (priorityUrls.some(url => tab.url.includes(url))) {
          priorityTabIds.push(tab.id);
        } else {
          normalTabIds.push(tab.id);
        }
      });
  
      // sortedTabIds が未定義なら normalTabIds を使う
      sortedTabIds = sortedTabIds || normalTabIds;
  
      // 優先タブを先頭に、ソート済みIDから優先タブを除いたリストを後ろに続ける
      const finalOrder = [
        ...priorityTabIds,
        ...sortedTabIds.filter(id => !priorityTabIds.includes(id))
      ];
  
      finalOrder.forEach((tabId, index) => {
        chrome.tabs.move(tabId, { index }, () => {
          if (chrome.runtime.lastError) {
            console.warn(`タブ移動エラー (${tabId}):`, chrome.runtime.lastError.message);
          }
        });
      });
    });
  }
  

/**
 * 閲覧時間(降順)でタブを並べ替え
 */
function sortByElapsedTimeRequest() {
  chrome.storage.local.get(["tabElapsedTimes"], data => {
    const localElapsedTimes = data.tabElapsedTimes || {};

    chrome.tabs.query({}, tabs => {
      const openTabIds = tabs.map(tab => tab.id);

      // 閲覧時間が長い順にソート
      const sortedTabIds = Object.entries(localElapsedTimes)
        .sort((a, b) => b[1] - a[1])
        .map(entry => parseInt(entry[0]))
        .filter(tabId => openTabIds.includes(tabId));

      console.log("閲覧時間順のタブIDリスト:", sortedTabIds);
      moveTabsInOrder(sortedTabIds);
    });
  });
}

/**
 * 開いた時間(新しい順)でタブを並べ替え
 */
function sortByOpenTimeRequest() {
  chrome.storage.local.get(["tabOpenTimes"], data => {
    const localOpenTimes = data.tabOpenTimes || {};

    chrome.tabs.query({}, tabs => {
      const openTabIds = tabs.map(tab => tab.id);

      // 新しい順(降順)でソート
      const sortedTabIds = Object.entries(localOpenTimes)
        .sort((a, b) => b[1] - a[1])
        .map(entry => parseInt(entry[0]))
        .filter(tabId => openTabIds.includes(tabId));

      console.log("📌 開いた時間順のタブIDリスト:", sortedTabIds);
      moveTabsInOrder(sortedTabIds);
    });
  });
}
