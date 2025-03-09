function updateDashboard() {
    chrome.storage.local.get(["tabTimes", "tabTitles"], data => {
        const timeTable = document.getElementById("timeTable");
        timeTable.innerHTML = "";
        let totalTime = 0;

        for (let tabId in data.tabTimes) {
            let time = data.tabTimes[tabId] / 1000;
            totalTime += time;
            let title = data.tabTitles[tabId] || `Tab ${tabId}`;
            let row = document.createElement("tr");
            row.innerHTML = `<td>${title}</td><td>${time.toFixed(1)}</td>`;
            timeTable.appendChild(row);
        }

        console.log("ダッシュボード更新:", new Date().toLocaleTimeString());
    });
}

// メッセージが来たらダッシュボードを更新
chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "updateDashboard") {
        updateDashboard();
    }
});

// 初回表示 & 1秒ごとの更新ループ
document.addEventListener("DOMContentLoaded", () => {
    updateDashboard();
    setInterval(updateDashboard, 1000);
});

document.getElementById("sortButton").addEventListener("click", () => {
    console.log("🔘 ソートボタンが押されました");
    chrome.runtime.sendMessage({ action: "sortTabsRequest" }, response => {
        if (chrome.runtime.lastError) {
            console.error("🚨 メッセージ送信エラー:", chrome.runtime.lastError.message);
        } else {
            console.log("✅ メッセージ送信成功");
        }
    });
});

