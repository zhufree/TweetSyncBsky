// 在 background.js 中添加安装和启动日志
console.log('[TweetSync Background] Service Worker 启动');

chrome.runtime.onInstalled.addListener(() => {
  console.log('[TweetSync Background] 扩展已安装/更新');
  // 初始化设置
  chrome.storage.sync.set({
    isEnabled: false,
    bskyCredentials: null,
    twitterUsername: ''
  }, () => {
    console.log('[TweetSync Background] 初始化设置完成');
  });
});

// 处理来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SYNC_TWEET') {
    handleTweetSync(request.data)
      .then(response => sendResponse({ success: true, data: response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // 保持消息通道开启以进行异步响应
  }
  if (request.type === 'DELETE_PUBLISHED_TWEET') {
    deletePublishedTweet(request.data);
  }
});

// 处理推文同步
async function handleTweetSync(tweetData) {
  try {
    // 获取 Bluesky 认证信息
    const { bskyCredentials } = await chrome.storage.sync.get('bskyCredentials');
    if (!bskyCredentials) {
      throw new Error('请先在设置中配置 Bluesky 账号信息');
    }

    // TODO: 实现 Bluesky API 调用
    // 1. 使用认证信息登录
    // 2. 上传图片（如果有）
    // 3. 发布帖子
    
    // 临时返回成功消息
    return { message: '同步成功' };
  } catch (error) {
    console.error('同步失败:', error);
    throw error;
  }
}

// 删除已发布的推文
async function deletePublishedTweet(data) {
  try {
    const { pendingTweets } = await chrome.storage.local.get('pendingTweets');
    if (!pendingTweets) return;
    
    // 找到并删除已发布的推文
    const index = pendingTweets.findIndex(tweet => tweet.tweetId === data.tweetId);
    if (index !== -1) {
      pendingTweets.splice(index, 1);
      await chrome.storage.local.set({ pendingTweets });
      console.log('[TweetSync Background] 已删除发布的推文:', data.tweetId);
    }
  } catch (error) {
    console.error('[TweetSync Background] 删除已发布推文失败:', error);
  }
}

// 更新扩展图标状态
function updateExtensionIcon(isEnabled) {
  chrome.action.setIcon({
    path: isEnabled ? 'icons/icon-enabled.png' : 'icons/icon-disabled.png'
  });
} 