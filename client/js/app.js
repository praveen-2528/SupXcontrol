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
        } else if (type === 0xFF) { // Ping
          // Could send pong if needed
        }
      };
    } catch (e) {
      console.error(e);
      this.autoReconnect();
    }
  }
  
  disconnect() {
    this.isConnected = false;
    this.reconnectAttempts = 999; // Disable auto-reconnect
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
  
  haptic(pattern) {
    if (!navigator.vibrate) return;
    switch(pattern) {
      case 0: navigator.vibrate(10); break;
      case 1: navigator.vibrate(25); break;
      case 2: navigator.vibrate(50); break;
      case 3: navigator.vibrate([10, 50, 10]); break;
    }
  }
  
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
  
  sendMediaControl(action) {
    if (!this.isConnected) return;
    const buf = new ArrayBuffer(2);
    const view = new DataView(buf);
    view.setUint8(0, 0x07);
    view.setUint8(1, action);
    this.ws.send(buf);
  }
  
  sendGestureShortcut(gestureId) {
    if (!this.isConnected) return;
    const buf = new ArrayBuffer(2);
    const view = new DataView(buf);
    view.setUint8(0, 0x08);
    view.setUint8(1, gestureId);
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
    
    // Auto-connect if possible
    if (window.location.protocol.startsWith('http')) {
      const wsUrl = `ws://${window.location.host}/ws`;
      document.getElementById('ip-input').value = window.location.host;
      this.connect(wsUrl);
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
      // Strip protocols if user typed them
      url = url.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '');
      // Remove trailing /ws if present
      url = url.replace(/\/ws\/?$/, '');
      // Build proper ws URL
      url = `ws://${url}/ws`;
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
