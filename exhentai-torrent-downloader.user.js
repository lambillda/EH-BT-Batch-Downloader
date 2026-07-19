// ==UserScript==
// @name         ExHentai Torrent Batch Downloader
// @namespace    http://lambillda.null/
// @version      1.3.4
// @description  批量下载ExHentai的BT种子
// @author       Lambillda
// @match        *://exhentai.org/favorites.php*
// @match        *://e-hentai.org/favorites.php*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      exhentai.org
// @connect      e-hentai.org
// @connect      *
// ==/UserScript==

(function () {
  "use strict";

  let config = {
    silentMode: GM_getValue("silentMode", false),
  };

  GM_registerMenuCommand(
    "切换静默模式 (当前: " + (config.silentMode ? "开启" : "关闭") + ")",
    function () {
      config.silentMode = !config.silentMode;
      GM_setValue("silentMode", config.silentMode);
      alert(
        "静默模式已" +
          (config.silentMode ? "开启" : "关闭") +
          "\n开启后没有torrent的画廊将被静默跳过，其他错误以通知形式显示",
      );
      location.reload();
    },
  );

  let rangeSelectMode = false;
  let rangeStart = null;

  const styles = `
        .torrent-item-wrapper {
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }
        .torrent-checkbox {
            width: 18px;
            height: 18px;
            cursor: pointer;
            flex-shrink: 0;
        }
        .torrent-control-container {
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 9999;
            display: flex;
            gap: 10px;
            align-items: center;
        }
        .torrent-select-all {
            padding: 10px 15px;
            background-color: #34353b;
            color: #f1f1f1;
            border: 1px solid #5c0d12;
            border-radius: 3px;
            cursor: pointer;
            font-size: 14px;
        }
        .torrent-select-all:hover {
            background-color: #5c0d12;
        }
        .torrent-range-select {
            padding: 10px 15px;
            background-color: #34353b;
            color: #f1f1f1;
            border: 1px solid #5c0d12;
            border-radius: 3px;
            cursor: pointer;
            font-size: 14px;
        }
        .torrent-range-select:hover {
            background-color: #5c0d12;
        }
        .torrent-range-select.active {
            background-color: #5c0d12;
            border-color: #ff6b6b;
        }
        .torrent-download-btn {
            padding: 10px 20px;
            background-color: #34353b;
            color: #f1f1f1;
            border: 1px solid #5c0d12;
            border-radius: 3px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
        }
        .torrent-download-btn:hover {
            background-color: #5c0d12;
        }
        .torrent-status {
            position: fixed;
            top: 50px;
            right: 10px;
            z-index: 9999;
            padding: 10px;
            background-color: #34353b;
            color: #f1f1f1;
            border: 1px solid #5c0d12;
            border-radius: 3px;
            font-size: 12px;
            max-width: 300px;
            display: none;
        }
        .torrent-notification {
            position: fixed;
            top: 100px;
            right: 10px;
            z-index: 10000;
            padding: 15px;
            background-color: #34353b;
            color: #f1f1f1;
            border: 1px solid #5c0d12;
            border-radius: 3px;
            font-size: 13px;
            max-width: 350px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease-out;
            transition: opacity 0.3s ease-out, transform 0.3s ease-out;
        }
        .torrent-notification.error {
            border-color: #ff6b6b;
            background-color: #4a2b2b;
        }
        .torrent-notification.success {
            border-color: #51cf66;
            background-color: #2b4a2b;
        }
        @keyframes slideIn {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    `;

  const styleSheet = document.createElement("style");
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);

  function randomDelay() {
    return new Promise((resolve) => {
      const delay = Math.random() * 2000 + 2000;
      setTimeout(resolve, delay);
    });
  }

  function showNotification(message, type = "info", duration = 3000) {
    const notification = document.createElement("div");
    notification.className = "torrent-notification " + type;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.opacity = "0";
      notification.style.transform = "translateX(400px)";
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 300);
    }, duration);
  }

  function updateStatus(message) {
    const statusDiv = document.getElementById("torrent-status");
    if (statusDiv) {
      statusDiv.textContent = message;
      statusDiv.style.display = "block";
    }
  }

  function hideStatus() {
    const statusDiv = document.getElementById("torrent-status");
    if (statusDiv) {
      statusDiv.style.display = "none";
    }
  }

  const galleryLinkSelector = 'a[href*="/g/"]';

  function findGalleryLinks(root) {
    const links = [];

    if (root.nodeType === 1 && root.matches(galleryLinkSelector)) {
      links.push(root);
    }

    if (root.querySelectorAll) {
      links.push(...root.querySelectorAll(galleryLinkSelector));
    }

    return links.filter((link) =>
      /\/g\/\d+\/[a-f0-9]+\/?/i.test(link.href),
    );
  }

  function addCheckboxes(root = document) {
    const galleryLinks = findGalleryLinks(root);

    let addedCount = 0;
    galleryLinks.forEach((link) => {
      if (link.hasAttribute("data-torrent-checkbox-added")) {
        return;
      }

      let torrentUrl = null;
      const galleryMatch = link.href.match(/\/g\/(\d+)\/([a-f0-9]+)/i);
      if (galleryMatch) {
        const gid = galleryMatch[1];
        const token = galleryMatch[2];
        const baseUrl = link.href.includes("exhentai.org")
          ? "https://exhentai.org"
          : "https://e-hentai.org";
        torrentUrl = `${baseUrl}/gallerytorrents.php?gid=${gid}&t=${token}`;
      }

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "torrent-checkbox";
      checkbox.dataset.galleryUrl = link.href;

      if (torrentUrl) {
        checkbox.dataset.torrentUrl = torrentUrl;
      }

      if (rangeSelectMode) {
        checkbox.addEventListener("click", handleRangeClick);
      }

      const wrapper = document.createElement("div");
      wrapper.className = "torrent-item-wrapper";

      link.setAttribute("data-torrent-checkbox-added", "true");

      link.replaceWith(wrapper);
      wrapper.append(checkbox, link);
      addedCount++;
    });

    return addedCount;
  }

  function addControlButtons() {
    if (document.getElementById("torrent-control-container")) {
      return;
    }

    const container = document.createElement("div");
    container.id = "torrent-control-container";
    container.className = "torrent-control-container";

    const selectAllBtn = document.createElement("button");
    selectAllBtn.id = "torrent-select-all-btn";
    selectAllBtn.className = "torrent-select-all";
    selectAllBtn.textContent = "全选";
    selectAllBtn.addEventListener("click", toggleSelectAll);

    const rangeSelectBtn = document.createElement("button");
    rangeSelectBtn.id = "torrent-range-select-btn";
    rangeSelectBtn.className = "torrent-range-select";
    rangeSelectBtn.textContent = "范围选择";
    rangeSelectBtn.addEventListener("click", toggleRangeSelect);

    const downloadBtn = document.createElement("button");
    downloadBtn.id = "torrent-download-btn";
    downloadBtn.className = "torrent-download-btn";
    downloadBtn.textContent = "下载";
    downloadBtn.addEventListener("click", startBatchDownload);

    container.appendChild(selectAllBtn);
    container.appendChild(rangeSelectBtn);
    container.appendChild(downloadBtn);

    document.body.appendChild(container);

    const statusDiv = document.createElement("div");
    statusDiv.id = "torrent-status";
    statusDiv.className = "torrent-status";
    document.body.appendChild(statusDiv);
  }

  function toggleSelectAll() {
    const checkboxes = document.querySelectorAll(".torrent-checkbox");
    const allChecked = Array.from(checkboxes).every((cb) => cb.checked);

    checkboxes.forEach((cb) => {
      cb.checked = !allChecked;
    });

    const btn = document.getElementById("torrent-select-all-btn");
    btn.textContent = allChecked ? "全选" : "取消全选";
  }

  function toggleRangeSelect() {
    rangeSelectMode = !rangeSelectMode;
    rangeStart = null;

    const btn = document.getElementById("torrent-range-select-btn");
    if (rangeSelectMode) {
      btn.classList.add("active");
      btn.textContent = "取消范围";
      showNotification(
        "范围选择模式：点击第一个复选框设置起点，再点击第二个复选框设置终点",
        "success",
        4000,
      );

      const checkboxes = document.querySelectorAll(".torrent-checkbox");
      checkboxes.forEach((cb) => {
        cb.addEventListener("click", handleRangeClick);
      });
    } else {
      btn.classList.remove("active");
      btn.textContent = "范围选择";
      showNotification("已退出范围选择模式", "info", 2000);

      const checkboxes = document.querySelectorAll(".torrent-checkbox");
      checkboxes.forEach((cb) => {
        cb.removeEventListener("click", handleRangeClick);
      });
    }
  }

  function handleRangeClick(event) {
    if (!rangeSelectMode) return;

    event.preventDefault();
    event.stopPropagation();

    const checkbox = event.target;
    const allCheckboxes = Array.from(
      document.querySelectorAll(".torrent-checkbox"),
    );
    const clickedIndex = allCheckboxes.indexOf(checkbox);

    if (rangeStart === null) {
      rangeStart = clickedIndex;
      checkbox.checked = true;
      showNotification("起点已设置，请点击终点复选框", "success", 2000);
    } else {
      const rangeEnd = clickedIndex;
      const start = Math.min(rangeStart, rangeEnd);
      const end = Math.max(rangeStart, rangeEnd);

      setTimeout(() => {
        for (let i = start; i <= end; i++) {
          if (allCheckboxes[i]) {
            allCheckboxes[i].checked = true;
          }
        }

        allCheckboxes[start].checked = true;
        allCheckboxes[end].checked = true;

        showNotification(`已选择 ${end - start + 1} 个项目`, "success", 2000);
      }, 0);

      rangeStart = null;

      setTimeout(() => {
        if (rangeSelectMode) {
          toggleRangeSelect();
        }
      }, 500);
    }
  }

  async function getTorrentList(torrentPageUrl) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: torrentPageUrl,
        onload: function (response) {
          try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(
              response.responseText,
              "text/html",
            );

            const torrentForms = doc.querySelectorAll(
              'form[action*="gallerytorrents.php"]',
            );
            const torrents = [];

            torrentForms.forEach((form) => {
              const table = form.querySelector("table");
              if (!table) return;

              const rows = table.querySelectorAll("tr");
              let posted = "",
                size = "",
                seeds = 0,
                peers = 0,
                downloads = 0,
                uploader = "";
              let torrentLink = null;

              rows.forEach((row) => {
                const cells = row.querySelectorAll("td");

                if (cells.length >= 6) {
                  const postedText = cells[0].textContent;
                  if (postedText.includes("Posted:")) {
                    const postedMatch = postedText.match(/Posted:\s*(.+)/);
                    if (postedMatch) posted = postedMatch[1].trim();
                  }

                  const sizeText = cells[1].textContent;
                  if (sizeText.includes("Size:")) {
                    const sizeMatch = sizeText.match(/Size:\s*(.+)/);
                    if (sizeMatch) size = sizeMatch[1].trim();
                  }

                  const seedsText = cells[3].textContent;
                  if (seedsText.includes("Seeds:")) {
                    const seedsMatch = seedsText.match(/Seeds:\s*(\d+)/);
                    if (seedsMatch) seeds = parseInt(seedsMatch[1]) || 0;
                  }

                  const peersText = cells[4].textContent;
                  if (peersText.includes("Peers:")) {
                    const peersMatch = peersText.match(/Peers:\s*(\d+)/);
                    if (peersMatch) peers = parseInt(peersMatch[1]) || 0;
                  }

                  const downloadsText = cells[5].textContent;
                  if (downloadsText.includes("Downloads:")) {
                    const downloadsMatch =
                      downloadsText.match(/Downloads:\s*(\d+)/);
                    if (downloadsMatch)
                      downloads = parseInt(downloadsMatch[1]) || 0;
                  }
                }

                if (cells.length >= 2) {
                  const uploaderText = cells[0].textContent;
                  if (uploaderText.includes("Uploader:")) {
                    const uploaderMatch =
                      uploaderText.match(/Uploader:\s*(.+)/);
                    if (uploaderMatch) uploader = uploaderMatch[1].trim();
                  }
                }

                const link = row.querySelector('a[href*=".torrent"]');
                if (link) {
                  torrentLink = link;
                }
              });

              if (torrentLink) {
                let downloadUrl = torrentLink.href;
                const onclick = torrentLink.getAttribute("onclick");
                if (onclick) {
                  const urlMatch = onclick.match(
                    /document\.location='([^']+)'/,
                  );
                  if (urlMatch) {
                    downloadUrl = urlMatch[1];
                  }
                }

                torrents.push({
                  url: downloadUrl,
                  name: torrentLink.textContent.trim(),
                  posted: posted,
                  size: size,
                  seeds: seeds,
                  peers: peers,
                  downloads: downloads,
                  uploader: uploader,
                });
              }
            });

            resolve(torrents);
          } catch (error) {
            reject("解析torrent页面失败: " + error.message);
          }
        },
        onerror: function (error) {
          reject("请求失败: " + error);
        },
      });
    });
  }

  function downloadTorrent(url, filename) {
    return new Promise((resolve, reject) => {
      try {
        filename = filename.replace(/[<>:"/\\|?*]/g, "_");
        if (!filename.endsWith(".torrent")) {
          filename += ".torrent";
        }

        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.style.display = "none";
        document.body.appendChild(a);

        a.click();

        setTimeout(() => {
          document.body.removeChild(a);
          resolve();
        }, 500);
      } catch (error) {
        reject(error);
      }
    });
  }

  async function processGallery(galleryUrl, torrentPageUrl, index, total) {
    updateStatus(`[${index}/${total}] 正在处理...`);

    try {
      if (!torrentPageUrl) {
        if (!config.silentMode) {
          alert(`该条目没有torrent下载选项:\n${galleryUrl}`);
        }
        return;
      }

      const torrents = await getTorrentList(torrentPageUrl);

      if (torrents.length === 0) {
        if (!config.silentMode) {
          alert(`该条目没有可用的torrent:\n${galleryUrl}`);
        }
        return;
      }

      let selectedTorrent;

      if (torrents.length === 1) {
        selectedTorrent = torrents[0];
      } else {
        const options = torrents
          .map((t, idx) => {
            let info = `${idx + 1}. ${t.name}\n`;
            info += `   Seeds: ${t.seeds} | Peers: ${t.peers}`;
            if (t.size) info += ` | Size: ${t.size}`;
            if (t.uploader) info += `\n   Uploader: ${t.uploader}`;
            if (t.posted) info += ` | Posted: ${t.posted}`;
            return info;
          })
          .join("\n\n");

        const choice = prompt(
          `该条目有 ${torrents.length} 个torrent，请选择:\n(输入序号，输入0取消)\n\n${options}`,
          "1",
        );

        if (!choice || choice === "0") {
          return;
        }

        const choiceNum = parseInt(choice);
        if (isNaN(choiceNum) || choiceNum < 1 || choiceNum > torrents.length) {
          if (config.silentMode) {
            showNotification("无效的选择", "error", 2000);
          } else {
            alert("无效的选择");
          }
          return;
        }

        selectedTorrent = torrents[choiceNum - 1];
      }

      if (selectedTorrent) {
        updateStatus(`[${index}/${total}] 正在下载: ${selectedTorrent.name}`);
        await downloadTorrent(selectedTorrent.url, selectedTorrent.name);
        updateStatus(`[${index}/${total}] 下载完成`);
        if (config.silentMode) {
          showNotification(`[${index}/${total}] 下载完成`, "success", 1500);
        }
      }
    } catch (error) {
      const errorMsg =
        typeof error === "object" ? JSON.stringify(error) : String(error);
      if (config.silentMode) {
        showNotification(
          `[${index}/${total}] 处理失败: ${errorMsg}`,
          "error",
          3000,
        );
      } else {
        alert(`处理失败:\n${galleryUrl}\n\n错误: ${errorMsg}`);
      }
    }
  }

  async function startBatchDownload() {
    const checkedBoxes = Array.from(
      document.querySelectorAll(".torrent-checkbox:checked"),
    );

    if (checkedBoxes.length === 0) {
      if (config.silentMode) {
        showNotification("请至少选择一个条目", "error", 2000);
      } else {
        alert("请至少选择一个条目");
      }
      return;
    }

    const confirmed = confirm(
      `确定要下载 ${checkedBoxes.length} 个条目的种子吗？`,
    );
    if (!confirmed) {
      return;
    }

    const downloadBtn = document.getElementById("torrent-download-btn");
    downloadBtn.disabled = true;
    downloadBtn.textContent = "下载中...";

    for (let i = 0; i < checkedBoxes.length; i++) {
      const checkbox = checkedBoxes[i];
      const galleryUrl = checkbox.dataset.galleryUrl;
      const torrentUrl = checkbox.dataset.torrentUrl;

      await processGallery(galleryUrl, torrentUrl, i + 1, checkedBoxes.length);

      if (i < checkedBoxes.length - 1) {
        await randomDelay();
      }
    }

    downloadBtn.disabled = false;
    downloadBtn.textContent = "下载";
    hideStatus();

    if (config.silentMode) {
      showNotification("批量下载任务完成！", "success", 3000);
    } else {
      alert("批量下载任务完成！");
    }
  }

  function init() {
    addControlButtons();

    addCheckboxes();

    const observer = new MutationObserver((mutations) => {
      const addedRoots = new Set();

      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) {
            return;
          }

          if (node.closest(".torrent-item-wrapper")) {
            return;
          }

          if (
            node.matches(galleryLinkSelector) ||
            node.querySelector(galleryLinkSelector)
          ) {
            addedRoots.add(node);
          }
        });
      });

      addedRoots.forEach((root) => addCheckboxes(root));
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
