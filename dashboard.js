document.addEventListener("DOMContentLoaded", () => {
  // 定期的にダッシュボードを更新
  updateDashboard();
  setInterval(updateTimeOnly, 1000); // 1秒ごとに滞在時間のみ
  updateTabListDropdown();
  loadPriorityUrls();


  document.getElementById("toggleTabListButton").addEventListener("click", () => {
    const container = document.getElementById("tabListContainer");
    container.style.display = container.style.display === "none" ? "block" : "none";
  });
  document.getElementById("togglePriorityUrlButton").addEventListener("click", () => {
    const container = document.getElementById("priorityUrlContainer");
    container.style.display = container.style.display === "none" ? "block" : "none";
  });

  // タブ一覧をドロップダウンに更新
  function updateTabListDropdown() {
      chrome.tabs.query({}, tabs => {
          const dropdown = document.getElementById("tabListDropdown");
          dropdown.innerHTML = '<option value="">タブを選択</option>';
          tabs.forEach(tab => {
              let option = document.createElement("option");
              option.value = tab.url;
              option.textContent = tab.title || tab.url;
              dropdown.appendChild(option);
          });
      });
  }

  // 開いているタブから選択して優先URLに追加
  document.getElementById("addFromTabsButton").addEventListener("click", () => {
      const dropdown = document.getElementById("tabListDropdown");
      const selectedUrl = dropdown.value;
      if (selectedUrl) {
          chrome.storage.local.get(["priorityUrls"], data => {
              let urls = data.priorityUrls || [];
              if (!urls.includes(selectedUrl)) {
                  urls.push(selectedUrl);
                  chrome.storage.local.set({ priorityUrls: urls }, () => {
                      chrome.runtime.sendMessage({ action: "updatePriorityUrls", urls });
                      loadPriorityUrls();
                  });
              }
          });
      }
  });

  // 閲覧時間順ソート
  document.getElementById("sortByElapsedTimeButton").addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "sortByElapsedTimeRequest" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("ソートリクエスト送信エラー:", chrome.runtime.lastError);
      } else {
        console.log("ソートリクエスト送信成功:", response);
      }
    });
  });

  // グループ化
  document.getElementById("groupTabsButton").addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "groupTabsAutomatically" });
  });

  // グループ解除
  document.getElementById("ungroupTabsButton").addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "ungroupTabs" }, () => {
          console.log("タブのグループ解除リクエスト送信完了");
      });
  });

  // 開いた時間順ソート
  document.getElementById("sortByOpenTimeButton").addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "sortByOpenTimeRequest" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("ソートリクエスト送信エラー:", chrome.runtime.lastError);
      } else {
        console.log("ソートリクエスト送信成功:", response);
      }
    });
  });

  // 優先URLを追加
  document.getElementById("addPriorityUrlButton").addEventListener("click", () => {
    const input = document.getElementById("priorityUrlInput");
    const newUrl = input.value.trim();
    if (newUrl) {
      chrome.storage.local.get(["priorityUrls"], data => {
        const urls = data.priorityUrls || [];
        if (!urls.includes(newUrl)) {
          urls.push(newUrl);
          chrome.storage.local.set({ priorityUrls: urls }, () => {
            chrome.runtime.sendMessage({ action: "updatePriorityUrls", urls });
            input.value = "";
            loadPriorityUrls();
          });
        }
      });
    }
  });
});

// メッセージ受信リスナー
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("受信したメッセージ:", message);
  if (message.action === "updateDashboard") {
    console.log("ダッシュボード更新リクエストを受信");
    updateDashboard();
    sendResponse({ status: "ok" });
  }
});

const initialTabTimes = {};  // ← 修正：tabIdごとの初期秒数
let dashboardStartTime = 0; // ← 最初は0にしておく


// ダッシュボードの表示を更新
function updateDashboard() {
    chrome.storage.local.get(["tabElapsedTimes", "tabOpenTimes", "tabTitles"], data => {
        const elapsedTimes = data.tabElapsedTimes || {};
        const openTimes = data.tabOpenTimes || {};
        const titles = data.tabTitles || {};

        chrome.tabs.query({}, tabs => {
            const openTabIds = tabs.map(tab => tab.id.toString());

            dashboardStartTime = Date.now(); // 最新の基準時間に更新

            const tableBody = document.getElementById("timeTable");
            tableBody.innerHTML = "";

            Object.keys(elapsedTimes).forEach(tabId => {
                if (!openTabIds.includes(tabId)) return;

                const baseSeconds = Math.floor(elapsedTimes[tabId] / 1000);
                initialTabTimes[tabId] = baseSeconds;

                const tr = document.createElement("tr");
                const titleTd = document.createElement("td");
                const timeTd = document.createElement("td");
                const openTimeTd = document.createElement("td");

                titleTd.textContent = titles[tabId] || "(No Title)";
                timeTd.id = `time-${tabId}`;
                timeTd.textContent = formatTime(baseSeconds * 1000);

                if (openTimes[tabId]) {
                    const dateObj = new Date(openTimes[tabId]);
                    openTimeTd.textContent = dateObj.toLocaleTimeString();
                } else {
                    openTimeTd.textContent = "N/A";
                }

                tr.appendChild(titleTd);
                tr.appendChild(timeTd);
                tr.appendChild(openTimeTd);
                tableBody.appendChild(tr);
            });
        });
    });
}



// 時間をフォーマットする関数
function formatTime(milliseconds) {
  let totalSeconds = Math.floor(milliseconds / 1000);
  let hours = Math.floor(totalSeconds / 3600);
  let minutes = Math.floor((totalSeconds % 3600) / 60);
  let seconds = totalSeconds % 60;

  if (hours > 0) {
      return `${hours} 時間 ${minutes} 分`;
  } else if (minutes > 0) {
      return `${minutes} 分 ${seconds} 秒`;
  } else {
      return `${seconds} 秒`;
  }
}

// **1秒ごとに滞在時間のみ更新**
function updateTimeOnly() {
    const now = Date.now();

    // 現在のアクティブなタブを取得
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        const activeTab = tabs[0];
        if (!activeTab || activeTab.url.includes("dashboard.html")) return;

        const activeTabId = activeTab.id.toString();
        const secondsSinceOpen = Math.floor((now - dashboardStartTime) / 1000);

        const timeTd = document.getElementById(`time-${activeTabId}`);
        if (timeTd && initialTabTimes[activeTabId] !== undefined) {
            const totalSeconds = initialTabTimes[activeTabId] + secondsSinceOpen;
            timeTd.textContent = formatTime(totalSeconds * 1000);
        }
    });
}



// 優先URLリストを読み込んで表示
function loadPriorityUrls() {
  chrome.storage.local.get(["priorityUrls"], data => {
    const urls = data.priorityUrls || [];
    const list = document.getElementById("priorityUrlList");
    list.innerHTML = "";

    urls.forEach(url => {
      const li = document.createElement("li");
      
      // URLテキストをspanでラップしてクラスを追加
      const span = document.createElement("span");
      span.textContent = url;
      span.classList.add("priority-url-text");
      
      const removeButton = document.createElement("button");
      removeButton.textContent = "削除";
      removeButton.addEventListener("click", () => removePriorityUrl(url));
    
      li.appendChild(span);
      li.appendChild(removeButton);
      list.appendChild(li);
    });
    
  });
}

// 優先URLを削除
function removePriorityUrl(urlToRemove) {
  chrome.storage.local.get(["priorityUrls"], data => {
    let urls = data.priorityUrls || [];
    urls = urls.filter(url => url !== urlToRemove);

    chrome.storage.local.set({ priorityUrls: urls }, () => {
      chrome.runtime.sendMessage({ action: "updatePriorityUrls", urls });
      loadPriorityUrls();
    });
  });
}
