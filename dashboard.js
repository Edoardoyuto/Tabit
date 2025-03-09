document.addEventListener("DOMContentLoaded", () => {
    updateDashboard();
    setInterval(updateDashboard, 1000);

    document.getElementById("sortByElapsedTimeButton").addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "sortByElapsedTimeRequest" });
    });

    document.getElementById("sortByOpenTimeButton").addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "sortByOpenTimeRequest" });
    });
});

function updateDashboard() {
    chrome.storage.local.get(["tabElapsedTimes", "tabOpenTimes", "tabTitles"], data => {
        const timeTable = document.getElementById("timeTable");
        timeTable.innerHTML = "";

        const tabElapsedTimes = data.tabElapsedTimes || {};
        const tabOpenTimes = data.tabOpenTimes || {};
        const tabTitles = data.tabTitles || {};

        for (let tabId in tabElapsedTimes) {
            let openTime = tabOpenTimes[tabId] ? new Date(tabOpenTimes[tabId]).toLocaleString() : "N/A";
            timeTable.innerHTML += `<tr><td>${tabTitles[tabId] || `Tab ${tabId}`}</td><td>${(tabElapsedTimes[tabId] / 1000).toFixed(1)}</td><td>${openTime}</td></tr>`;
        }
    });
}
