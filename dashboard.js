document.addEventListener("DOMContentLoaded", () => {
    // 定期的にダッシュボードを更新
    updateDashboard();
    setInterval(updateDashboard, 1000);
  
    // 優先URLリストを読み込む
    loadPriorityUrls();
  
    // 閲覧時間順ソート
    document.getElementById("sortByElapsedTimeButton").addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "sortByElapsedTimeRequest" }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("❌ ソートリクエスト送信エラー:", chrome.runtime.lastError);
        } else {
          console.log("✅ ソートリクエスト送信成功:", response);
        }
      });
    });

  document.getElementById("groupTabsButton").addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "groupTabsAutomatically" });
    });
    
    // 開いた時間順ソート
    document.getElementById("sortByOpenTimeButton").addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "sortByOpenTimeRequest" }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("❌ ソートリクエスト送信エラー:", chrome.runtime.lastError);
        } else {
          console.log("✅ ソートリクエスト送信成功:", response);
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
    console.log("📩 受信したメッセージ:", message);
    if (message.action === "updateDashboard") {
      console.log("🔄 ダッシュボード更新リクエストを受信");
      updateDashboard();
      sendResponse({ status: "ok" });
    }
  });
  
  // ダッシュボードの表示を更新
  function updateDashboard() {
    chrome.storage.local.get(["tabElapsedTimes", "tabOpenTimes", "tabTitles"], data => {
      const elapsedTimes = data.tabElapsedTimes || {};
      const openTimes = data.tabOpenTimes || {};
      const titles = data.tabTitles || {};
  
      // テーブルの tbody をクリア
      const tableBody = document.getElementById("timeTable");
      tableBody.innerHTML = "";
  
      // 各タブの情報をテーブルに追加
      Object.keys(elapsedTimes).forEach(tabId => {
        const tr = document.createElement("tr");
        const titleTd = document.createElement("td");
        const timeTd = document.createElement("td");
        const openTimeTd = document.createElement("td");
  
        titleTd.textContent = titles[tabId] || "(No Title)";
        timeTd.textContent = (elapsedTimes[tabId] / 1000).toFixed(1); // 秒表示
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
  }
  
  // 優先URLリストを読み込んで表示
  function loadPriorityUrls() {
    chrome.storage.local.get(["priorityUrls"], data => {
      const urls = data.priorityUrls || [];
      const list = document.getElementById("priorityUrlList");
      list.innerHTML = "";
  
      urls.forEach(url => {
        const li = document.createElement("li");
        li.textContent = url;
  
        const removeButton = document.createElement("button");
        removeButton.textContent = "削除";
        removeButton.addEventListener("click", () => removePriorityUrl(url));
  
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
  
