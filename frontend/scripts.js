const $ = (id) => document.getElementById(id);
const chatPanel = $('chatPanel');
const sendBtn = $('sendBtn');
const stopBtn = $('stopBtn');
const userInput = $('userInput');
const modelSelect = $('modelSelect');
const sessionSelect = $('chatSessionsSelect');
const deleteChatBtn = $('deleteChatBtn');
const fileInput = $('fileInput');
const attachmentList = $('attachmentList');

let attachments = [];
let currentAbortController = null;

const CHAT_STORAGE_KEY = 'ollama-chat-history';
let chatSessions = {}, currentSessionId = '', lastPrompt = '';
let apiBaseURL = $('api-url').value || 'http://localhost:8081';

function generateId() {
  return 'session-' + Date.now();
}

function loadSessions() {
  const saved = localStorage.getItem(CHAT_STORAGE_KEY);
  chatSessions = saved ? JSON.parse(saved) : {};
  const keys = Object.keys(chatSessions);
  currentSessionId = keys.length ? keys[0] : generateId();
  if (!chatSessions[currentSessionId]) chatSessions[currentSessionId] = [];
}

function saveSessions() {
  localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatSessions));
}

function renderSessions() {
  sessionSelect.innerHTML = '';
  Object.keys(chatSessions).forEach((id) => {
    const opt = document.createElement('option');
    opt.value = id;
    const firstMsg = chatSessions[id][0]?.text?.slice(0, 20) || 'New Chat';
    opt.textContent = `[${id.split('-')[1]}] ${firstMsg}`;
    sessionSelect.appendChild(opt);
  });
  sessionSelect.value = currentSessionId;
}

function renderChat() {
  chatPanel.innerHTML = '';
  (chatSessions[currentSessionId] || []).forEach((msg) => {
    addBubble(msg.sender, msg.text, msg.type, msg.time, msg.model, false);
  });
  chatPanel.scrollTop = chatPanel.scrollHeight;
}

function addBubble(sender, text, type, time, model, scroll = true) {
  const div = document.createElement('div');
  div.className = `bubble ${type}`;
  div.textContent = text;
  chatPanel.appendChild(div);
  if (scroll) chatPanel.scrollTop = chatPanel.scrollHeight;
  if (type) {
    chatSessions[currentSessionId].push({ sender, text, type, time, model });
    saveSessions();
  }
}

function sendMsg(text) {
  if (!text && !attachments.length) return;

  const model = modelSelect.value;
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const contextText = attachments
    .map((a) => `---\nFile: ${a.name}\n${a.text.slice(0, 4000)}\n---`)
    .join('\n\n');

  const fullPrompt = contextText ? `${contextText}\n\nUser: ${text}` : text;

  lastPrompt = text;

  addBubble('You', text, 'user', time, model);
  if (attachments.length > 0) {
    addBubble('🗂 Files', attachments.map((a) => a.name).join(', '), 'user', time, model, false);
  }

  userInput.value = '';
  sendBtn.disabled = true;
  fileInput.value = '';
  attachmentList.innerHTML = '';
  attachments = [];

  userInput.disabled = true;
  stopBtn.disabled = false;

  addBubble(model, 'Typing...', 'model', time, model);

  currentAbortController = new AbortController();
  const signal = currentAbortController.signal;

  fetch(`${apiBaseURL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: fullPrompt }),
    signal,
  })
    .then((r) => r.json())
    .then((data) => {
      chatPanel.lastChild.remove();
      addBubble(model, data.response || '[No answer]', 'model', new Date().toLocaleTimeString(), model);
    })
    .catch((err) => {
      chatPanel.lastChild.remove();
      if (err.name === 'AbortError') {
        addBubble('System', '❌ Query stopped.', 'model', new Date().toLocaleTimeString());
      } else {
        addBubble(model, '[Network error]', 'model', new Date().toLocaleTimeString(), model);
      }
    })
    .finally(() => {
      stopBtn.disabled = true;
      sendBtn.disabled = false;
      userInput.disabled = false;
      currentAbortController = null;
    });
}

// Theme
function applyTheme(theme) {
  document.body.className = '';
  if (theme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.classList.add(prefersDark ? 'dark' : 'light');
  } else {
    document.body.classList.add(theme);
  }
}

// Load models
async function fetchModels() {
  try {
    const res = await fetch(`${apiBaseURL}/models`);
    const data = await res.json();
    modelSelect.innerHTML = '';
    data.models.forEach((m) => {
      const o = document.createElement('option');
      o.value = m;
      o.textContent = m;
      modelSelect.appendChild(o);
    });
    $('connectionStatus').textContent = '✅ Models Loaded';
    modelSelect.disabled = false;
    sendBtn.disabled = false;
  } catch {
    $('connectionStatus').textContent = '❌ Error contacting backend.';
    modelSelect.innerHTML = '';
    modelSelect.disabled = true;
    sendBtn.disabled = true;
  }
}

// Attachments
fileInput.addEventListener('change', async () => {
  attachments = [];
  attachmentList.innerHTML = "";
  for (const file of fileInput.files) {
    if (file.type.startsWith('text') || file.type === '') {
      const text = await file.text();
      attachments.push({ name: file.name, text });
      let li = document.createElement('li');
      li.textContent = file.name;
      attachmentList.appendChild(li);
    }
  }
});

// Handle drag-and-drop files
chatPanel.addEventListener('dragover', e => { e.preventDefault(); });
chatPanel.addEventListener('drop', async e => {
  e.preventDefault();
  for (const file of e.dataTransfer.files) {
    // Text files: read in browser, PDF/others: skip or parse
    if (file.type.startsWith('text') || file.type === '') {
      const text = await file.text();
      attachments.push({ name: file.name, text });
      const li = document.createElement('li');
      li.textContent = file.name;
      attachmentList.appendChild(li);
    }
  }
});

marked.setOptions({
  highlight: function(code, lang) {
    return hljs.highlightAuto(code, [lang]).value;
  }
});
function addBubble(sender, text, type, time, model, scroll = true) {
  const div = document.createElement('div');
  div.className = `bubble ${type}`;
  // Markdown + syntax highlight
  div.innerHTML = marked.parse(text || '');
  chatPanel.appendChild(div);
  if (scroll) chatPanel.scrollTop = chatPanel.scrollHeight;
  // highlight blocks
  div.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
  if (type) {
    chatSessions[currentSessionId].push({ sender, text, type, time, model });
    saveSessions();
  }
}


// Init
document.addEventListener('DOMContentLoaded', () => {
  loadSessions(); renderSessions(); renderChat(); fetchModels();

  const storedTheme = localStorage.getItem('ollama-theme') || 'auto';
  applyTheme(storedTheme);
  $('sidebar-theme').value = storedTheme;

  $('sidebar-theme').onchange = (e) => {
    const theme = e.target.value;
    applyTheme(theme);
    localStorage.setItem('ollama-theme', theme);
  };

  $('reset-settings').onclick = () => {
    $('api-url').value = 'http://localhost:8081';
    localStorage.removeItem('ollama-theme');
    applyTheme('light');
  };

  $('save-settings').onclick = () => {
    apiBaseURL = $('api-url').value;
    localStorage.setItem('ollama-theme', $('sidebar-theme').value);
    fetchModels();
  };

  $('newChatBtn').onclick = () => {
    const newId = generateId();
    chatSessions[newId] = [];
    currentSessionId = newId;
    saveSessions();
    renderSessions();
    renderChat();
  };

  sessionSelect.onchange = () => {
    currentSessionId = sessionSelect.value;
    renderChat();
  };

  deleteChatBtn.onclick = () => {
    if (!currentSessionId) return;
    if (!confirm("Delete this chat?")) return;
    delete chatSessions[currentSessionId];
    const keys = Object.keys(chatSessions);
    currentSessionId = keys.length ? keys[0] : generateId();
    if (!chatSessions[currentSessionId]) chatSessions[currentSessionId] = [];
    saveSessions();
    renderSessions();
    renderChat();
  };

  sendBtn.onclick = () => sendMsg(userInput.value.trim());
  stopBtn.onclick = () => {
    if (currentAbortController) {
      currentAbortController.abort();
      stopBtn.disabled = true;
    }
  };

  userInput.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendBtn.click();
    }
  };
});
