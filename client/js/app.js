import { Trackpad } from './trackpad.js';
import { Keyboard } from './keyboard.js';

class WSManager {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.url = '';
    this.reconnectAttempts = 0;
    this.callbacks = {};
  }
  
  on(event, cb) {
    this.callbacks[event] = cb;
  }
  
  connect(url) {
    this.url = url;
    try {
      this.ws = new WebSocket(url);
      this.ws.binaryType = "arraybuffer";
      
      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        if (this.callbacks.onConnect) this.callbacks.onConnect();
      };
      
      this.ws.onclose = () => {
        this.isConnected = false;
        if (this.callbacks.onDisconnect) this.callbacks.onDisconnect();
        this.autoReconnect();
      };
      
      this.ws.onerror = (e) => {
        console.error("WS Error", e);
      };
      
      this.ws.onmessage = (e) => {
        if (!(e.data instanceof ArrayBuffer)) return;
        const view = new DataView(e.data);
        const type = view.getUint8(0);
        
        if (type === 0x06) { // Haptic
          const pattern = view.getUint8(1);
          this.haptic(pattern);
        } else if (type === 0x0C) { // Clipboard Pull (server → client)
          const textBytes = new Uint8Array(e.data, 1);
          const text = new TextDecoder().decode(textBytes);
          if (this.callbacks.onClipboard) this.callbacks.onClipboard(text);
        } else if (type === 0x12) { // File Ack
          const status = view.getUint8(1);
          if (this.callbacks.onFileAck) this.callbacks.onFileAck(status);
        } else if (type === 0xFE) { // Connection Ack
          const status = view.getUint8(1);
          if (status === 1) {
            if (this.callbacks.onAuthFailed) this.callbacks.onAuthFailed();
          }
        } else if (type === 0xFF) { // Ping
          // pong
        }
      };
    } catch (e) {
      console.error(e);
      this.autoReconnect();
    }
  }
  
  disconnect() {
    this.isConnected = false;
    this.reconnectAttempts = 999;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.callbacks.onDisconnect) this.callbacks.onDisconnect();
  }
  
  autoReconnect() {
    if (this.reconnectAttempts > 4) return;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 8000);
    this.reconnectAttempts++;
    setTimeout(() => {
      if (!this.isConnected) this.connect(this.url);
    }, delay);
  }
  
  // ── Haptic Feedback Profiles ──
  haptic(pattern) {
    if (!navigator.vibrate) return;
    switch(pattern) {
      case 0: navigator.vibrate(8); break;               // Tap click — ultra-short tick
      case 1: navigator.vibrate(4); break;               // Scroll tick — barely perceptible
      case 2: navigator.vibrate([20, 40, 20]); break;    // Drag start — double pulse
      case 3: navigator.vibrate(30); break;              // Drag end — firm release
      case 4: navigator.vibrate([10, 20, 10, 20, 10]); break; // Gesture fire — triple ripple
      case 5: navigator.vibrate(6); break;               // Key press — light tap
      case 6: navigator.vibrate([50, 100, 50]); break;   // Error/reject — harsh double
      case 7: navigator.vibrate([5, 30, 5, 30, 5]); break;   // Clipboard sync — soft triple
      default: navigator.vibrate(10); break;
    }
  }
  
  // ── Mouse ──
  sendMouseMove(dx, dy) {
    if (!this.isConnected) return;
    const buf = new ArrayBuffer(5);
    const view = new DataView(buf);
    view.setUint8(0, 0x01);
    view.setInt16(1, dx);
    view.setInt16(3, dy);
    this.ws.send(buf);
  }
  
  sendMouseClick(button, action) {
    if (!this.isConnected) return;
    const buf = new ArrayBuffer(3);
    const view = new DataView(buf);
    view.setUint8(0, 0x02);
    view.setUint8(1, button);
    view.setUint8(2, action);
    this.ws.send(buf);
  }
  
  sendMouseScroll(dx, dy) {
    if (!this.isConnected) return;
    const buf = new ArrayBuffer(5);
    const view = new DataView(buf);
    view.setUint8(0, 0x03);
    view.setInt16(1, dx);
    view.setInt16(3, dy);
    this.ws.send(buf);
  }
  
  // ── Keyboard ──
  sendKeyPress(keyType, modifiers) {
    if (!this.isConnected) return;
    const buf = new ArrayBuffer(3);
    const view = new DataView(buf);
    view.setUint8(0, 0x04);
    view.setUint8(1, keyType);
    view.setUint8(2, modifiers);
    this.ws.send(buf);
  }
  
  sendKeyText(text) {
    if (!this.isConnected) return;
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);
    const buf = new ArrayBuffer(1 + bytes.length);
    const view = new Uint8Array(buf);
    view[0] = 0x05;
    view.set(bytes, 1);
    this.ws.send(buf);
  }
  
  // ── Media ──
  sendMediaControl(action) {
    if (!this.isConnected) return;
    const buf = new ArrayBuffer(2);
    const view = new DataView(buf);
    view.setUint8(0, 0x07);
    view.setUint8(1, action);
    this.ws.send(buf);
  }
  
  // ── Gestures ──
  sendGestureShortcut(gestureId) {
    if (!this.isConnected) return;
    const buf = new ArrayBuffer(2);
    const view = new DataView(buf);
    view.setUint8(0, 0x08);
    view.setUint8(1, gestureId);
    this.ws.send(buf);
  }
  
  // ── Drag & Drop ──
  sendDragStart() {
    if (!this.isConnected) return;
    const buf = new ArrayBuffer(1);
    new DataView(buf).setUint8(0, 0x09);
    this.ws.send(buf);
  }
  
  sendDragEnd() {
    if (!this.isConnected) return;
    const buf = new ArrayBuffer(1);
    new DataView(buf).setUint8(0, 0x0A);
    this.ws.send(buf);
  }
  
  // ── Clipboard Sync ──
  sendClipboardPush(text) {
    if (!this.isConnected) return;
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);
    const buf = new ArrayBuffer(1 + bytes.length);
    const view = new Uint8Array(buf);
    view[0] = 0x0B;
    view.set(bytes, 1);
    this.ws.send(buf);
  }
  
  sendClipboardRequest() {
    if (!this.isConnected) return;
    const buf = new ArrayBuffer(1);
    new DataView(buf).setUint8(0, 0x0D);
    this.ws.send(buf);
  }
}

class App {
  constructor() {
    this.ws = new WSManager();
    
    // Screens
    this.connScreen = document.getElementById('connection-screen');
    this.mainApp = document.getElementById('main-app');
    
    // Setup tabs
    this.setupTabs();
    
    // Init components
    this.trackpad = new Trackpad(this.ws, 'trackpad-surface');
    this.keyboard = new Keyboard(this.ws, 'keyboard-layout', 'preview-text');
    
    this.setupEvents();
    this.setupMediaControls();
    this.setupClipboard();
    this.setupFileTransfer();
    
    // Auto-fill IP if possible
    if (window.location.protocol.startsWith('http')) {
      document.getElementById('ip-input').value = window.location.host;
    }
  }
  
  setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const views = document.querySelectorAll('.mode-view');
    const indicator = document.querySelector('.tab-active-indicator');
    
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        indicator.style.transform = `translateX(${index * 100}%)`;
        
        const targetId = tab.dataset.target;
        views.forEach(v => {
          if (v.id === targetId) {
            v.classList.add('active');
          } else {
            v.classList.remove('active');
          }
        });
      });
    });
  }
  
  setupEvents() {
    // Connection UI
    const connectBtn = document.getElementById('connect-btn');
    connectBtn.addEventListener('click', () => {
      let url = document.getElementById('ip-input').value.trim();
      let pin = document.getElementById('pin-input').value.trim();
      
      if (!pin) {
        alert("Please enter the 4-digit PIN shown on your computer.");
        return;
      }
      
      url = url.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '');
      url = url.replace(/\/ws\/?$/, '');
      url = `ws://${url}/ws?pin=${pin}`;
      this.connect(url);
    });
    
    this.ws.on('onConnect', () => {
      this.connScreen.classList.remove('active');
      this.mainApp.classList.add('active');
      document.getElementById('header-status-dot').classList.add('active');
      document.getElementById('header-status-text').textContent = 'Connected';
      document.getElementById('setting-status').textContent = 'Connected';
      document.getElementById('setting-status').className = 'accent-text';
    });
    
    this.ws.on('onDisconnect', () => {
      this.connScreen.classList.add('active');
      this.mainApp.classList.remove('active');
      document.getElementById('connection-status').textContent = 'Disconnected. Trying to reconnect...';
      document.getElementById('header-status-dot').classList.remove('active');
      document.getElementById('header-status-text').textContent = 'Disconnected';
      document.getElementById('setting-status').textContent = 'Disconnected';
      document.getElementById('setting-status').style.color = 'var(--accent-red)';
    });
    
    this.ws.on('onAuthFailed', () => {
      this.ws.disconnect();
      alert("Invalid PIN. Please check the PIN on your computer screen and try again.");
      document.getElementById('connection-status').textContent = 'Invalid PIN';
      document.getElementById('pin-input').value = '';
    });
    
    // Settings
    const settingsBtn = document.getElementById('settings-btn');
    const closeSettings = document.getElementById('close-settings-btn');
    const panel = document.getElementById('settings-panel');
    
    settingsBtn.addEventListener('click', () => panel.classList.add('active'));
    closeSettings.addEventListener('click', () => panel.classList.remove('active'));
    
    document.getElementById('sensitivity').addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      document.getElementById('sensitivity-val').textContent = val.toFixed(1);
      this.trackpad.setSensitivity(val);
    });
    
    document.getElementById('scroll-speed').addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      document.getElementById('scroll-val').textContent = val.toFixed(1);
      this.trackpad.setScrollSpeed(val);
    });
    
    document.getElementById('disconnect-btn').addEventListener('click', () => {
      this.ws.disconnect();
      panel.classList.remove('active');
    });
    
    // Mouse Buttons
    const btnDown = (btn) => { this.ws.sendMouseClick(btn, 1); if(navigator.vibrate) navigator.vibrate(10); };
    const btnUp = (btn) => { this.ws.sendMouseClick(btn, 2); };
    
    const bindMouseBtn = (id, btn) => {
      const el = document.getElementById(id);
      el.addEventListener('touchstart', (e) => { e.preventDefault(); btnDown(btn); });
      el.addEventListener('touchend', (e) => { e.preventDefault(); btnUp(btn); });
    };
    
    bindMouseBtn('btn-left-click', 0);
    bindMouseBtn('btn-middle-click', 2);
    bindMouseBtn('btn-right-click', 1);
  }
  
  // ── Clipboard Sync ──
  setupClipboard() {
    const clipBtn = document.getElementById('clipboard-btn');
    const modal = document.getElementById('clipboard-modal');
    const closeModal = document.getElementById('clipboard-close');
    const textarea = document.getElementById('clipboard-text');
    const pullBtn = document.getElementById('clipboard-pull');
    const pushBtn = document.getElementById('clipboard-push');
    
    if (!clipBtn) return;
    
    // Tap: open clipboard modal
    clipBtn.addEventListener('click', () => {
      modal.classList.add('active');
      // Auto-request laptop clipboard
      this.ws.sendClipboardRequest();
    });
    
    closeModal.addEventListener('click', () => {
      modal.classList.remove('active');
    });
    
    // Pull: request laptop clipboard → fill textarea
    pullBtn.addEventListener('click', () => {
      this.ws.sendClipboardRequest();
      pullBtn.textContent = 'Pulling...';
      setTimeout(() => { pullBtn.textContent = 'Pull from PC'; }, 1500);
    });
    
    // Push: send textarea content to laptop clipboard
    pushBtn.addEventListener('click', () => {
      const text = textarea.value;
      if (text) {
        this.ws.sendClipboardPush(text);
        if (navigator.vibrate) navigator.vibrate([5, 30, 5, 30, 5]);
        pushBtn.textContent = 'Pushed!';
        setTimeout(() => { pushBtn.textContent = 'Push to PC'; }, 1500);
      }
    });
    
    // Handle incoming clipboard text from server
    this.ws.on('onClipboard', (text) => {
      textarea.value = text;
      // Also copy to phone clipboard
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => {});
      }
      if (navigator.vibrate) navigator.vibrate([5, 30, 5, 30, 5]);
    });
  }
  
  // ── File Transfer ──
  setupFileTransfer() {
    const uploadBtn = document.getElementById('upload-btn');
    const fileInput = document.getElementById('file-input');
    const progressOverlay = document.getElementById('upload-progress');
    const progressBar = document.getElementById('upload-bar');
    const progressPercent = document.getElementById('upload-percent');
    
    if (!uploadBtn || !fileInput) return;
    
    this._fileChunks = null;
    this._fileTotalChunks = 0;
    this._fileChunkIndex = 0;
    
    uploadBtn.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file || !this.ws.isConnected) return;
      
      await this.sendFile(file);
      fileInput.value = '';
    });
    
    // Handle file ack from server
    this.ws.on('onFileAck', (status) => {
      if (progressOverlay) {
        progressOverlay.classList.remove('active');
      }
      if (status === 0) {
        this.showToast('File sent successfully!');
      } else {
        this.showToast('File transfer failed.');
      }
    });
  }
  
  async sendFile(file) {
    const CHUNK_SIZE = 32 * 1024; // 32KB
    const progressOverlay = document.getElementById('upload-progress');
    const progressBar = document.getElementById('upload-bar');
    const progressPercent = document.getElementById('upload-percent');
    
    if (progressOverlay) progressOverlay.classList.add('active');
    
    const arrayBuffer = await file.arrayBuffer();
    const fileBytes = new Uint8Array(arrayBuffer);
    const encoder = new TextEncoder();
    const nameBytes = encoder.encode(file.name);
    
    // Send file header: 0x10 + nameLen(uint16) + name + fileSize(uint32)
    const headerBuf = new ArrayBuffer(1 + 2 + nameBytes.length + 4);
    const headerView = new DataView(headerBuf);
    headerView.setUint8(0, 0x10);
    headerView.setUint16(1, nameBytes.length);
    new Uint8Array(headerBuf, 3, nameBytes.length).set(nameBytes);
    headerView.setUint32(3 + nameBytes.length, fileBytes.length);
    this.ws.ws.send(headerBuf);
    
    // Send chunks
    const totalChunks = Math.ceil(fileBytes.length / CHUNK_SIZE);
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, fileBytes.length);
      const chunk = fileBytes.slice(start, end);
      
      const chunkBuf = new ArrayBuffer(1 + 2 + chunk.length);
      const chunkView = new DataView(chunkBuf);
      chunkView.setUint8(0, 0x11);
      chunkView.setUint16(1, i);
      new Uint8Array(chunkBuf, 3).set(chunk);
      this.ws.ws.send(chunkBuf);
      
      // Update progress
      const pct = Math.round(((i + 1) / totalChunks) * 100);
      if (progressBar) progressBar.style.width = pct + '%';
      if (progressPercent) progressPercent.textContent = pct + '%';
      
      // Small delay to avoid flooding
      if (i % 4 === 3) {
        await new Promise(r => setTimeout(r, 10));
      }
    }
  }
  
  showToast(msg) {
    let toast = document.getElementById('app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast';
      toast.style.cssText = `
        position: fixed; top: 60px; left: 50%; transform: translateX(-50%) scale(0.8);
        background: rgba(0, 212, 255, 0.15); backdrop-filter: blur(20px);
        border: 1px solid rgba(0, 212, 255, 0.3); border-radius: 16px;
        padding: 12px 24px; color: #00d4ff; font-size: 0.9rem; font-weight: 600;
        font-family: 'Inter', sans-serif; z-index: 9999; pointer-events: none;
        opacity: 0; transition: opacity 0.3s, transform 0.3s;
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) scale(1)';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) scale(0.8)';
    }, 2000);
  }
  
  setupMediaControls() {
    const bindMedia = (id, action) => {
      const el = document.getElementById(id);
      el.addEventListener('click', () => {
        this.ws.sendMediaControl(action);
        if(navigator.vibrate) navigator.vibrate(15);
      });
    };
    
    bindMedia('btn-vol-up', 0x30);
    bindMedia('btn-vol-down', 0x31);
    bindMedia('btn-mute', 0x32);
    bindMedia('btn-play-pause', 0x33);
    bindMedia('btn-next', 0x34);
    bindMedia('btn-prev', 0x35);
  }
  
  connect(url) {
    document.getElementById('connection-status').textContent = 'Connecting...';
    this.ws.connect(url);
  }
}

// Start app
window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
