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
      <div class="section-title">Links:</div>
      ${externalLinks.map(link => {
        try {
          // 确保 URL 是完整的
          const url = link.url.startsWith('http') ? link.url : `https://${link.url}`;
          const hostname = new URL(url).hostname;
          return `
            <a href="${url}" target="_blank" class="link-item" title="${link.text}">
              ${hostname}
            </a>
          `;
        } catch (error) {
          console.error('[TweetSync Popup] 解析链接失败:', link, error);
          // 如果 URL 解析失败，直接显示原始文本
          return `
            <a href="#" class="link-item invalid" title="Invalid link">
              ${link.text}
            </a>
          `;
        }
      }).join('')}
    </div>
  `;
}

// 修改渲染回复的函数，修正路径构建
function formatReplies(replies, depth = 0, tweetIndex) {
  if (!replies || replies.length === 0) return '';
  
  const indent = depth * 20; // 每层缩进20px
  
  return `
    <div class="tweet-replies" style="margin-left: ${indent}px;">
      ${replies.map((reply, replyIndex) => `
        <div class="reply-item" data-tweet-index="${tweetIndex}" data-reply-index="${replyIndex}">
          <div class="reply-indicator">└</div>
          <div class="tweet-text">${reply.text}</div>
          ${reply.images && reply.images.length ? `
            <div class="tweet-images">
              ${reply.images.map(img => `<img src="${img}" alt="Tweet image">`).join('')}
            </div>
          ` : ''}
          ${formatLinks(reply.links)}
          <div class="tweet-time">Added at: ${formatTime(reply.timestamp)}</div>
          <button class="delete-reply-button" data-tweet-index="${tweetIndex}" data-reply-index="${replyIndex}">
            Delete Reply
          </button>
          ${formatReplies(reply.replies, depth + 1, tweetIndex)}
        </div>
      `).join('')}
    </div>
  `;
}

// 修改删除回复的函数
async function deleteReply(tweetIndex, replyIndex) {
  try {
    const data = await chrome.storage.local.get('pendingTweets');
    if (!data || !data.pendingTweets) {
      console.error('[TweetSync Popup] 无法获取存储的推文数据');
      showMessage('Failed to delete: Cannot get data', true);
      return;
    }

    const pendingTweets = data.pendingTweets;
    const tweet = pendingTweets[tweetIndex];
    
    if (!tweet || !tweet.replies) {
      console.error('[TweetSync Popup] 无法找到指定的推文或回复');
      showMessage('Failed to delete: Reply not found', true);
      return;
    }

    // 删除指定的回复
    tweet.replies.splice(replyIndex, 1);
    
    // 如果删除后没有回复了，清空回复数组
    if (tweet.replies.length === 0) {
      delete tweet.replies;
    }
    
    await chrome.storage.local.set({ pendingTweets });
    console.log('[TweetSync Popup] 回复已删除，更新后的数据:', pendingTweets);
    showMessage('Reply deleted');
    renderPendingTweets();
  } catch (error) {
    console.error('[TweetSync Popup] 删除回复失败:', error);
    showMessage('Failed to delete, please retry', true);
  }
}

// 修改渲染推文列表函数中的相关部分
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
      container.innerHTML = '<div class="no-tweets">No tweets to send</div>';
      return;
    }
    
    container.innerHTML = pendingTweets.map((tweet, index) => `
      <div class="tweet-item ${tweet.replies?.length ? 'has-replies' : ''}">
        <div class="tweet-text">${tweet.text}</div>
        ${tweet.images && tweet.images.length ? `
          <div class="tweet-images">
            ${tweet.images.map(img => `<img src="${img}" alt="Tweet image">`).join('')}
          </div>
        ` : ''}
        ${formatLinks(tweet.links)}
        <div class="tweet-time">Added at: ${formatTime(tweet.timestamp)}</div>
        ${formatReplies(tweet.replies, 0, index)}
        <div class="action-buttons">
          <button class="post-button" data-index="${index}" ${!isBskyTab ? 'disabled' : ''}>
            ${tweet.replies?.length ? 'Post Thread' : 'Post to Bluesky'}
          </button>
          <button class="delete-button" data-index="${index}">Delete</button>
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
        
        // 关闭 popup 窗口
        window.close();
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
    
    // 修改删除回复按钮的事件监听
    container.querySelectorAll('.delete-reply-button').forEach(button => {
      button.addEventListener('click', async (e) => {
        e.stopPropagation();
        const tweetIndex = parseInt(e.target.dataset.tweetIndex);
        const replyIndex = parseInt(e.target.dataset.replyIndex);
        
        if (confirm('Are you sure to delete this reply? This action cannot be undone.')) {
          await deleteReply(tweetIndex, replyIndex);
        }
      });
    });
  } catch (error) {
    console.error('[TweetSync Popup] 渲染失败:', error);
    container.innerHTML = '<div class="error">Failed to load, please retry</div>';
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
      if (confirm('Are you sure to clear all pending tweets? This action cannot be undone.')) {
        await chrome.storage.local.set({ pendingTweets: [] });
        showMessage('Data cleared');
        renderPendingTweets();
      }
    } catch (error) {
      console.error('[TweetSync Popup] 清空数据失败:', error);
      showMessage('Failed to clear data, please retry', true);
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

// 添加新的样式
const additionalStyle = document.createElement('style');
additionalStyle.textContent = `
  .tweet-item.has-replies {
    border-left: 3px solid #1da1f2;
    padding-left: 12px;
  }
  
  .tweet-replies {
    margin-top: 8px;
    border-left: 2px solid #cfd9de;
  }
  
  .reply-item {
    position: relative;
    margin: 8px 0;
    padding: 8px;
    background: #f7f9f9;
    border-radius: 4px;
  }
  
  .reply-indicator {
    position: absolute;
    left: -12px;
    color: #536471;
    font-size: 12px;
  }
  
  .post-button[disabled] {
    background-color: #ccc;
    cursor: not-allowed;
  }
  
  .delete-reply-button {
    background-color: #f4212e;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 12px;
    cursor: pointer;
    margin-top: 8px;
    opacity: 0.8;
  }
  
  .delete-reply-button:hover {
    opacity: 1;
  }
`;
document.head.appendChild(additionalStyle);
  