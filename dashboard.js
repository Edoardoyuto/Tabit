function updateDashboard() {
    chrome.storage.local.get(["tabElapsedTimes", "tabTitles"], data => {
        const timeTable = document.getElementById("timeTable");
        timeTable.innerHTML = "";
        let totalTime = 0;

        for (let tabId in data.tabElapsedTimes) {
            let time = data.tabElapsedTimes[tabId] / 1000;
            totalTime += time;
            let title = data.tabTitles[tabId] || `Tab ${tabId}`;
            let row = document.createElement("tr");
            row.innerHTML = `<td>${title}</td><td>${time.toFixed(1)}</td>`;
            timeTable.appendChild(row);
        }

        console.log("✅ ダッシュボード更新:", new Date().toLocaleTimeString());
    });
}


// メッセージが来たらダッシュボードを更新
chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "updateDashboard") {
        console.log("📩 updateDashboard メッセージ受信");
        updateDashboard();
    }
});

// 初回表示 & 1秒ごとの更新ループ
document.addEventListener("DOMContentLoaded", () => {
    updateDashboard();
    setInterval(updateDashboard, 1000);

    // ソートボタンのイベントリスナーを `DOMContentLoaded` 内で設定
    const sortButton = document.getElementById("sortButton");
    if (sortButton) {
        sortButton.addEventListener("click", () => {
            console.log("🔘 ソートボタンが押されました");

            chrome.runtime.sendMessage({ action: "sortByElapsedTimeRequest" }, response => {
                if (chrome.runtime.lastError) {
                    console.error("🚨 メッセージ送信エラー:", chrome.runtime.lastError.message);
                } else {
                    console.log("✅ メッセージ送信成功", response);
                }
            });
        });
    } else {
        console.error("🚨 ソートボタンが見つかりませんでした！");
    }
});

 // **AI グループ化ボタンのイベントリスナー**
    const aiGroupButton = document.getElementById("groupTabsAutoGPT");
    if (aiGroupButton) {
        aiGroupButton.addEventListener("click", () => {
            console.log("🧠 AI グループ化ボタンが押されました");

            chrome.runtime.sendMessage({ action: "groupTabsAutoGPT" }, response => {
                if (chrome.runtime.lastError) {
                    console.error("🚨 メッセージ送信エラー:", chrome.runtime.lastError.message);
                } else {
                    console.log("✅ AI グループ化メッセージ送信成功", response);
                }
            });
        });
    } else {
        console.error("🚨 AI グループ化ボタンが見つかりませんでした！");
    }
});
