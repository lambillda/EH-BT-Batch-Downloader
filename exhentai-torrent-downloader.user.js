// ==UserScript==
// @name         ExHentai Torrent Batch Downloader
// @namespace    http://lambillda.null/
// @version      1.0
// @description  批量下载ExHentai的BT种子
// @author       Lambillda
// @match        *://exhentai.org/favorites.php
// @match        *://e-hentai.org/favorites.php
// @grant        GM_xmlhttpRequest
// @connect      exhentai.org
// @connect      e-hentai.org
// @connect      *
// ==/UserScript==

(function() {
    'use strict';

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
        .torrent-download-btn {
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 9999;
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
        .torrent-select-all {
            position: fixed;
            top: 10px;
            right: 90px;
            z-index: 9999;
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
    `;

    // 添加样式
    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);

    // 随机延迟函数 (2-4秒)
    function randomDelay() {
        return new Promise(resolve => {
            const delay = Math.random() * 2000 + 2000;
            console.log(`等待 ${(delay / 1000).toFixed(2)} 秒...`);
            setTimeout(resolve, delay);
        });
    }

    // 更新状态显示
    function updateStatus(message) {
        const statusDiv = document.getElementById('torrent-status');
        if (statusDiv) {
            statusDiv.textContent = message;
            statusDiv.style.display = 'block';
            console.log(message);
        }
    }

    // 隐藏状态显示
    function hideStatus() {
        const statusDiv = document.getElementById('torrent-status');
        if (statusDiv) {
            statusDiv.style.display = 'none';
        }
    }

    // 添加复选框到每个条目
    function addCheckboxes() {
        console.log('开始添加复选框...');

        // 尝试多种选择器
        let galleryLinks = [];

        // 尝试1: 带class的链接
        galleryLinks = document.querySelectorAll('a.link-instanted[href*="/g/"]');
        console.log('选择器1 (a.link-instanted[href*="/g/"]):', galleryLinks.length);

        // 尝试2: 所有gallery链接
        if (galleryLinks.length === 0) {
            galleryLinks = document.querySelectorAll('a[href*="/g/"][href*="exhentai.org"]');
            console.log('选择器2 (a[href*="/g/"][href*="exhentai.org"]):', galleryLinks.length);
        }

        // 尝试3: 任何包含/g/的链接
        if (galleryLinks.length === 0) {
            galleryLinks = document.querySelectorAll('a[href*="/g/"]');
            console.log('选择器3 (a[href*="/g/"]):', galleryLinks.length);

            // 过滤掉非gallery链接
            galleryLinks = Array.from(galleryLinks).filter(link => {
                const href = link.href;
                return /\/g\/\d+\/[a-f0-9]+\/?/.test(href);
            });
            console.log('过滤后:', galleryLinks.length);
        }

        // 尝试4: 通过glink类查找
        if (galleryLinks.length === 0) {
            const glinks = document.querySelectorAll('.glink');
            console.log('找到 .glink 元素:', glinks.length);

            galleryLinks = Array.from(glinks).map(glink => glink.closest('a')).filter(a => a);
            console.log('选择器4 (通过.glink找到的链接):', galleryLinks.length);
        }

        let addedCount = 0;
        galleryLinks.forEach(link => {
            // 检查链接本身是否已经处理过
            if (link.hasAttribute('data-torrent-checkbox-added')) {
                return;
            }

            // 创建复选框
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'torrent-checkbox';
            checkbox.dataset.galleryUrl = link.href;

            // 创建水平容器 (flex布局)
            const wrapper = document.createElement('div');
            wrapper.className = 'torrent-item-wrapper';

            // 将链接从原位置移动到wrapper中
            const parent = link.parentNode;
            const nextSibling = link.nextSibling;

            // 先添加复选框，再添加链接（这样复选框在左，链接在右）
            wrapper.appendChild(checkbox);
            wrapper.appendChild(link);

            // 将wrapper插入到原链接的位置
            if (nextSibling) {
                parent.insertBefore(wrapper, nextSibling);
            } else {
                parent.appendChild(wrapper);
            }

            // 标记已处理
            link.setAttribute('data-torrent-checkbox-added', 'true');
            addedCount++;
        });

        console.log(`成功添加 ${addedCount} 个复选框`);

        if (addedCount === 0) {
            console.warn('未找到任何gallery链接，页面结构可能不同');
            console.log('当前页面URL:', window.location.href);
            console.log('页面HTML示例:', document.body.innerHTML.substring(0, 1000));
        }
    }

    // 添加控制按钮
    function addControlButtons() {
        // 检查按钮是否已存在
        if (document.getElementById('torrent-download-btn')) {
            return;
        }

        // 全选/取消全选按钮
        const selectAllBtn = document.createElement('button');
        selectAllBtn.id = 'torrent-select-all-btn';
        selectAllBtn.className = 'torrent-select-all';
        selectAllBtn.textContent = '全选';
        selectAllBtn.addEventListener('click', toggleSelectAll);
        document.body.appendChild(selectAllBtn);

        // 下载按钮
        const downloadBtn = document.createElement('button');
        downloadBtn.id = 'torrent-download-btn';
        downloadBtn.className = 'torrent-download-btn';
        downloadBtn.textContent = '下载';
        downloadBtn.addEventListener('click', startBatchDownload);
        document.body.appendChild(downloadBtn);

        // 状态显示
        const statusDiv = document.createElement('div');
        statusDiv.id = 'torrent-status';
        statusDiv.className = 'torrent-status';
        document.body.appendChild(statusDiv);
    }

    // 全选/取消全选
    function toggleSelectAll() {
        const checkboxes = document.querySelectorAll('.torrent-checkbox');
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);

        checkboxes.forEach(cb => {
            cb.checked = !allChecked;
        });

        const btn = document.getElementById('torrent-select-all-btn');
        btn.textContent = allChecked ? '全选' : '取消全选';
    }

    // 从gallery页面获取torrent页面URL
    async function getTorrentPageUrl(galleryUrl) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: galleryUrl,
                onload: function(response) {
                    try {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(response.responseText, 'text/html');

                        // 查找Torrent Download链接
                        const torrentLink = doc.querySelector('a[onclick*="gallerytorrents.php"]');

                        if (torrentLink) {
                            const onclickAttr = torrentLink.getAttribute('onclick');
                            const urlMatch = onclickAttr.match(/https:\/\/exhentai\.org\/gallerytorrents\.php\?[^']+/);

                            if (urlMatch) {
                                resolve(urlMatch[0]);
                            } else {
                                reject('无法解析torrent页面URL');
                            }
                        } else {
                            reject('该条目没有torrent下载选项');
                        }
                    } catch (error) {
                        reject('解析页面失败: ' + error.message);
                    }
                },
                onerror: function(error) {
                    reject('请求失败: ' + error);
                }
            });
        });
    }

    // 获取torrent列表
    async function getTorrentList(torrentPageUrl) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: torrentPageUrl,
                onload: function(response) {
                    try {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(response.responseText, 'text/html');

                        // 查找所有torrent条目（每个form代表一个torrent）
                        const torrentForms = doc.querySelectorAll('form[action*="gallerytorrents.php"]');
                        const torrents = [];

                        torrentForms.forEach(form => {
                            const table = form.querySelector('table');
                            if (!table) return;

                            // 获取种子信息
                            const rows = table.querySelectorAll('tr');
                            let posted = '', size = '', seeds = 0, peers = 0, downloads = 0, uploader = '';
                            let torrentLink = null;

                            rows.forEach(row => {
                                const cells = row.querySelectorAll('td');

                                // 第一行：Posted, Size, Seeds, Peers, Downloads
                                if (cells.length >= 6) {
                                    // Posted
                                    const postedText = cells[0].textContent;
                                    if (postedText.includes('Posted:')) {
                                        const postedMatch = postedText.match(/Posted:\s*(.+)/);
                                        if (postedMatch) posted = postedMatch[1].trim();
                                    }

                                    // Size
                                    const sizeText = cells[1].textContent;
                                    if (sizeText.includes('Size:')) {
                                        const sizeMatch = sizeText.match(/Size:\s*(.+)/);
                                        if (sizeMatch) size = sizeMatch[1].trim();
                                    }

                                    // Seeds
                                    const seedsText = cells[3].textContent;
                                    if (seedsText.includes('Seeds:')) {
                                        const seedsMatch = seedsText.match(/Seeds:\s*(\d+)/);
                                        if (seedsMatch) seeds = parseInt(seedsMatch[1]) || 0;
                                    }

                                    // Peers
                                    const peersText = cells[4].textContent;
                                    if (peersText.includes('Peers:')) {
                                        const peersMatch = peersText.match(/Peers:\s*(\d+)/);
                                        if (peersMatch) peers = parseInt(peersMatch[1]) || 0;
                                    }

                                    // Downloads
                                    const downloadsText = cells[5].textContent;
                                    if (downloadsText.includes('Downloads:')) {
                                        const downloadsMatch = downloadsText.match(/Downloads:\s*(\d+)/);
                                        if (downloadsMatch) downloads = parseInt(downloadsMatch[1]) || 0;
                                    }
                                }

                                // 第二行：Uploader
                                if (cells.length >= 2) {
                                    const uploaderText = cells[0].textContent;
                                    if (uploaderText.includes('Uploader:')) {
                                        const uploaderMatch = uploaderText.match(/Uploader:\s*(.+)/);
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
                                const onclick = torrentLink.getAttribute('onclick');
                                if (onclick) {
                                    const urlMatch = onclick.match(/document\.location='([^']+)'/);
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
                                    uploader: uploader
                                });
                            }
                        });

                        resolve(torrents);
                    } catch (error) {
                        reject('解析torrent页面失败: ' + error.message);
                    }
                },
                onerror: function(error) {
                    reject('请求失败: ' + error);
                }
            });
        });
    }

    // 下载torrent文件（使用浏览器原生下载，自动带cookie）
    function downloadTorrent(url, filename) {
        return new Promise((resolve, reject) => {
            try {
                // 清理文件名中的非法字符
                filename = filename.replace(/[<>:"/\\|?*]/g, '_');
                if (!filename.endsWith('.torrent')) {
                    filename += '.torrent';
                }

                console.log('开始下载:', filename);
                console.log('下载URL:', url);

                // 创建一个隐藏的a标签来触发下载
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                a.style.display = 'none';
                document.body.appendChild(a);

                // 触发点击
                a.click();

                // 延迟后移除元素
                setTimeout(() => {
                    document.body.removeChild(a);
                    console.log('下载已触发: ' + filename);
                    resolve();
                }, 500);

            } catch (error) {
                console.error('下载失败: ' + filename, error);
                reject(error);
            }
        });
    }

    // 处理单个gallery的下载
    async function processGallery(galleryUrl, index, total) {
        updateStatus(`[${index}/${total}] 正在处理...`);

        try {
            // 获取torrent页面URL
            const torrentPageUrl = await getTorrentPageUrl(galleryUrl);
            await randomDelay();

            // 获取torrent列表
            const torrents = await getTorrentList(torrentPageUrl);

            console.log('找到的torrents:', torrents);

            if (torrents.length === 0) {
                alert(`该条目没有可用的torrent:\n${galleryUrl}`);
                return;
            }

            let selectedTorrent;

            if (torrents.length === 1) {
                // 只有一个torrent，直接下载
                selectedTorrent = torrents[0];
            } else {
                // 多个torrent，让用户选择
                const options = torrents.map((t, idx) => {
                    let info = `${idx + 1}. ${t.name}\n`;
                    info += `   Seeds: ${t.seeds} | Peers: ${t.peers}`;
                    if (t.size) info += ` | Size: ${t.size}`;
                    if (t.uploader) info += `\n   Uploader: ${t.uploader}`;
                    if (t.posted) info += ` | Posted: ${t.posted}`;
                    return info;
                }).join('\n\n');

                const choice = prompt(
                    `该条目有 ${torrents.length} 个torrent，请选择:\n(输入序号，输入0取消)\n\n${options}`,
                    '1'
                );

                if (!choice || choice === '0') {
                    console.log('用户取消下载');
                    return;
                }

                const choiceNum = parseInt(choice);
                if (isNaN(choiceNum) || choiceNum < 1 || choiceNum > torrents.length) {
                    alert('无效的选择');
                    return;
                }

                selectedTorrent = torrents[choiceNum - 1];
            }

            // 下载选中的torrent
            if (selectedTorrent) {
                updateStatus(`[${index}/${total}] 正在下载: ${selectedTorrent.name}`);
                await downloadTorrent(selectedTorrent.url, selectedTorrent.name);
                updateStatus(`[${index}/${total}] 下载完成`);
            }

        } catch (error) {
            console.error('处理失败:', error);
            const errorMsg = typeof error === 'object' ? JSON.stringify(error) : String(error);
            alert(`处理失败:\n${galleryUrl}\n\n错误: ${errorMsg}`);
        }
    }

    // 开始批量下载
    async function startBatchDownload() {
        const checkedBoxes = Array.from(document.querySelectorAll('.torrent-checkbox:checked'));

        if (checkedBoxes.length === 0) {
            alert('请至少选择一个条目');
            return;
        }

        const confirmed = confirm(`确定要下载 ${checkedBoxes.length} 个条目的种子吗？`);
        if (!confirmed) {
            return;
        }

        // 禁用下载按钮
        const downloadBtn = document.getElementById('torrent-download-btn');
        downloadBtn.disabled = true;
        downloadBtn.textContent = '下载中...';

        for (let i = 0; i < checkedBoxes.length; i++) {
            const checkbox = checkedBoxes[i];
            const galleryUrl = checkbox.dataset.galleryUrl;

            await processGallery(galleryUrl, i + 1, checkedBoxes.length);

            // 在处理下一个之前延迟
            if (i < checkedBoxes.length - 1) {
                await randomDelay();
            }
        }

        // 恢复下载按钮
        downloadBtn.disabled = false;
        downloadBtn.textContent = '下载';
        hideStatus();

        alert('批量下载任务完成！');
    }

    // 初始化
    function init() {
        console.log('=== ExHentai Torrent Downloader 初始化 ===');
        console.log('当前URL:', window.location.href);
        console.log('当前路径:', window.location.pathname);

        // 在所有ExHentai页面运行（不限制特定路径）
        addCheckboxes();
        addControlButtons();

        // 延迟再次尝试添加复选框（处理动态加载的情况）
        setTimeout(() => {
            console.log('延迟1秒后再次尝试添加复选框...');
            addCheckboxes();
        }, 1000);

        setTimeout(() => {
            console.log('延迟3秒后再次尝试添加复选框...');
            addCheckboxes();
        }, 3000);

        // 监听DOM变化，处理动态加载的内容
        const observer = new MutationObserver((mutations) => {
            // 避免频繁触发
            let shouldUpdate = false;
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // 元素节点
                        if (node.querySelector && (node.querySelector('a[href*="/g/"]') || node.matches('a[href*="/g/"]'))) {
                            shouldUpdate = true;
                        }
                    }
                });
            });

            if (shouldUpdate) {
                console.log('检测到新的gallery元素，添加复选框...');
                addCheckboxes();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        console.log('=== 初始化完成 ===');
    }

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
