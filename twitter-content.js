// Twitter page content script
console.log('[TweetSync] Twitter content script started initialization');

// Get the current logged-in Twitter username
function getCurrentTwitterUsername() {
  const accountButton = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
  if (accountButton) {
    const usernameSpan = accountButton.querySelector('div:nth-child(2) > div > div:nth-child(2) span');
    if (usernameSpan) {
      const username = usernameSpan.textContent.trim();
      return username.startsWith('@') ? username.substring(1) : username;
    }
  }
  console.error('[TweetSync] Failed to get current username');
  return null;
}

// Listen for DOM changes, add sync button for new tweets
function initTweetObserver() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const tweets = node.querySelectorAll('article[data-testid="tweet"]');
          
          tweets.forEach((tweet) => {
            if (!tweet.querySelector('.sync-to-bsky-button')) {
              const actionBar = tweet.querySelector('[role="group"]');
              if (actionBar) {
                const userLink = tweet.querySelector('a[role="link"][href*="/status/"]');
                const currentUsername = getCurrentTwitterUsername();
                
                if (userLink && currentUsername && 
                    userLink.href.includes(`/${currentUsername}/`)) {
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
}

// Create sync button
function createSyncButton() {
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
      e.preventDefault();
      e.stopPropagation();
      
      const tweetContainer = button.closest('article');
      if (!tweetContainer) {
        console.error('[TweetSync] Failed to find tweet container');
        return;
      }
      
      const tweetData = extractTweetData(tweetContainer);
      
      const storeTweet = async () => {
        const data = await chrome.storage.local.get('pendingTweets');
        const pendingTweets = data.pendingTweets || [];
        pendingTweets.push(tweetData);
        await chrome.storage.local.set({ pendingTweets });
        showToast('Tweet added to sync queue');
      };

      await storeTweet();
    } catch (error) {
      console.error('[TweetSync] Error saving tweet:', error);
      showToast('Save failed, please try again');
      
      if (error.message.includes('Extension context invalidated')) {
        console.log('[TweetSync] Extension context invalidated, will reload page');
        window.location.reload();
      }
    }
  });
  
  return button;
}

// Extract tweet data
function extractTweetData(tweetContainer) {
  const textElement = tweetContainer.querySelector('[data-testid="tweetText"]');
  const text = textElement ? textElement.textContent : '';
  
  const images = Array.from(tweetContainer.querySelectorAll('div[data-testid="tweetPhoto"]>img'))
    .map(img => img.src)
    .filter(src => src && !src.includes('emoji'));
  
  const links = Array.from(tweetContainer.querySelectorAll('div[data-testid="tweetText"] a'))
    .map(a => {
      const fullUrl = a.textContent.trim().replace('…', '');
      return {
        url: fullUrl,
        text: a.textContent.trim()
      };
    });
  
  const tweetLink = tweetContainer.querySelector('a[href*="/status/"]');
  const tweetId = tweetLink ? tweetLink.href.split('/status/')[1].split('?')[0] : '';
  
  // Check if the tweet is in the tweet detail page
  const isDetailPage = window.location.pathname.includes('/status/');
  let replies = [];
  
  if (isDetailPage) {
    replies = extractTweetThread(tweetContainer);
  }
  
  return {
    text,
    images,
    tweetId,
    links,
    replies,  // Add replies array
    timestamp: new Date().toISOString()
  };
}

// Add Twitter thread extraction function
function extractTweetThread(tweetContainer) {
  const currentUsername = getCurrentTwitterUsername();
  if (!currentUsername) {
    console.error('[TweetSync] Failed to get current username, skipping Twitter thread extraction');
    return [];
  }
  
  // Wait for replies to load
  // await waitForReplies(tweetContainer);
  
  // Get all replies
  const replies = [];
  
  const mainTweetDiv = tweetContainer.closest('section[role="region"] div[data-testid="cellInnerDiv"]');
  
  const allCellDivs = Array.from(document.querySelectorAll('section[role="region"] div[data-testid="cellInnerDiv"]'));
  
  const mainTweetIndex = allCellDivs.indexOf(mainTweetDiv);
  
  const replyDivs = allCellDivs.slice(mainTweetIndex + 1).filter(div => div.querySelector('article[data-testid="tweet"]'));
  
  const replyContainers = replyDivs.map(div => div.querySelector('article[data-testid="tweet"]'));
  // Sort replies in the order they appear on the page
  replyContainers.sort((a, b) => {
    const posA = a.getBoundingClientRect().top;
    const posB = b.getBoundingClientRect().top;
    return posA - posB;
  });
  
  // Loop through all replies
  for (const replyContainer of replyContainers) {
    // Skip the original tweet
    if (replyContainer === tweetContainer) continue;
    
    // Check if it's a reply from the current user
    const userLink = replyContainer.querySelector('a[role="link"][href*="/status/"]');
    if (userLink && userLink.href.includes(`/${currentUsername}/`)) {
      // Recursively extract reply data
      const replyData = {
        text: replyContainer.querySelector('[data-testid="tweetText"]')?.textContent || '',
        images: Array.from(replyContainer.querySelectorAll('div[data-testid="tweetPhoto"]>img'))
          .map(img => img.src)
          .filter(src => src && !src.includes('emoji')),
        links: Array.from(replyContainer.querySelectorAll('div[data-testid="tweetText"] a'))
          .map(a => ({
            url: a.textContent.trim().replace('…', ''),
            text: a.textContent.trim()
          })),
        tweetId: userLink.href.split('/status/')[1].split('?')[0],
        timestamp: new Date().toISOString(),
        // replies: await extractTweetThread(replyContainer)  // Recursively get replies of replies
      };
      
      replies.push(replyData);
    }
  }
  
  return replies;
}

// Add function to wait for replies to load
async function waitForReplies(tweetContainer, timeout = 5000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    const checkReplies = () => {
      // Check if there are reply containers
      const mainTweetDiv = tweetContainer.closest('div[data-testid="cellInnerDiv"]');
      const allCellDivs = Array.from(document.querySelectorAll('div[data-testid="cellInnerDiv"]'));
      const mainTweetIndex = allCellDivs.indexOf(mainTweetDiv);
      const replyDivs = allCellDivs.slice(mainTweetIndex + 1);
      const hasReplies = replyDivs.some(div => div.querySelector('article[data-testid="tweet"]'));
      
      if (hasReplies || Date.now() - startTime >= timeout) {
        resolve();
        return;
      }
      
      requestAnimationFrame(checkReplies);
    };
    
    checkReplies();
  });
}

// Show toast message
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

// Initialize
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

initTweetObserver();
console.log('[TweetSync] Twitter content script initialization completed'); 