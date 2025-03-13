document.addEventListener("DOMContentLoaded", () => {
    // 定期的にダッシュボードを更新
    updateDashboard();
    setInterval(updateTimeOnly, 1000); // 1秒ごとに滞在時間のみ更新
    updateTabListDropdown();

  
    // 優先URLリストを読み込む
    loadPriorityUrls();

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
          console.error("❌ ソートリクエスト送信エラー:", chrome.runtime.lastError);
        } else {
          console.log("✅ ソートリクエスト送信成功:", response);
        }
      });
    });

  document.getElementById("groupTabsButton").addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "groupTabsAutomatically" });
  });

    document.getElementById("ungroupTabsButton").addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "ungroupTabs" }, () => {
            console.log("タブのグループ解除リクエスト送信完了");
        });
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

        chrome.tabs.query({}, tabs => {
            // タブの現在の順序を取得
            const tabOrder = tabs.map(tab => tab.id.toString());

      // テーブルの tbody をクリア
      const tableBody = document.getElementById("timeTable");
      tableBody.innerHTML = "";
  
            // タブIDの順序で並べ直し
            tabOrder.forEach(tabId => {
                if (!elapsedTimes[tabId]) return; // 記録がないタブはスキップ

                const tr = document.createElement("tr");
                tr.dataset.tabId = tabId; // タブIDをデータ属性に設定
                const titleTd = document.createElement("td");
                const timeTd = document.createElement("td");
                const openTimeTd = document.createElement("td");

                titleTd.textContent = titles[tabId] || "(No Title)";
                timeTd.id = `time-${tabId}`; // 滞在時間用のIDを設定
                timeTd.textContent = formatTime(elapsedTimes[tabId] || 0);

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
            updateTimeOnly(); // 滞在時間更新
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
    chrome.storage.local.get(["tabElapsedTimes"], data => {
        let elapsedTimes = data.tabElapsedTimes || {}; // ストレージから取得
        const currentTime = Date.now();

        // 現在のアクティブタブを取得（非同期処理の中で実行）
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
            const activeTabId = tabs.length > 0 ? tabs[0].id.toString() : null;

            let updated = false; // ストレージ更新判定

            Object.keys(elapsedTimes).forEach(tabId => {
                const timeTd = document.getElementById(`time-${tabId}`);

                if (timeTd) {
                    // **滞在時間を更新**
                    let elapsedTime = elapsedTimes[tabId] || 0;
                    if (tabId === activeTabId) {
                        elapsedTime += 1000; // 1秒増やす
                        elapsedTimes[tabId] = elapsedTime; // データを更新
                        updated = true;
                    }
                    timeTd.textContent = formatTime(elapsedTime);
                }
            });

            // **変更があった場合のみストレージに保存**
            if (updated) {
                chrome.storage.local.set({ tabElapsedTimes: elapsedTimes }, () => {
                });
            }
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
  
