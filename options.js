document.addEventListener('DOMContentLoaded', () => {
  const settingsForm = document.getElementById('settingsForm');
  
  // 加载现有设置
  chrome.storage.sync.get(['bskyCredentials', 'twitterUsername'], (data) => {
    if (data.bskyCredentials) {
      document.getElementById('username').value = data.bskyCredentials.username;
      document.getElementById('password').value = data.bskyCredentials.password;
    }
    if (data.twitterUsername) {
      document.getElementById('twitterUsername').value = data.twitterUsername;
    }
  });

  // 保存设置
  settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const credentials = {
      username: document.getElementById('username').value,
      password: document.getElementById('password').value
    };
    
    chrome.storage.sync.set({
      bskyCredentials: credentials,
      twitterUsername: document.getElementById('twitterUsername').value
    });
  });
}); 