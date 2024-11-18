// 格式化时间
function formatTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// 检查当前标签页是否是 Bluesky
async function checkIfBskyTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab.url.includes('bsky.app');
}

// 格式化链接显示
function formatLinks(links) {
  if (!links || links.length === 0) return '';
  
  // 过滤掉 Twitter 内部链接
  const externalLinks = links.filter(link => 
    !link.url.includes('twitter.com') && 
    !link.url.includes('x.com') && 
    !link.url.includes('t.co')
  );
  
  if (externalLinks.length === 0) return '';
  
  return `
    <div class="tweet-links">
      <div class="section-title">链接：</div>
      ${externalLinks.map(link => `
        <a href="${link.url}" target="_blank" class="link-item" title="${link.text}">
          ${new URL(link.url).hostname}
        </a>
      `).join('')}
    </div>
  `;
}

// 渲染待发送推文列表
async function renderPendingTweets() {
  console.log('[TweetSync Popup] 开始渲染推文列表');
  const container = document.getElementById('pendingTweets');
  
  try {
    const data = await chrome.storage.local.get('pendingTweets');
    console.log('[TweetSync Popup] 获取到存储数据:', data);
    
    const pendingTweets = data.pendingTweets || [];
    const isBskyTab = await checkIfBskyTab();
    console.log('[TweetSync Popup] 待发送推文数量:', pendingTweets.length);
    console.log('[TweetSync Popup] 是否在Bluesky页面:', isBskyTab);
    
    if (pendingTweets.length === 0) {
      container.innerHTML = '<div class="no-tweets">暂无待发送的推文</div>';
      return;
    }
    
    container.innerHTML = pendingTweets.map((tweet, index) => `
      <div class="tweet-item">
        <div class="tweet-text">${tweet.text}</div>
        ${tweet.images && tweet.images.length ? `
          <div class="tweet-images">
            ${tweet.images.map(img => `<img src="${img}" alt="Tweet image">`).join('')}
          </div>
        ` : ''}
        ${formatLinks(tweet.links)}
        <div class="tweet-time">添加时间：${formatTime(tweet.timestamp)}</div>
        <div class="action-buttons">
          <button class="post-button" data-index="${index}" ${!isBskyTab ? 'disabled' : ''}>
            发布到 Bluesky
          </button>
          <button class="delete-button" data-index="${index}">删除</button>
        </div>
      </div>
    `).join('');
    
    // 添加事件监听
    container.querySelectorAll('.post-button').forEach(button => {
      button.addEventListener('click', async (e) => {
        const index = parseInt(e.target.dataset.index);
        const tweet = pendingTweets[index];
        
        // 发送消息给当前标签页
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        chrome.tabs.sendMessage(tab.id, {
          type: 'POST_TO_BSKY',
          data: tweet
        });
      });
    });
    
    container.querySelectorAll('.delete-button').forEach(button => {
      button.addEventListener('click', async (e) => {
        const index = parseInt(e.target.dataset.index);
        pendingTweets.splice(index, 1);
        await chrome.storage.local.set({ pendingTweets });
        renderPendingTweets();
      });
    });
    
    console.log('[TweetSync Popup] 渲染完成');
  } catch (error) {
    console.error('[TweetSync Popup] 渲染失败:', error);
    container.innerHTML = '<div class="error">加载失败，请重试</div>';
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  console.log('[TweetSync Popup] DOM加载完成，开始初始化');
  renderPendingTweets();
  
  // 添加清空按钮事件监听
  const clearButton = document.getElementById('clearAllButton');
  clearButton.addEventListener('click', async () => {
    try {
      if (confirm('确定要清空所有待发送的推文吗？此操作不可撤销。')) {
        await chrome.storage.local.set({ pendingTweets: [] });
        console.log('[TweetSync Popup] 所有数据已清空');
        showMessage('数据已清空');
        renderPendingTweets();
      }
    } catch (error) {
      console.error('[TweetSync Popup] 清空数据失败:', error);
      showMessage('清空数据失败，请重试', true);
    }
  });
  
  // 监听存储变化，实时更新列表
  chrome.storage.onChanged.addListener((changes) => {
    console.log('[TweetSync Popup] 存储发生变化:', changes);
    if (changes.pendingTweets) {
      renderPendingTweets();
    }
  });
});

// 添加消息提示函数
function showMessage(message, isError = false) {
  const messageDiv = document.createElement('div');
  messageDiv.style.cssText = `
    position: fixed;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    padding: 8px 16px;
    border-radius: 4px;
    background-color: ${isError ? '#e0245e' : '#17bf63'};
    color: white;
    font-size: 14px;
    z-index: 1000;
    animation: fadeInOut 2s ease-in-out forwards;
  `;
  messageDiv.textContent = message;
  
  document.body.appendChild(messageDiv);
  
  setTimeout(() => {
    document.body.removeChild(messageDiv);
  }, 2000);
}

// 添加消息动画样式
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeInOut {
    0% { opacity: 0; transform: translate(-50%, -10px); }
    10% { opacity: 1; transform: translate(-50%, 0); }
    90% { opacity: 1; transform: translate(-50%, 0); }
    100% { opacity: 0; transform: translate(-50%, -10px); }
  }
`;
document.head.appendChild(style); 