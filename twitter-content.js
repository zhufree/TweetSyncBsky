// Twitter页面内容脚本
console.log('[TweetSync] Twitter 内容脚本开始初始化');

// 获取当前登录的Twitter用户名
function getCurrentTwitterUsername() {
  const accountButton = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
  if (accountButton) {
    const usernameSpan = accountButton.querySelector('div:nth-child(2) > div > div:nth-child(2) span');
    if (usernameSpan) {
      const username = usernameSpan.textContent.trim();
      return username.startsWith('@') ? username.substring(1) : username;
    }
  }
  console.log('[TweetSync] 无法获取当前用户名');
  return null;
}

// 监听DOM变化，为新的推文添加同步按钮
function initTweetObserver() {
  console.log('[TweetSync] 初始化DOM观察器');
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const tweets = node.querySelectorAll('article[data-testid="tweet"]');
          console.log('[TweetSync] 发现新推文数量:', tweets.length);
          
          tweets.forEach((tweet) => {
            if (!tweet.querySelector('.sync-to-bsky-button')) {
              const actionBar = tweet.querySelector('[role="group"]');
              if (actionBar) {
                const userLink = tweet.querySelector('a[role="link"][href*="/status/"]');
                const currentUsername = getCurrentTwitterUsername();
                
                console.log('[TweetSync] 检查推文作者:', {
                  tweetUrl: userLink?.href,
                  currentUsername: currentUsername
                });
                
                if (userLink && currentUsername && 
                    userLink.href.includes(`/${currentUsername}/`)) {
                  console.log('[TweetSync] 为自己的推文添加同步按钮');
                  actionBar.appendChild(createSyncButton());
                }
              }
            }
          });
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  console.log('[TweetSync] DOM观察器已启动');
}

// 创建同步按钮
function createSyncButton() {
  console.log('[TweetSync] 创建同步按钮');
  const button = document.createElement('div');
  button.className = 'sync-to-bsky-button';
  button.innerHTML = `
    <div role="button" tabindex="0" style="display: inline-flex; align-items: center; padding: 0 12px;">
      <svg viewBox="0 0 24 24" width="18" height="18" style="fill: rgb(83, 100, 113);">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14v-4H8l4-4 4 4h-3v4h-2z"/>
      </svg>
      <span style="margin-left: 4px; font-size: 13px; color: rgb(83, 100, 113);">Sync</span>
    </div>
  `;
  
  button.addEventListener('click', async (e) => {
    try {
      console.log('[TweetSync] 同步按钮被点击');
      e.preventDefault();
      e.stopPropagation();
      
      const tweetContainer = button.closest('article');
      if (!tweetContainer) {
        console.error('[TweetSync] 无法找到推文容器');
        return;
      }
      
      const tweetData = extractTweetData(tweetContainer);
      console.log('[TweetSync] 提取的推文数据:', tweetData);
      
      const storeTweet = async () => {
        const data = await chrome.storage.local.get('pendingTweets');
        const pendingTweets = data.pendingTweets || [];
        pendingTweets.push(tweetData);
        await chrome.storage.local.set({ pendingTweets });
        console.log('[TweetSync] 推文已保存到待发送队列');
        console.log('[TweetSync] 当前存储的所有推文:', pendingTweets);
        showToast('推文已添加到同步队列');
      };

      await storeTweet();
    } catch (error) {
      console.error('[TweetSync] 保存推文时出错:', error);
      showToast('保存失败，请重试');
      
      if (error.message.includes('Extension context invalidated')) {
        console.log('[TweetSync] 扩展上下文失效，将刷新页面');
        window.location.reload();
      }
    }
  });
  
  return button;
}

// 提取推文数据
function extractTweetData(tweetContainer) {
  console.log('[TweetSync] 开始提取推文数据');
  
  const textElement = tweetContainer.querySelector('[data-testid="tweetText"]');
  const text = textElement ? textElement.textContent : '';
  console.log('[TweetSync] 提取的文本内容:', text);
  
  const images = Array.from(tweetContainer.querySelectorAll('div[data-testid="tweetPhoto"]>img'))
    .map(img => img.src)
    .filter(src => src && !src.includes('emoji'));
  console.log('[TweetSync] 提取的图片URL:', images);

  // 获取链接和对应的文本
  const links = Array.from(tweetContainer.querySelectorAll('div[data-testid="tweetText"] a'))
    .map(a => {
      // 组合完整 URL
      const fullUrl = a.textContent.trim().replace('…', '');
      return {
        url: fullUrl,
        text: a.textContent.trim()
      };
    });
  console.log('[TweetSync] 提取的链接:', links);
  
  const tweetLink = tweetContainer.querySelector('a[href*="/status/"]');
  const tweetId = tweetLink ? tweetLink.href.split('/status/')[1].split('?')[0] : '';
  console.log('[TweetSync] 提取的推文ID:', tweetId);
  
  return {
    text,
    images,
    tweetId,
    links,
    timestamp: new Date().toISOString()
  };
}

// 显示提示消息
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'bsky-sync-toast';
  toast.textContent = message;
  
  const style = document.createElement('style');
  style.textContent = `
    .bsky-sync-toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 10px 20px;
      border-radius: 4px;
      z-index: 10000;
      animation: fadeInOut 2s ease-in-out;
    }
    
    @keyframes fadeInOut {
      0% { opacity: 0; transform: translateY(20px); }
      10% { opacity: 1; transform: translateY(0); }
      90% { opacity: 1; transform: translateY(0); }
      100% { opacity: 0; transform: translateY(-20px); }
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(toast);
  setTimeout(() => {
    document.body.removeChild(toast);
  }, 2000);
}

// 初始化
const style = document.createElement('style');
style.textContent = `
  .sync-to-bsky-button {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    transition: all 0.2s;
  }
  .sync-to-bsky-button:hover {
    opacity: 0.7;
  }
`;
document.head.appendChild(style);
console.log('[TweetSync] 添加了按钮样式');

initTweetObserver();
console.log('[TweetSync] Twitter 内容脚本初始化完成'); 