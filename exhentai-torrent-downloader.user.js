// ==UserScript==
// @name         ExHentai Torrent Batch Downloader
// @namespace    http://lambillda.null/
// @version      1.3.1
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

  // 配置项
  let config = {
    silentMode: GM_getValue("silentMode", false), // 静默模式：使用通知而不是弹窗
  };

  // 注册菜单命令
  GM_registerMenuCommand(
    "切换静默模式 (当前: " + (config.silentMode ? "开启" : "关闭") + ")",
    function () {
      config.silentMode = !config.silentMode;
      GM_setValue("silentMode", config.silentMode);
      alert(
        "静默模式已" +
          (config.silentMode ? "开启" : "关闭") +
          "\n开启后错误将以通知形式显示，不会中断下载流程",
      );
      location.reload();
    },
  );

  // 范围选择状态
  let rangeSelectMode = false;
  let rangeStart = null;

  // 样式
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

  // 添加样式
  const styleSheet = document.createElement("style");
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);

  // 随机延迟函数 (2-4秒)
  function randomDelay() {
    return new Promise((resolve) => {
      const delay = Math.random() * 2000 + 2000;
      setTimeout(resolve, delay);
    });
  }

  // 显示通知
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

  // 更新状态显示
  function updateStatus(message) {
    const statusDiv = document.getElementById("torrent-status");
    if (statusDiv) {
      statusDiv.textContent = message;
      statusDiv.style.display = "block";
    }
  }

  // 隐藏状态显示
  function hideStatus() {
    const statusDiv = document.getElementById("torrent-status");
    if (statusDiv) {
      statusDiv.style.display = "none";
    }
  }

  // 添加复选框到每个条目
  function addCheckboxes() {
    // 尝试多种选择器
    let galleryLinks = [];

    // 尝试1: 带class的链接
    galleryLinks = document.querySelectorAll('a.link-instanted[href*="/g/"]');

    // 尝试2: 所有gallery链接
    if (galleryLinks.length === 0) {
      galleryLinks = document.querySelectorAll(
        'a[href*="/g/"][href*="exhentai.org"]',
      );
    }

    // 尝试3: 任何包含/g/的链接
    if (galleryLinks.length === 0) {
      galleryLinks = document.querySelectorAll('a[href*="/g/"]');

      // 过滤掉非gallery链接
      galleryLinks = Array.from(galleryLinks).filter((link) => {
        const href = link.href;
        return /\/g\/\d+\/[a-f0-9]+\/?/.test(href);
      });
    }

    // 尝试4: 通过glink类查找
    if (galleryLinks.length === 0) {
      const glinks = document.querySelectorAll(".glink");

      galleryLinks = Array.from(glinks)
        .map((glink) => glink.closest("a"))
        .filter((a) => a);
    }

    let addedCount = 0;
    galleryLinks.forEach((link) => {
      // 检查链接本身是否已经处理过
      if (link.hasAttribute("data-torrent-checkbox-added")) {
        return;
      }

      // 查找该条目的torrent链接（在同一行/容器中）
      let torrentUrl = null;
      let parent = link.parentElement;

      // 向上查找包含torrent链接的父容器
      for (let i = 0; i < 5 && parent; i++) {
        const torrentLink = parent.querySelector(
          'a[href*="gallerytorrents.php"]',
        );
        if (torrentLink) {
          torrentUrl = torrentLink.href;
          break;
        }
        parent = parent.parentElement;
      }

      // 创建复选框
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "torrent-checkbox";
      checkbox.dataset.galleryUrl = link.href;

      // 如果找到了torrent链接，直接存储
      if (torrentUrl) {
        checkbox.dataset.torrentUrl = torrentUrl;
      }

      // 创建水平容器 (flex布局)
      const wrapper = document.createElement("div");
      wrapper.className = "torrent-item-wrapper";

      // 将链接从原位置移动到wrapper中
      const originalParent = link.parentNode;
      const nextSibling = link.nextSibling;

      // 先添加复选框，再添加链接（这样复选框在左，链接在右）
      wrapper.appendChild(checkbox);
      wrapper.appendChild(link);

      // 将wrapper插入到原链接的位置
      if (nextSibling) {
        originalParent.insertBefore(wrapper, nextSibling);
      } else {
        originalParent.appendChild(wrapper);
      }

      // 标记已处理
      link.setAttribute("data-torrent-checkbox-added", "true");
      addedCount++;
    });
  }

  // 添加控制按钮
  function addControlButtons() {
    // 检查容器是否已存在
    if (document.getElementById("torrent-control-container")) {
      return;
    }

    // 创建容器
    const container = document.createElement("div");
    container.id = "torrent-control-container";
    container.className = "torrent-control-container";

    // 全选/取消全选按钮
    const selectAllBtn = document.createElement("button");
    selectAllBtn.id = "torrent-select-all-btn";
    selectAllBtn.className = "torrent-select-all";
    selectAllBtn.textContent = "全选";
    selectAllBtn.addEventListener("click", toggleSelectAll);

    // 范围选择按钮
    const rangeSelectBtn = document.createElement("button");
    rangeSelectBtn.id = "torrent-range-select-btn";
    rangeSelectBtn.className = "torrent-range-select";
    rangeSelectBtn.textContent = "范围选择";
    rangeSelectBtn.addEventListener("click", toggleRangeSelect);

    // 下载按钮
    const downloadBtn = document.createElement("button");
    downloadBtn.id = "torrent-download-btn";
    downloadBtn.className = "torrent-download-btn";
    downloadBtn.textContent = "下载";
    downloadBtn.addEventListener("click", startBatchDownload);

    // 将按钮添加到容器中
    container.appendChild(selectAllBtn);
    container.appendChild(rangeSelectBtn);
    container.appendChild(downloadBtn);

    // 将容器添加到页面
    document.body.appendChild(container);

    // 状态显示
    const statusDiv = document.createElement("div");
    statusDiv.id = "torrent-status";
    statusDiv.className = "torrent-status";
    document.body.appendChild(statusDiv);
  }

  // 全选/取消全选
  function toggleSelectAll() {
    const checkboxes = document.querySelectorAll(".torrent-checkbox");
    const allChecked = Array.from(checkboxes).every((cb) => cb.checked);

    checkboxes.forEach((cb) => {
      cb.checked = !allChecked;
    });

    const btn = document.getElementById("torrent-select-all-btn");
    btn.textContent = allChecked ? "全选" : "取消全选";
  }

  // 切换范围选择模式
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

      // 为所有复选框添加范围选择事件
      const checkboxes = document.querySelectorAll(".torrent-checkbox");
      checkboxes.forEach((cb) => {
        cb.addEventListener("click", handleRangeClick);
      });
    } else {
      btn.classList.remove("active");
      btn.textContent = "范围选择";
      showNotification("已退出范围选择模式", "info", 2000);

      // 移除范围选择事件
      const checkboxes = document.querySelectorAll(".torrent-checkbox");
      checkboxes.forEach((cb) => {
        cb.removeEventListener("click", handleRangeClick);
      });
    }
  }

  // 处理范围点击
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
      // 设置起点
      rangeStart = clickedIndex;
      checkbox.checked = true;
      showNotification("起点已设置，请点击终点复选框", "success", 2000);
    } else {
      // 设置终点并选择范围
      const rangeEnd = clickedIndex;
      const start = Math.min(rangeStart, rangeEnd);
      const end = Math.max(rangeStart, rangeEnd);

      // 使用 setTimeout 确保在事件处理完成后再设置状态
      setTimeout(() => {
        for (let i = start; i <= end; i++) {
          if (allCheckboxes[i]) {
            allCheckboxes[i].checked = true;
          }
        }

        // 再次确保起点和终点都被选中
        allCheckboxes[start].checked = true;
        allCheckboxes[end].checked = true;

        showNotification(`已选择 ${end - start + 1} 个项目`, "success", 2000);
      }, 0);

      // 重置范围选择
      rangeStart = null;

      // 自动退出范围选择模式
      setTimeout(() => {
        if (rangeSelectMode) {
          toggleRangeSelect();
        }
      }, 500);
    }
  }

  // 获取torrent列表
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

            // 查找所有torrent条目（每个form代表一个torrent）
            const torrentForms = doc.querySelectorAll(
              'form[action*="gallerytorrents.php"]',
            );
            const torrents = [];

            torrentForms.forEach((form) => {
              const table = form.querySelector("table");
              if (!table) return;

              // 获取种子信息
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

                // 第一行：Posted, Size, Seeds, Peers, Downloads
                if (cells.length >= 6) {
                  // Posted
                  const postedText = cells[0].textContent;
                  if (postedText.includes("Posted:")) {
                    const postedMatch = postedText.match(/Posted:\s*(.+)/);
                    if (postedMatch) posted = postedMatch[1].trim();
                  }

                  // Size
                  const sizeText = cells[1].textContent;
                  if (sizeText.includes("Size:")) {
                    const sizeMatch = sizeText.match(/Size:\s*(.+)/);
                    if (sizeMatch) size = sizeMatch[1].trim();
                  }

                  // Seeds
                  const seedsText = cells[3].textContent;
                  if (seedsText.includes("Seeds:")) {
                    const seedsMatch = seedsText.match(/Seeds:\s*(\d+)/);
                    if (seedsMatch) seeds = parseInt(seedsMatch[1]) || 0;
                  }

                  // Peers
                  const peersText = cells[4].textContent;
                  if (peersText.includes("Peers:")) {
                    const peersMatch = peersText.match(/Peers:\s*(\d+)/);
                    if (peersMatch) peers = parseInt(peersMatch[1]) || 0;
                  }

                  // Downloads
                  const downloadsText = cells[5].textContent;
                  if (downloadsText.includes("Downloads:")) {
                    const downloadsMatch =
                      downloadsText.match(/Downloads:\s*(\d+)/);
                    if (downloadsMatch)
                      downloads = parseInt(downloadsMatch[1]) || 0;
                  }
                }

                // 第二行：Uploader
                if (cells.length >= 2) {
                  const uploaderText = cells[0].textContent;
                  if (uploaderText.includes("Uploader:")) {
                    const uploaderMatch =
                      uploaderText.match(/Uploader:\s*(.+)/);
                    if (uploaderMatch) uploader = uploaderMatch[1].trim();
                  }
                }

                // 下载链接（可能在任何行）
                const link = row.querySelector('a[href*=".torrent"]');
                if (link) {
                  torrentLink = link;
                }
              });

              if (torrentLink) {
                // 从onclick属性提取真实下载链接
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

  // 下载torrent文件（使用浏览器原生下载，自动带cookie）
  function downloadTorrent(url, filename) {
    return new Promise((resolve, reject) => {
      try {
        // 清理文件名中的非法字符
        filename = filename.replace(/[<>:"/\\|?*]/g, "_");
        if (!filename.endsWith(".torrent")) {
          filename += ".torrent";
        }

        // 创建一个隐藏的a标签来触发下载
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.style.display = "none";
        document.body.appendChild(a);

        // 触发点击
        a.click();

        // 延迟后移除元素
        setTimeout(() => {
          document.body.removeChild(a);
          resolve();
        }, 500);
      } catch (error) {
        reject(error);
      }
    });
  }

  // 处理单个gallery的下载
  async function processGallery(galleryUrl, torrentPageUrl, index, total) {
    updateStatus(`[${index}/${total}] 正在处理...`);

    try {
      if (!torrentPageUrl) {
        const errorMsg = `该条目没有torrent下载选项`;
        if (config.silentMode) {
          showNotification(`[${index}/${total}] ${errorMsg}`, "error", 2000);
        } else {
          alert(`${errorMsg}:\n${galleryUrl}`);
        }
        return;
      }

      // 获取torrent列表
      const torrents = await getTorrentList(torrentPageUrl);

      if (torrents.length === 0) {
        const errorMsg = `该条目没有可用的torrent`;
        if (config.silentMode) {
          showNotification(`[${index}/${total}] ${errorMsg}`, "error", 2000);
        } else {
          alert(`${errorMsg}:\n${galleryUrl}`);
        }
        return;
      }

      let selectedTorrent;

      if (torrents.length === 1) {
        // 只有一个torrent，直接下载
        selectedTorrent = torrents[0];
      } else {
        // 多个torrent，让用户选择（始终弹窗）
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

      // 下载选中的torrent
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

  // 开始批量下载
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

    // 禁用下载按钮
    const downloadBtn = document.getElementById("torrent-download-btn");
    downloadBtn.disabled = true;
    downloadBtn.textContent = "下载中...";

    for (let i = 0; i < checkedBoxes.length; i++) {
      const checkbox = checkedBoxes[i];
      const galleryUrl = checkbox.dataset.galleryUrl;
      const torrentUrl = checkbox.dataset.torrentUrl;

      await processGallery(galleryUrl, torrentUrl, i + 1, checkedBoxes.length);

      // 在处理下一个之前延迟
      if (i < checkedBoxes.length - 1) {
        await randomDelay();
      }
    }

    // 恢复下载按钮
    downloadBtn.disabled = false;
    downloadBtn.textContent = "下载";
    hideStatus();

    if (config.silentMode) {
      showNotification("批量下载任务完成！", "success", 3000);
    } else {
      alert("批量下载任务完成！");
    }
  }

  // 初始化
  function init() {
    // 添加控制按钮（立即添加）
    addControlButtons();

    // 延迟添加复选框（处理动态加载的情况）
    setTimeout(() => {
      addCheckboxes();
    }, 1000);

    setTimeout(() => {
      addCheckboxes();
    }, 3000);

    // 监听DOM变化，处理动态加载的内容
    const observer = new MutationObserver((mutations) => {
      // 避免频繁触发
      let shouldUpdate = false;
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            // 元素节点
            if (
              node.querySelector &&
              (node.querySelector('a[href*="/g/"]') ||
                node.matches('a[href*="/g/"]'))
            ) {
              shouldUpdate = true;
            }
          }
        });
      });

      if (shouldUpdate) {
        addCheckboxes();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // 页面加载完成后初始化
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
