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

/* 拡張機能がインストール・更新されたときに呼ばれる
chrome.runtime.onInstalled.addListener(() => {
  chrome.windows.create({
    url: "dashboard.html",
    type: "popup",
    width: 600,
    height: 400
  });
});
*/


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
  } else if (message.action === "groupTabsAutomatically") {
    groupTabsAutomatically();
    return;
  } else if (message.action === "ungroupTabs") {
      ungroupTabs();
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
  chrome.tabs.get(activeInfo.tabId, tab => {
    if (tab && tab.url && tab.url.includes("dashboard.html")) {
      console.log("Dashboard タブがアクティブなので、trackTime などの処理をスルーします。");
      return;
    }
    
    // dashboard 以外のタブの場合のみ処理を実行
    trackTime(); // 直前のタブの閲覧時間を更新

    activeTabId = activeInfo.tabId;
    startTime = Date.now();

    // タブの開いた(アクティブになった)時間を記録
    tabOpenTimes[activeTabId] = Date.now();
    chrome.storage.local.set({ tabOpenTimes });

    // タブのタイトルを取得して保存
    setTimeout(()=>{
      tabTitles[activeTabId] = tab.title;
      chrome.storage.local.set({ tabTitles });
    },100);
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

function ungroupTabs() {
    chrome.tabs.query({}, (tabs) => {
        let groupedTabs = tabs.filter(tab => tab.groupId !== -1); // グループに属するタブのみ取得

        groupedTabs.forEach(tab => {
            chrome.tabs.ungroup(tab.id, () => {
                if (chrome.runtime.lastError) {
                    console.warn(`グループ解除エラー: ${chrome.runtime.lastError.message}`);
                } else {
                    console.log(`✅ タブ解除: ${tab.id}`);
                }
            });
        });
    });
}

chrome.commands.onCommand.addListener((command) => {
    if (command === "sort_tabs_by_time") {
        console.log("ショートカット1");
        sortByElapsedTimeRequest();
    }
    else if (command === "sort_tabs_by_open") {
        console.log("ショートカット2");
        sortByOpenTimeRequest();
    } else if (command === "group_tabs_automatically") {
        console.log("ショートカット3");
        groupTabsAutomatically();
    } else if (command === "ungroup_tabs") {
        console.log("ショートカット4");
        ungroupTabs();
    }
})

const keywordCategories = {
    "仕事": ["Google Docs", "Slack", "Notion", "Trello", "Asana", "Confluence", "GitHub"],
    "娯楽": ["YouTube", "Netflix", "Twitch", "ニコニコ", "Disney+"],
    "購入": ["Amazon", "楽天", "Yahoo!ショッピング", "メルカリ", "eBay"],
    "学習": ["Udemy", "Wikipedia", "Coursera", "Qiita", "Stack Overflow"],
    "検索": ["検索"]
};

const searchEngines = [
    "google.com/search",
    "bing.com/search",
    "duckduckgo.com",
    "yahoo.com/search",
    "baidu.com",
    "ecosia.org"
];

function classifyTabByURL(url) {
    if (url.includes("work") || url.includes("docs") || url.includes("notion") || url.includes("slack.com") || url.includes("github.com") || url.includes("scrapbox.io")) {
        return "仕事";
    } else if (url.includes("youtube") || url.includes("netflix") || url.includes("twitch.tv") || url.includes("disneyplus")) {
        return "娯楽";
    } else if (url.includes("amazon") || url.includes("rakuten") || url.includes("mercari") || url.includes("ebay")) {
        return "購入";
    } else if (url.includes("udemy") || url.includes("wikipedia") || url.includes("chatgpt.com") || url.includes("qiita") || url.includes("coursera")) {
        return "学習";
    }

    // 🔹 検索エンジンのURLが含まれていたら「検索」と分類
    for (let searchEngine of searchEngines) {
        if (url.includes(searchEngine)) {
            return "検索";
        }
    }

    return "検索"; //「その他」を「検索」として統一
}

function classifyTabByKeywords(title) {
    for (let category in keywordCategories) {
        for (let keyword of keywordCategories[category]) {
            if (title.includes(keyword)) {
                return category;
            }
        }
    }
    return "検索"; // タイトルでも分類できなかったら検索
}

function classifyTab(title, url) {
    let categoryByURL = classifyTabByURL(url);
    if (categoryByURL !== "検索") {
        return categoryByURL;
    }
    return classifyTabByKeywords(title);
}

async function groupTabsAutomatically() {
    chrome.tabs.query({}, async (tabs) => {
        let genreGroups = {
            "仕事": [],
            "娯楽": [],
            "購入": [],
            "学習": [],
            "検索": []
        };

        const genreColors = {
            "仕事": "blue",
            "娯楽": "orange",
            "購入": "pink",
            "学習": "yellow",
            "検索": "grey" 
        };

        // **タブを分類**
        for (let tab of tabs) {
            let genre = classifyTab(tab.title, tab.url);
            genreGroups[genre].push(tab.id);
        }

        // **分類したタブをグループ化**
        for (let genre in genreGroups) {
            if (genreGroups[genre].length > 0) {
                // **グループ化してIDを取得**
                chrome.tabs.group({ tabIds: genreGroups[genre] }, async (groupId) => {
                    if (!groupId) {
                        console.warn(`🚨 ${genre} のグループID取得に失敗`);
                        return;
                    }

                    console.log(`✅ グループ作成: ${genre} (ID: ${groupId})`);

                    // **タイトルを設定**
                    try {
                        await chrome.tabGroups.update(groupId, { title: genre, color: genreColors[genre] });
                        console.log(`🔹 ${genre} グループにタイトル設定完了`);
                    } catch (error) {
                        console.error(`🚨 ${genre} グループのタイトル設定エラー:`, error);
                    }
                });
            }
        }
    });
}
