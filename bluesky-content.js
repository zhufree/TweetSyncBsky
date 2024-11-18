// Bluesky页面内容脚本
console.log('[TweetSync] Bluesky 内容脚本开始初始化');

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'POST_TO_BSKY') {
    console.log('[TweetSync] 收到发布请求:', request.data);
    postToBsky(request.data);
  }
});

// 在 Bluesky 发帖
async function postToBsky(tweetData) {
  try {
    console.log('[TweetSync] 开始发布到 Bluesky');
    
    if (!window.location.pathname.startsWith('/')) {
      showToast('请先回到 Bluesky 主页再发布', true);
      return;
    }
    
    const composeButtons = document.querySelectorAll('button[tabindex="0"]');
    const composeButton = composeButtons[composeButtons.length - 1];
    if (!composeButton) {
      throw new Error('未找到发帖按钮');
    }
    composeButton.click();
    
    const editorInput = await waitForElement('div[contenteditable="true"]');
    if (!editorInput) {
      throw new Error('未找到编辑器输入框');
    }
    
    editorInput.focus();
    
    // 处理文本中的链接
    let processedText = tweetData.text;
    if (tweetData.links && tweetData.links.length > 0) {
      // 按链接文本长度降序排序，避免短链接文本替换长链接文本的一部分
      const sortedLinks = [...tweetData.links].sort((a, b) => b.text.length - a.text.length);
      
      sortedLinks.forEach(link => {
        // 创建一个正则表达式来匹配链接文本
        const linkText = link.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(linkText, 'g');
        processedText = processedText.replace(regex, link.url);
      });
    }
    
    // 按换行符分割文本，并用 p 标签包装每个段落
    const paragraphs = processedText.split('\n').map(text => {
      // 如果段落为空，返回一个空的 p 标签以保持换行
      return text.trim() === '' ? '<p><br></p>' : `<p>${text}</p>`;
    });
    
    // 将所有段落拼接在一起
    editorInput.innerHTML = paragraphs.join('');
    
    editorInput.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
    }));
    
    if (tweetData.images && tweetData.images.length > 0) {
      console.log('[TweetSync] 准备添加图片');
      
      const imageLoadPromises = tweetData.images.map(imgUrl => {
        return fetch(imgUrl)
          .then(response => response.blob())
          .then(blob => {
            return new File([blob], `image_${Date.now()}.jpg`, { type: 'image/jpeg' });
          });
      });
      
      const imageFiles = await Promise.all(imageLoadPromises);
      
      const dataTransfer = new DataTransfer();
      imageFiles.forEach(file => {
        dataTransfer.items.add(file);
      });
      
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer
      });
      
      editorInput.dispatchEvent(new DragEvent('dragenter', { bubbles: true }));
      editorInput.dispatchEvent(new DragEvent('dragover', { bubbles: true }));
      editorInput.dispatchEvent(dropEvent);
      
      console.log('[TweetSync] 图片拖拽事件已触发');
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const publishButton = await waitForElement('[aria-label="Publish post"]');
    console.log('[TweetSync] 找到发布按钮:', publishButton);
    
    if (publishButton.disabled || publishButton.getAttribute('aria-disabled') === 'true') {
      throw new Error('发布按钮当前不可用');
    }
    
    showToast('请检查内容并点击发布按钮', true);
    
  } catch (error) {
    console.error('[TweetSync] 发布失败:', error);
    showToast('发布失败: ' + error.message, true);
  }
}

// 等待元素出现
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const checkElement = () => {
      const element = document.querySelector(selector);
      if (element && element.offsetParent !== null) {
        if (window.getComputedStyle(element).display !== 'none' && 
            window.getComputedStyle(element).visibility !== 'hidden') {
          console.log(`[TweetSync] 元素已找到并可见: ${selector}`);
          resolve(element);
          return;
        }
      }
      
      if (Date.now() - startTime >= timeout) {
        reject(new Error(`等待元素 ${selector} 超时`));
        return;
      }
      
      requestAnimationFrame(checkElement);
    };
    
    checkElement();
  });
}

// 显示提示消息
function showToast(message, isImportant = false) {
  const toast = document.createElement('div');
  toast.className = isImportant ? 'bsky-sync-toast important' : 'bsky-sync-toast';
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
    
    .bsky-sync-toast.important {
      bottom: 40px;
      right: 50%;
      transform: translateX(50%);
      background: rgba(29, 161, 242, 0.9);
      font-size: 14px;
      font-weight: 500;
      padding: 12px 24px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    
    @keyframes fadeInOut {
      0% { opacity: 0; transform: translateY(20px) translateX(${isImportant ? '50%' : '0'}); }
      10% { opacity: 1; transform: translateY(0) translateX(${isImportant ? '50%' : '0'}); }
      90% { opacity: 1; transform: translateY(0) translateX(${isImportant ? '50%' : '0'}); }
      100% { opacity: 0; transform: translateY(-20px) translateX(${isImportant ? '50%' : '0'}); }
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(toast);
  setTimeout(() => {
    document.body.removeChild(toast);
  }, 2000);
}

console.log('[TweetSync] Bluesky 内容脚本初始化完成'); 