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
        chrome.storage.local.set({ tabElapsedTimes }, () => {
            // 🔹 ダッシュボードに時間を更新するメッセージを送る
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

// 📌 **タブを並び替える関数**
function moveTabsInOrder(sortedTabIds) {
    console.log("📌 タブを並び替え中:", sortedTabIds);

    sortedTabIds.forEach((tabId, index) => {
        chrome.tabs.move(tabId, { index }, () => {
            if (chrome.runtime.lastError) {
                console.warn(`🚨 タブ移動エラー (${tabId}):`, chrome.runtime.lastError.message);
            } else {
                console.log(`✅ タブ ${tabId} を位置 ${index} に移動`);
            }
        });
    });
}

// 📌 **閲覧時間順にタブをソート**
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

            console.log("📌 閲覧時間順のタブIDリスト:", sortedTabIds);
            
            // 📌 **新しく追加した関数でタブを並び替える**
            moveTabsInOrder(sortedTabIds);
        });
    });
}

// 📌 **開いた時間順にタブをソート**
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

            console.log("📌 開いた時間順のタブIDリスト:", sortedTabIds);
            
            // 📌 **新しく追加した関数でタブを並び替える**
            moveTabsInOrder(sortedTabIds);
        });
    });
}

// 📌 **メッセージを受け取ってタブをソート**
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "sortByElapsedTimeRequest") {
        sortByElapsedTimeRequest();
    } else if (message.action === "sortByOpenTimeRequest") { // ✅ 開いた時間順のリクエスト処理
        sortByOpenTimeRequest();
    }
});

const API_KEY = "your-openai-api-key"; // 🔹 OpenAI の API キーを入力

async function categorizeTabsWithGPT(tabUrls) {
    const prompt = `
    以下のURLのカテゴリを判定してください（仕事, 娯楽, 調査, 買い物, SNS, その他）。
    URL: ${JSON.stringify(tabUrls)}
    例:
    "https://www.google.com/search?q=AI" → "調査"
    "https://www.youtube.com/watch?v=abc123" → "娯楽"
    "https://docs.google.com/document/d/xyz" → "仕事"
    **JSON形式で { "URL": "カテゴリ" } の形で出力してください。**
    `;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
            model: "gpt-4", // または "gpt-3.5-turbo"
            messages: [{ role: "user", content: prompt }],
            max_tokens: 300
        })
    });

    const data = await response.json();
    try {
        return JSON.parse(data.choices[0].message.content); // 🔹 JSON でカテゴリを取得
    } catch (error) {
        console.error("🚨 GPT のレスポンスを解析できません:", data);
        return {};
    }
}

async function groupTabsAutomatically() {
    chrome.tabs.query({ currentWindow: true }, async tabs => {
        const tabUrls = tabs.map(tab => tab.url);
        console.log("🧠 GPT に送信するタブ一覧:", tabUrls);

        const categorizedTabs = await categorizeTabsWithGPT(tabUrls);
        console.log("📌 GPT 解析結果:", categorizedTabs);

        let groups = {};
        tabs.forEach(tab => {
            let category = categorizedTabs[tab.url] || "その他";
            if (!groups[category]) {
                groups[category] = [];
            }
            groups[category].push(tab.id);
        });

        // 🔹 タブをカテゴリごとにグループ化
        Object.entries(groups).forEach(([category, tabIds]) => {
            chrome.tabGroups.create({ title: category, tabIds }, group => {
                console.log(`🗂 タブグループ "${category}" を作成しました`);
            });
        });
    });
}

// 🔹 ボタンを押したらグループ化
chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "groupTabsAutoGPT") {
        groupTabsAutomatically();
    }
});

