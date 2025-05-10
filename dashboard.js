document.addEventListener("DOMContentLoaded", () => {
  // 定期的にダッシュボードを更新
  updateDashboard();
  setInterval(updateTimeOnly, 1000); // 1秒ごとに滞在時間のみ
  updateTabListDropdown();
    loadPriorityUrls();
    loadCustomKeywords(); 

    chrome.runtime.sendMessage({ action: "refreshTabTitles" });



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


    const groupBtn = document.getElementById("groupTabsButton");
  
      // 起動時に前回の状態を復元
        chrome.storage.local.get("autoGroupingEnabled", data => {
               const isOn = !!data.autoGroupingEnabled;
              groupBtn.classList.toggle("active", isOn);
             groupBtn.querySelector(".buttonText").textContent = isOn
                    ? "自動グループ化: ON"
                : "自動グループ化: OFF";
            });
   

    // クリック → トグル・保存・テキスト更新・背景処理通知
    groupBtn.addEventListener("click", () => {
          const isOn = groupBtn.classList.toggle("active");
        　 // 見た目テキスト
              groupBtn.querySelector(".buttonText").textContent = isOn
                    ? "自動グループ化: ON"
                : "自動グループ化: OFF";
          // 永続化
              chrome.storage.local.set({ autoGroupingEnabled: isOn });
          // 背景スクリプトにも状態を通知（必要なら）
              chrome.runtime.sendMessage({ action: "toggleAutoGrouping", autoGroupingEnabled: isOn });
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
    // グループ別に追加・削除・読み込みするように変更
    document.getElementById("addCustomKeywordButton").addEventListener("click", () => {
        const input = document.getElementById("customKeywordInput");
        const newKeyword = input.value.trim();
        const group = document.getElementById("customGroupSelector").value;

        if (!newKeyword) return;

        chrome.storage.local.get(["customGroups"], data => {
            const groups = data.customGroups || { group1: [], group2: [], group3: [] };
            if (!groups[group].includes(newKeyword)) {
                groups[group].push(newKeyword);
                chrome.storage.local.set({ customGroups: groups }, () => {
                    input.value = "";
                    loadCustomKeywords(group);
                });
            }
        });
    });

    function removeCustomKeyword(group, keywordToRemove) {
        chrome.storage.local.get(["customGroups"], data => {
            const groups = data.customGroups || {};
            groups[group] = (groups[group] || []).filter(k => k !== keywordToRemove);
            chrome.storage.local.set({ customGroups: groups }, () => {
                loadCustomKeywords(group); // 再描画
            });
        });
    }

    // グループを指定して表示
    function loadCustomKeywords(group = "group1") {
        chrome.storage.local.get(["customGroups"], data => {
            const groups = data.customGroups || {};
            const keywords = groups[group] || [];

            const fullList = document.getElementById("customKeywordListFull");
            fullList.innerHTML = "";
            keywords.forEach(keyword => {
                const li = document.createElement("li");
                li.textContent = keyword;
                const btn = document.createElement("button");
                btn.textContent = "削除";
                btn.addEventListener("click", () => removeCustomKeyword(group, keyword));
                li.appendChild(btn);
                fullList.appendChild(li);
            });
        });
    }

    // セレクト変更時に切り替え
    document.getElementById("customGroupSelector").addEventListener("change", () => {
        const group = document.getElementById("customGroupSelector").value;
        loadCustomKeywords(group);
    });

    //キーワードでグループ化
    document.getElementById("groupByCustomKeywordsButton").addEventListener("click", () => {
        const groupKey = document.getElementById("customGroupSelector").value; // group1 など

        chrome.storage.local.get(["customGroups"], data => {
            const customGroups = data.customGroups || {};
            const keywords = customGroups[groupKey] || [];

            if (keywords.length === 0) {
                alert("このカスタムグループにはキーワードが登録されていません！");
                return;
            }

            chrome.tabs.query({}, tabs => {
                const matchedTabIds = tabs
                    .filter(tab => {
                        const title = tab.title || "";
                        const url = tab.url || "";
                        return keywords.some(kw => title.includes(kw) || url.includes(kw));
                    })
                    .map(tab => tab.id);

                if (matchedTabIds.length === 0) {
                    alert("該当するタブが見つかりませんでした。");
                    return;
                }

                chrome.tabs.group({ tabIds: matchedTabIds }, groupId => {
                    if (chrome.runtime.lastError) {
                        console.error("グループ化失敗:", chrome.runtime.lastError);
                        return;
                    }

                    const groupColor = {
                        group1: "blue",
                        group2: "green",
                        group3: "purple"
                    }[groupKey] || "grey";

                    chrome.tabGroups.update(groupId, {
                        title: `カスタム${groupKey.replace("group", "")}`,
                        color: groupColor
                    });
                });
            });
        });
    });


    // 自動グループ化の状態を取得してボタンラベルを更新
    chrome.storage.local.get("autoGroupEnabled", data => {
        const isEnabled = data.autoGroupEnabled === true;  // trueならON、falseならOFF
        const button = document.getElementById("groupTabsButton"); // ←ここが違った！
        button.querySelector(".buttonText").textContent = isEnabled ? "自動グループ化: ON" : "自動グループ化: OFF";
    });

    // 設定ボタンを押したとき、画面を切り替える
    document.getElementById("settingsButton").addEventListener("click", () => {
        document.getElementById("mainPage").style.display = "none";
        document.getElementById("settingsPage").style.display = "block";
        updateDashboard(); // ← 必ず再描画
        document.getElementById("tabListContainer").style.display = "block";

    });

    // 戻るボタンも動くようにする
    document.getElementById("backButton").addEventListener("click", () => {
        document.getElementById("settingsPage").style.display = "none";
        document.getElementById("mainPage").style.display = "block";
    });


   // 起動時にストレージから状態を取得してボタン表示
    chrome.storage.local.get(["updateModeEnabled"], (data) => {
        const isEnabled = data.updateModeEnabled !== false; // デフォルトtrue扱い
        const button = document.getElementById("toggleUpdateModeButton");
        button.textContent = isEnabled ? "更新モード: ON" : "更新モード: OFF";
    });

    //更新ON/OFF
    document.getElementById("toggleUpdateModeButton").addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "toggleUpdateMode" }, (response) => {
            const button = document.getElementById("toggleUpdateModeButton");
            if (response.updateModeEnabled) {
                button.textContent = "更新モード: ON";
            } else {
                button.textContent = "更新モード: OFF";
            }
        });
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
            tabs.forEach(tab => {
                const tabId = tab.id.toString();  // ← 修正！
                const tr = document.createElement("tr");
                const titleTd = document.createElement("td");
                const timeTd = document.createElement("td");
                const openTimeTd = document.createElement("td");

                titleTd.textContent = titles[tabId] || tab.title || "(No Title)";

                const baseMilliseconds = elapsedTimes[tabId] || 0;
                const baseSeconds = Math.floor(baseMilliseconds / 1000);
                initialTabTimes[tabId] = baseSeconds;

                timeTd.id = `time-${tabId}`;
                timeTd.textContent = formatTime(baseMilliseconds);

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

function loadCustomKeywords() {
    chrome.storage.local.get(["customKeywords"], data => {
        const keywords = data.customKeywords || [];

        // カスタムワード一覧用のリスト更新
        const fullList = document.getElementById("customKeywordListFull");
        fullList.innerHTML = "";
        keywords.forEach(keyword => {
            const li = document.createElement("li");
            li.textContent = keyword;
            const btn = document.createElement("button");
            btn.textContent = "削除";
            btn.addEventListener("click", () => removeCustomKeyword(keyword));
            li.appendChild(btn);
            fullList.appendChild(li);
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

//カスタムワード削除
function removeCustomKeyword(keywordToRemove) {
    chrome.storage.local.get(["customKeywords"], data => {
        let keywords = data.customKeywords || [];
        keywords = keywords.filter(k => k !== keywordToRemove);

        chrome.storage.local.set({ customKeywords: keywords }, () => {
            loadCustomKeywords(); // 再描画
        });
    });
}
