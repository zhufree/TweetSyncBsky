// Bluesky页面内容脚本
console.log('[TweetSync] Bluesky 内容脚本开始初始化');

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'POST_TO_BSKY') {
    postToBsky(request.data);
  }
});

// 在 Bluesky 发帖
async function postToBsky(tweetData) {
  try {
    if (!window.location.pathname.startsWith('/')) {
      showToast('Please return to Bluesky homepage to post', true);
      return;
    }

    if (tweetData.replies && tweetData.replies.length > 0) {
      await publishThread(tweetData);
    } else {
      await publishSinglePost(tweetData);
    }
    
    // 监听发布按钮的点击
    const publishButton = await waitForElement('button[data-testid="composerPublishBtn"]');
    if (!publishButton) {
      throw new Error('Failed to find post button');
    }

    // 添加一次性点击监听器
    publishButton.addEventListener('click', async () => {
      // 等待一小段时间确保发布完成
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 通知 popup 删除已发布的数据
      chrome.runtime.sendMessage({
        type: 'DELETE_PUBLISHED_TWEET',
        data: { tweetId: tweetData.tweetId }
      });
      
      showToast('Post successful', true);
    }, { once: true }); // 使用 once: true 确保监听器只触发一次
    
  } catch (error) {
    console.error('[TweetSync] Post failed:', error);
    showToast(`Post failed: ${error.message}`, true);
  }
}

// 发布单条推文
async function publishSinglePost(tweetData) {
  // 点击发帖按钮打开编辑器
  const composeButtons = document.querySelectorAll('button[tabindex="0"]');
  const composeButton = composeButtons[composeButtons.length - 1];
  if (!composeButton) {
    throw new Error('Failed to find post button');
  }
  composeButton.click();
  
  // 等待编辑器出现并填充内容
  const editor = await waitForElement('div[contenteditable="true"]');
  await fillPostContent(tweetData, editor);
}

// 发布推特串
async function publishThread(tweetData) {
  try {
    showToast('Starting to publish thread', true);
    
    await publishSinglePost(tweetData);
    
    if (tweetData.replies && tweetData.replies.length > 0) {
      let currentEditorCount = document.querySelectorAll('div[contenteditable="true"]').length;
      
      for (const reply of tweetData.replies) {
        const currentEditor = document.querySelectorAll('div[contenteditable="true"]')[currentEditorCount - 1];
        
        currentEditor.focus();
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const addPostButton = await waitForElement('button[aria-label="Add new post"]', 3000);
        if (!addPostButton) {
          throw new Error('Failed to find add new post button');
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
        addPostButton.click();
        
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const newEditor = await waitForNewEditor(currentEditorCount);
        if (!newEditor) {
          throw new Error('Failed to find new editor');
        }
        
        currentEditorCount++;
        
        await fillPostContent(reply, newEditor);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    showToast('Content filled, please check and publish', true);
    
  } catch (error) {
    console.error('[TweetSync] Post failed:', error);
    showToast(`Post failed: ${error.message}`, true);
  }
}

// 添加等待新编辑器的函数
function waitForNewEditor(previousCount, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const checkNewEditor = () => {
      const editors = document.querySelectorAll('div[contenteditable="true"]');
      if (editors.length > previousCount) {
        // 找到新出现的编辑器
        const newEditor = editors[editors.length - 1];
        if (newEditor.offsetParent !== null && 
            window.getComputedStyle(newEditor).display !== 'none' && 
            window.getComputedStyle(newEditor).visibility !== 'hidden') {
          console.log('[TweetSync] 找到新的编辑器');
          resolve(newEditor);
          return;
        }
      }
      
      if (Date.now() - startTime >= timeout) {
        reject(new Error('等待新编辑器超时'));
        return;
      }
      
      requestAnimationFrame(checkNewEditor);
    };
    
    checkNewEditor();
  });
}


// 修改填充内容的函数
async function fillPostContent(postData, editorInput) {
  if (!editorInput) {
    throw new Error('未找到编辑器输入框');
  }
  
  console.log('[TweetSync] 准备填充内容到编辑器:', editorInput);
  
  editorInput.focus();
  await new Promise(resolve => setTimeout(resolve, 200));
  
  // 处理文本中的链接
  let processedText = postData.text;
  if (postData.links && postData.links.length > 0) {
    const sortedLinks = [...postData.links].sort((a, b) => b.text.length - a.text.length);
    
    sortedLinks.forEach(link => {
      const linkText = link.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(linkText, 'g');
      processedText = processedText.replace(regex, link.url);
    });
  }
  
  // 按换行符分割文本，并用 p 标签包装每个段落
  const paragraphs = processedText.split('\n').map(text => {
    return text.trim() === '' ? '<p><br></p>' : `<p>${text}</p>`;
  });
  
  editorInput.innerHTML = paragraphs.join('');
  console.log('[TweetSync] 文本内容已填充');
  
  // 触发输入事件
  editorInput.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    cancelable: true,
  }));
  
  // 等待内容更新
  await new Promise(resolve => setTimeout(resolve, 200));
  
  // 处理图片
  if (postData.images && postData.images.length > 0) {
    console.log('[TweetSync] 准备添加图片');
    
    const imageLoadPromises = postData.images.map(imgUrl => {
      return fetch(imgUrl)
        .then(response => response.blob())
        .then(blob => {
          return new File([blob], `image_${Date.now()}.jpg`, { type: 'image/jpeg' });
        });
    });
    
    const imageFiles = await Promise.all(imageLoadPromises);
    console.log('[TweetSync] 图片已加载完成');
    
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
    await new Promise(resolve => setTimeout(resolve, 100));
    editorInput.dispatchEvent(new DragEvent('dragover', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 100));
    editorInput.dispatchEvent(dropEvent);
    
    console.log('[TweetSync] 图片拖拽事件已触发');
    
    // 等待图片上传完成
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  // 等待所有内容加载完成
  await new Promise(resolve => setTimeout(resolve, 200));
  
  // 滚动到底部
  let scrollContainer = editorInput;
  for (let i = 0; i < 6; i++) {
    scrollContainer = scrollContainer.parentElement;
  }
  
  if (scrollContainer) {
    console.log('[TweetSync] 找到滚动容器，滚动到底部');
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
  } else {
    console.log('[TweetSync] 未找到滚动容器');
  }
  
  // 再等待一下确保滚动完成
  await new Promise(resolve => setTimeout(resolve, 200));
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

// 添加等待多个元素的函数
function waitForElements(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const checkElements = () => {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        const visibleElements = Array.from(elements).filter(element => 
          element.offsetParent !== null &&
          window.getComputedStyle(element).display !== 'none' &&
          window.getComputedStyle(element).visibility !== 'hidden'
        );
        
        if (visibleElements.length > 0) {
          console.log(`[TweetSync] 找到 ${visibleElements.length} 个可见元素: ${selector}`);
          resolve(visibleElements);
          return;
        }
      }
      
      if (Date.now() - startTime >= timeout) {
        reject(new Error(`等待元素 ${selector} 超时`));
        return;
      }
      
      requestAnimationFrame(checkElements);
    };
    
    checkElements();
  });
}

console.log('[TweetSync] Bluesky 内容脚本初始化完成'); 