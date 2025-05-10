let activeTabId = null;
let tabElapsedTimes = {}; // タブの閲覧時間
let tabOpenTimes = {};    // タブが最後に見られた時間
let tabTitles = {};       // タブのタイトル
let startTime = 0;
let priorityUrls = [];    // 優先表示するURLのリスト
let autoGroupingEnabled = false; // 自動グループ化ON/OFF
let currentClassroomId = "";
let updateTimer = null;
let updateModeEnabled = true;  // 初期状態ONにする


console.log("background.js is running");

setInterval(() => {
    trackTime();
}, 5000);





chrome.tabs.onMoved.addListener(() => {
    chrome.runtime.sendMessage({ action: "updateDashboard" });
});


// Chrome起動時（PC再起動後など）に呼ばれる
chrome.runtime.onStartup.addListener(() => {
    chrome.storage.local.get(["priorityUrls", "tabElapsedTimes", "tabOpenTimes", "tabTitles", "autoGroupEnabled"], data => {
        priorityUrls = data.priorityUrls || [];
        tabElapsedTimes = data.tabElapsedTimes || {};
        tabOpenTimes = data.tabOpenTimes || {};
        tabTitles = data.tabTitles || {};
        autoGroupingEnabled = data.autoGroupEnabled === true; // ←ここ追加！

        console.log("状態を復元:", { priorityUrls, tabElapsedTimes, tabOpenTimes, tabTitles, autoGroupingEnabled });
    });
});


chrome.storage.local.get(["updateModeEnabled"], (data) => {
    if (data.updateModeEnabled !== undefined) {
        updateModeEnabled = data.updateModeEnabled;
    }
    console.log("[Background] 保存された更新モード:", updateModeEnabled);

    if (updateModeEnabled) {
        fetchAndOpenUrls();
        updateTimer = setInterval(fetchAndOpenUrls, 1000);
    }
});


// サーバーから教室IDとURLを取ってきてタブを開く
async function fetchAndOpenUrls() {
    try {
        const res = await fetch("http://172.20.10.7:8080/api/url/list", { credentials: "include" });
        if (!res.ok) throw new Error(res.status);
        const text = await res.text();
        const raws = text.split(",").map(s => s.trim()).filter(Boolean);

        const tabs = await chrome.tabs.query({});
        // タブ側の URL 情報を URL オブジェクトに
        const tabInfos = tabs.map(tab => {
            try { return new URL(tab.url); }
            catch { return null; }
        }).filter(u => u);

        const toOpen = raws.filter(raw => {
            let rawUrl;
            try { rawUrl = new URL(raw); }
            catch { return true; }

            // 比較用に normalize
            const rawHost = rawUrl.hostname + (rawUrl.port ? `:${rawUrl.port}` : "");
            const rawPath = rawUrl.pathname.replace(/\/$/, "") + rawUrl.search;

            // すでに開いているタブに同じ host ＆ path があればスキップ
            return !tabInfos.some(tabUrl => {
                const tabHost = tabUrl.hostname + (tabUrl.port ? `:${tabUrl.port}` : "");
                const tabPath = tabUrl.pathname.replace(/\/$/, "") + tabUrl.search;
                return tabHost === rawHost && tabPath === rawPath;
            });
        });

        console.log("開くべきURL:", toOpen);
        for (const url of toOpen) {
            chrome.tabs.create({ url });
        }
    } catch (err) {
        console.error(err);
    }
}


function normalizeUrl(url) {
    if (!url) return "";
    return url.endsWith("/") ? url.slice(0, -1) : url;
}




chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 優先URLの更新
    if (message.action === "toggleUpdateMode") {
        updateModeEnabled = !updateModeEnabled; // ★ここでtoggleする！
        console.log("[Background] 更新モード切り替え:", updateModeEnabled);

        if (updateModeEnabled) {
            if (!updateTimer) {
                fetchAndOpenUrls();
                updateTimer = setInterval(fetchAndOpenUrls, 5000);
            }
        } else {
            if (updateTimer) {
                clearInterval(updateTimer);
                updateTimer = null;
            }
        }
        chrome.storage.local.set({ updateModeEnabled });
        sendResponse({ updateModeEnabled });
        return true; // 非同期レスポンスだから必要
    } else if (message.action === "updatePriorityUrls") {
        // 優先URLの更新
    priorityUrls = message.urls;
    chrome.storage.local.set({ priorityUrls }, () => {
      console.log("優先URLリストを保存:", priorityUrls);
    });
    return; // 処理終了

  // 閲覧時間順にソート
  } else if (message.action === "sortByElapsedTimeRequest") {
    ungroupTabs();
    sortByElapsedTimeRequest();
    return;

  // 開いた時間順にソート
  } else if (message.action === "sortByOpenTimeRequest") {
    ungroupTabs();
    sortByOpenTimeRequest();
    return;
  } else if (message.action === "toggleAutoGrouping") {
      autoGroupingEnabled = !autoGroupingEnabled;
      console.log("自動グループ化モード:", autoGroupingEnabled ? "ON" : "OFF");
      chrome.storage.local.set({ autoGroupEnabled: autoGroupingEnabled }); // ←ストレージにも保存！！

      if (autoGroupingEnabled) {
          regroupAllTabs();
      }
      sendResponse({ autoGroupingEnabled });
  } else if (message.action === "ungroupTabs") {
      ungroupTabs();
      return;
    } else if (message.action === "refreshTabTitles") {
        refreshAllTabTitles();
        return;
    } else if (message.action === "groupCustomByGroup") {
            groupCustomTabs(message.group);
        }


});


chrome.tabs.onActivated.addListener(activeInfo => {
  chrome.tabs.get(activeInfo.tabId, tab => {
    if (tab && tab.url && tab.url.includes("dashboard.html")) {
      console.log("Dashboard タブがアクティブなので、trackTime などの処理をスルーします。");
      return;
    }
    
    // dashboard 以外のタブの場合のみ処理を実行
    trackTime(); 

    activeTabId = activeInfo.tabId;
    startTime = Date.now();


    tabOpenTimes[activeTabId] = Date.now();
    chrome.storage.local.set({ tabOpenTimes });
    
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
  trackTime(); 

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
        tabOpenTimes[activeTabId] = Date.now();
        chrome.storage.local.set({ tabOpenTimes });
      }
    });
  }
});

chrome.runtime.onStartup.addListener(() => {
    chrome.storage.local.get(["priorityUrls", "tabElapsedTimes", "tabOpenTimes", "tabTitles"], data => {
        priorityUrls = data.priorityUrls || [];
        tabElapsedTimes = data.tabElapsedTimes || {};
        tabOpenTimes = data.tabOpenTimes || {};
        tabTitles = data.tabTitles || {};
        console.log("状態を復元:", { priorityUrls, tabElapsedTimes, tabOpenTimes, tabTitles });
    });
});


/**
 * タブが閉じられたとき
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

        // ローカルストレージに都度反映
        chrome.storage.local.get("tabElapsedTimes", (data) => {
            const store = data.tabElapsedTimes || {};
            store[activeTabId] = (store[activeTabId] || 0) + elapsedTime;

            chrome.storage.local.set({ tabElapsedTimes: store }, () => {
                console.log("時間データ保存完了:", store);

                chrome.runtime.sendMessage({ action: "updateDashboard" }, (response) => {
                    if (chrome.runtime.lastError) {
                        const msg = chrome.runtime.lastError.message;
                        if (!msg.includes("Receiving end does not exist")) {
                            console.warn("メッセージ送信エラー:", msg);
                        }
                    } else {
                        console.log("メッセージ送信成功:", response);
                    }
                });
            });
        });

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

      console.log("開いた時間順のタブIDリスト:", sortedTabIds);
      moveTabsInOrder(sortedTabIds);
    });
  });
}

function ungroupTabs() {
    return new Promise(resolve => {
        chrome.tabs.query({}, tabs => {
            const ids = tabs.filter(t => t.groupId !== -1).map(t => t.id);
            Promise.all(ids.map(id => new Promise(r => chrome.tabs.ungroup(id, r))))
                .then(() => resolve());
        });
    });
}

function refreshAllTabTitles() {
    chrome.tabs.query({}, tabs => {
        tabs.forEach(tab => {
            tabTitles[tab.id] = tab.title;
        });
        chrome.storage.local.set({ tabTitles });
    });
}


chrome.commands.onCommand.addListener((command) => {
    if (command === "sort_tabs_by_time") {
        console.log("ショートカット1");
      ungroupTabs();
        sortByElapsedTimeRequest();
    }
    else if (command === "sort_tabs_by_open") {
        console.log("ショートカット2");
      ungroupTabs();
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
    if (url.includes("work") || url.includes("docs") || url.includes("notion") || url.includes("slack.com") || url.includes("github.com") || url.includes("scrapbox.io") || 
    url.includes("mtrl.com") || url.includes("career") || url.includes("geekly") || url.includes("r-agent") || url.includes("doda") || url.includes("miidas") || 
    url.includes("tenshoku") || url.includes("directscout") || url.includes("next.rikunabi") || url.includes("speakerdeck") || url.includes("slideshare") || url.includes("undraw") || 
    url.includes("freepick") || url.includes("soco-st") || url.includes("loosedrawing") || url.includes("isometric") || url.includes("tech-pic") || url.includes("manypixels") || 
    url.includes("simpc") || url.includes("prezi") || url.includes("finance.yahoo.co.jp")) {
        return "仕事";
    } else if (url.includes("news") || url.includes("nikkei") || url.includes("asahi.com") || url.includes("bbc.com") || url.includes("mainichi") || url.includes("sankei") || 
    url.includes("jiji") || url.includes("yomiuri") || url.includes("reuters") || url.includes("cnn.co") || url.includes("afpbb") || url.includes("meti") || url.includes("co-media") || 
    url.includes("waseda-ad") || url.includes("unigirls") || url.includes("cultureuniversitytokyo") || url.includes("pando") || url.includes("majime-zine") || url.includes("okanechips")) {
        return "報道";
    } else if (url.includes("comic") || url.includes("game") || url.includes("anime") || url.includes("video") || url.includes("tv.com") || url.includes("music") || 
    url.includes("travel") || url.includes("youtube") || url.includes("netflix") || url.includes("twitch.tv") || url.includes("disneyplus") || url.includes("cmoa") || 
    url.includes("shonenjumpplus") || url.includes("ebookjapan") || url.includes("bookwalker") || url.includes("comic-walker") || url.includes("pocket.shonenmagazine") || 
    url.includes("manga-mee") || url.includes("manga-shinchan") || url.includes("to-corona-ex") || url.includes("poki") || url.includes("famitsu") || url.includes("playhop") || 
    url.includes("mymd") || url.includes("play.ponta") || url.includes("fortnite") || url.includes("dengekionline") || url.includes("unext") || url.includes("video") || 
    url.includes("movie-tsutaya") || url.includes("lemino") || url.includes("animestore") || url.includes("dmm.com") || url.includes("animehodai") || url.includes("watcha.com") || 
    url.includes("bs10") || url.includes("skyperfectv") || url.includes("wowow") || url.includes("mubi") || url.includes("hulu") || url.includes("telasa") || url.includes("prnhub") || 
    url.includes("missav") || url.includes("jable")  || url.includes("animefesta") || url.includes("recochoku") || url.includes("mora") || url.includes("spotify") || 
    url.includes("x.com") || url.includes("mtrl.tokyo") || url.includes("instagram") || url.includes("facebook") || url.includes("games.yahoo.co.jp")) {
        return "娯楽";
    } else if (url.includes("shop") || url.includes("shopping") || url.includes("store") || url.includes("amazon.co.jp") || url.includes("rakuten.co.jp") || url.includes("mercari") || 
    url.includes("ebay") || url.includes("qoo10") || url.includes("shopping.yahoo") || url.includes("yodobashi") || url.includes("wowma") || url.includes("dmarket") || 
    url.includes("dshopping") || url.includes("shop.hikaritv") || url.includes("zozo.jp") || url.includes("shop-list") || url.includes("cecile") || url.includes("nissen") || 
    url.includes("belluna") || url.includes("bellemaison") || url.includes("dinos") || url.includes("kakaku") || url.includes("pokemoncenter-online") || url.includes("buyma") || 
    url.includes("cosmetic-times") || url.includes("tabechoku") || url.includes("lohaco") || url.includes("nitori-net") || url.includes("daisonet") || url.includes("low-ya") || 
    url.includes("gladd") || url.includes("temu.com") || url.includes("workman.jp") || url.includes("monotaro") || url.includes("shopping.google") || url.includes("7net") || 
    url.includes("tokyu-dept") || url.includes("edion.com") || url.includes("keionet") || url.includes("joshinweb") || url.includes("amicashop") || url.includes("sej.co") || 
    url.includes("voi.0101") || url.includes("family-town") || url.includes("cainz.com") || url.includes("daimaru-matsuzakaya") || url.includes("saiyasune") || url.includes("geo-online") || 
    url.includes("uni-jack") || url.includes("demae-can")) {
        return "購入";
    } else if (url.includes("udemy") || url.includes("wikipedia") || url.includes("chatgpt.com") || url.includes("qiita") || url.includes("manabitimes") || url.includes("momoyama-usagi") || 
    url.includes("coursera") || url.includes("perry") || url.includes("gakusei") || url.includes("student") || url.includes("canva") || url.includes("pasokoncalender") || url.includes("lab-brains") || 
    url.includes("avilen") || url.includes("headboost") || url.includes("algebra") || url.includes("note.com") || url.includes("mathlandscape") || url.includes("ly-academy.yahoo.co.jp") || url.includes("onedrive")) {
        return "学習";
    }

    // 検索エンジンのURLが含まれていたら「検索」と分類
    for (let searchEngine of searchEngines) {
        if (url.includes(searchEngine) || url.includes("search") || url.includes("go") || url.includes("yahoo")) {
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

chrome.tabs.onCreated.addListener(async (tab) => {
    if (!autoGroupingEnabled) return;
    console.log("タブが作成されたのでグループ更新");
    await groupTabsAutomatically();
});


chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (!autoGroupingEnabled) return;

    if (changeInfo.status === "complete" && tab.url && tab.url.startsWith("http")) {
        console.log("タブの読み込みが完了したのでグループ更新");
        await regroupAllTabs();
    }
});

async function regroupAllTabs() {
    console.log("再グループ化中...");

    const allTabs = await new Promise(resolve => chrome.tabs.query({}, resolve));

    // ストレージからカスタムキーワード取得
    const customGroups = await new Promise(resolve => {
        chrome.storage.local.get(["customGroups"], resolve);
    });

    const group1 = customGroups.customGroups?.group1 || [];
    const group2 = customGroups.customGroups?.group2 || [];
    const group3 = customGroups.customGroups?.group3 || [];
    const customKeywords = [...group1, ...group2, ...group3];

    // カスタムにマッチしないタブだけ ungroup
    const nonCustomTabs = allTabs.filter(tab => {
        const title = tab.title || "";
        const url = tab.url || "";
        const isCustom = customKeywords.some(kw => title.includes(kw) || url.includes(kw));
        return !isCustom && tab.groupId !== -1;
    });

    for (const tab of nonCustomTabs) {
        await new Promise(resolve => chrome.tabs.ungroup(tab.id, resolve));
    }

    // カスタムグループ → 順に待つ
    await groupCustomTabs("group1");
    await groupCustomTabs("group2");
    await groupCustomTabs("group3");

    // 未分類タブだけジャンル分け
    const currentTabs = await new Promise(resolve => chrome.tabs.query({}, resolve));
    const remainingTabs = currentTabs.filter(tab => tab.groupId === -1);
    await groupGenreTabs(remainingTabs);
}


async function groupGenreTabs(tabs) {
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

    for (let tab of tabs) {
        let genre = classifyTab(tab.title, tab.url);
        genreGroups[genre].push(tab.id);
    }

    for (let genre in genreGroups) {
        if (genreGroups[genre].length > 0) {
            chrome.tabs.group({ tabIds: genreGroups[genre] }, async (groupId) => {
                if (!groupId) return;
                try {
                    await chrome.tabGroups.update(groupId, {
                        title: genre,
                        color: genreColors[genre]
                    });
                } catch (e) {
                    console.warn("ジャンルグループ更新エラー:", e);
                }
            });
        }
    }
}

function groupCustomTabs(groupKey) {
    return new Promise((resolve) => {
        chrome.storage.local.get(["customGroups"], data => {
            const keywords = data.customGroups?.[groupKey] || [];
            if (keywords.length === 0) return resolve();

            chrome.tabs.query({}, tabs => {
                const matchedTabs = tabs.filter(tab => {
                    const title = tab.title || "";
                    const url = tab.url || "";
                    return keywords.some(kw => title.includes(kw) || url.includes(kw));
                });

                const matchedTabIds = matchedTabs.map(tab => tab.id);
                if (matchedTabIds.length === 0) return resolve();

                // ジャンルグループから来たタブ（既に groupId が付いてるもの）は一度 ungroup
                const toUngroup = matchedTabs.filter(tab => tab.groupId !== -1).map(tab => tab.id);
                const ungroupPromises = toUngroup.map(id =>
                    new Promise(res => chrome.tabs.ungroup(id, res))
                );

                Promise.all(ungroupPromises).then(() => {
                    chrome.tabs.group({ tabIds: matchedTabIds }, groupId => {
                        if (chrome.runtime.lastError) {
                            console.warn(`[${groupKey}] グループ化失敗: ${chrome.runtime.lastError.message}`);
                            return resolve();
                        }

                        chrome.tabGroups.update(groupId, {
                            title: `カスタム${groupKey.replace("group", "")}`,
                            color: {
                                group1: "blue",
                                group2: "green",
                                group3: "purple"
                            }[groupKey]
                        }, () => resolve());
                    });
                });
            });
        });
    });
}


async function groupTabsAutomatically() {
    await ungroupTabs();

    // ✅ カスタムグループを順番に優先して処理
    await groupCustomTabs("group1");
    await groupCustomTabs("group2");
    await groupCustomTabs("group3");

    // ✅ カスタムに含まれなかったタブだけを分類対象にする
    const tabs = await new Promise(resolve => chrome.tabs.query({}, resolve));
    const remainingTabs = tabs.filter(tab => tab.groupId === -1);

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

    for (let tab of remainingTabs) {
        let genre = classifyTab(tab.title, tab.url);
        genreGroups[genre].push(tab.id);
    }

    for (let genre in genreGroups) {
        if (genreGroups[genre].length > 0) {
            chrome.tabs.group({ tabIds: genreGroups[genre] }, async (groupId) => {
                if (!groupId) return;
                try {
                    await chrome.tabGroups.update(groupId, {
                        title: genre,
                        color: genreColors[genre]
                    });
                } catch (e) {
                    console.warn("ジャンルグループ更新エラー:", e);
                }
            });
        }
    }
}
