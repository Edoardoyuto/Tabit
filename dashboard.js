function updateDashboard() {
    chrome.storage.local.get(["tabTimes", "tabTitles"], data => {
        const timeTable = document.getElementById("timeTable");
        timeTable.innerHTML = "";

        for (let tabId in data.tabTimes) {
            let time = data.tabTimes[tabId] / 1000;
            let title = data.tabTitles[tabId] || `Tab ${tabId}`;
            let row = document.createElement("tr");
            row.innerHTML = `<td>${title}</td><td>${time.toFixed(1)}</td>`;
            timeTable.appendChild(row);
        }
    });
}

// メッセージリスナーを登録
chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "updateDashboard") {
        updateDashboard();
    }
});

// 初回表示 & 1秒ごとに更新（時間を増やし続ける）
document.addEventListener("DOMContentLoaded", () => {
    updateDashboard();
    setInterval(updateDashboard, 1000);
});
