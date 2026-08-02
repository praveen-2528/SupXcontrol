import { GestureRecognizer } from './gestures.js';

// Gesture shortcut IDs (must match server)
const GESTURE = {
  THREE_SWIPE_UP:    0x01,  // Task View (Win+Tab)
  THREE_SWIPE_DOWN:  0x02,  // Show Desktop (Win+D)
  THREE_SWIPE_LEFT:  0x03,  // Switch app left (Alt+Shift+Tab)
  THREE_SWIPE_RIGHT: 0x04,  // Switch app right (Alt+Tab)
  THREE_TAP:         0x05,  // Start Menu (Win key)
  FOUR_SWIPE_UP:     0x06,  // Volume Up
  FOUR_SWIPE_DOWN:   0x07,  // Volume Down
  FOUR_SWIPE_LEFT:   0x08,  // Media Previous
  FOUR_SWIPE_RIGHT:  0x09,  // Media Next
};

const SWIPE_THRESHOLD = 55;  // px of movement before swipe fires

export class Trackpad {
  constructor(wsManager, containerId, sensitivity = 1.0, scrollSpeed = 1.0) {
    this.ws = wsManager;
    this.container = document.getElementById(containerId);
    this.indicator = document.getElementById('touch-indicator');
    
    this.sensitivity = sensitivity;
    this.scrollSpeed = scrollSpeed;
    
    // 1-finger mouse move accumulator (60fps throttled)
    this.pendingDx = 0;
    this.pendingDy = 0;
    this.rafId = null;
    
    // 2-finger scroll accumulator (60fps throttled)
    this.scrollDx = 0;
    this.scrollDy = 0;
    this.scrollRafId = null;
    
    // Multi-finger swipe tracking
    this.multiStartPositions = [];   // [{x, y}, ...] at touchstart
    this.multiSwipeFired = false;    // Only fire swipe once per gesture
    this.multiFingerCount = 0;       // How many fingers started
    
    this.gesture = new GestureRecognizer(this.container, {
      onTouchStart: this.onTouchStart.bind(this),
      onTouchMove: this.onTouchMove.bind(this),
      onTouchEnd: this.onTouchEnd.bind(this),
      onTap: this.onTap.bind(this),
      onLongPress: this.onLongPress.bind(this)
    });
    
    this.lastTouches = new Map();
  }
  
  setSensitivity(val) { this.sensitivity = val; }
  setScrollSpeed(val) { this.scrollSpeed = val; }

  onTouchStart(e) {
    if (e.touches.length === 1) {
      this.indicator.style.opacity = 1;
      this.indicator.style.left = e.touches[0].clientX + 'px';
      this.indicator.style.top = e.touches[0].clientY + 'px';
      this.createRipple(e.touches[0].clientX, e.touches[0].clientY);
    } else {
      this.indicator.style.opacity = 0;
    }
    
    // Store per-finger last position for delta calculations
    for (let i = 0; i < e.touches.length; i++) {
      const t = e.touches[i];
      this.lastTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
    
    // Track multi-finger swipe start positions (3+ fingers)
    if (e.touches.length >= 3) {
      this.multiStartPositions = [];
      for (let i = 0; i < e.touches.length; i++) {
        this.multiStartPositions.push({
          x: e.touches[i].clientX,
          y: e.touches[i].clientY
        });
      }
      this.multiFingerCount = e.touches.length;
      this.multiSwipeFired = false;
    }
  }

  onTouchMove(e) {
    const fingerCount = e.touches.length;
    
    if (fingerCount === 1) {
      // ── 1 Finger: Mouse Move ──
      const t = e.touches[0];
      const last = this.lastTouches.get(t.identifier);
      if (last) {
        this.pendingDx += (t.clientX - last.x) * this.sensitivity;
        this.pendingDy += (t.clientY - last.y) * this.sensitivity;
        
        last.x = t.clientX;
        last.y = t.clientY;
        
        this.indicator.style.left = t.clientX + 'px';
        this.indicator.style.top = t.clientY + 'px';
        
        if (!this.rafId) {
          this.rafId = requestAnimationFrame(() => {
            if (this.ws.isConnected) {
              this.ws.sendMouseMove(Math.round(this.pendingDx), Math.round(this.pendingDy));
            }
            this.pendingDx = 0;
            this.pendingDy = 0;
            this.rafId = null;
          });
        }
      }
      
    } else if (fingerCount === 2) {
      // ── 2 Fingers: Scroll ──
      let avgDx = 0, avgDy = 0;
      for (let i = 0; i < 2; i++) {
        const t = e.touches[i];
        const last = this.lastTouches.get(t.identifier);
        if (last) {
          avgDx += (t.clientX - last.x);
          avgDy += (t.clientY - last.y);
          last.x = t.clientX;
          last.y = t.clientY;
        }
      }
      avgDx /= 2;
      avgDy /= 2;
      
      this.scrollDx += avgDx * this.scrollSpeed;
      this.scrollDy += avgDy * this.scrollSpeed;
      
      if (!this.scrollRafId) {
        this.scrollRafId = requestAnimationFrame(() => {
          if (this.ws.isConnected && (Math.abs(this.scrollDx) > 1 || Math.abs(this.scrollDy) > 1)) {
            this.ws.sendMouseScroll(Math.round(-this.scrollDx), Math.round(-this.scrollDy));
          }
          this.scrollDx = 0;
          this.scrollDy = 0;
          this.scrollRafId = null;
        });
      }
      
    } else if (fingerCount >= 3 && !this.multiSwipeFired && this.multiStartPositions.length > 0) {
      // ── 3/4 Fingers: Swipe Detection ──
      // Calculate average movement from start positions
      let totalDx = 0, totalDy = 0;
      const count = Math.min(fingerCount, this.multiStartPositions.length);
      
      for (let i = 0; i < count; i++) {
        totalDx += e.touches[i].clientX - this.multiStartPositions[i].x;
        totalDy += e.touches[i].clientY - this.multiStartPositions[i].y;
      }
      const avgDx = totalDx / count;
      const avgDy = totalDy / count;
      
      const distance = Math.sqrt(avgDx * avgDx + avgDy * avgDy);
      
      if (distance > SWIPE_THRESHOLD) {
        // Determine swipe direction
        let direction;
        if (Math.abs(avgDx) > Math.abs(avgDy)) {
          direction = avgDx > 0 ? 'right' : 'left';
        } else {
          direction = avgDy > 0 ? 'down' : 'up';
        }
        
        this.multiSwipeFired = true;
        this.fireMultiSwipe(this.multiFingerCount, direction);
      }
      
      // Update last positions for any continued tracking
      for (let i = 0; i < fingerCount; i++) {
        const t = e.touches[i];
        const last = this.lastTouches.get(t.identifier);
        if (last) {
          last.x = t.clientX;
          last.y = t.clientY;
        }
      }
    }
  }

  fireMultiSwipe(fingers, direction) {
    let gestureId = null;
    let label = '';
    
    if (fingers === 3) {
      switch (direction) {
        case 'up':    gestureId = GESTURE.THREE_SWIPE_UP;    label = 'Task View'; break;
        case 'down':  gestureId = GESTURE.THREE_SWIPE_DOWN;  label = 'Show Desktop'; break;
        case 'left':  gestureId = GESTURE.THREE_SWIPE_LEFT;  label = 'Prev App'; break;
        case 'right': gestureId = GESTURE.THREE_SWIPE_RIGHT; label = 'Next App'; break;
      }
    } else if (fingers >= 4) {
      switch (direction) {
        case 'up':    gestureId = GESTURE.FOUR_SWIPE_UP;     label = 'Vol Up'; break;
        case 'down':  gestureId = GESTURE.FOUR_SWIPE_DOWN;   label = 'Vol Down'; break;
        case 'left':  gestureId = GESTURE.FOUR_SWIPE_LEFT;   label = 'Media Prev'; break;
        case 'right': gestureId = GESTURE.FOUR_SWIPE_RIGHT;  label = 'Media Next'; break;
      }
    }
    
    if (gestureId !== null) {
      this.ws.sendGestureShortcut(gestureId);
      if (navigator.vibrate) navigator.vibrate([15, 30, 15]);
      
      // Show a brief toast indicator
      this.showGestureToast(label);
    }
  }
  
  showGestureToast(label) {
    // Create floating toast to show what gesture fired
    let toast = document.getElementById('gesture-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'gesture-toast';
      toast.style.cssText = `
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) scale(0.8);
        background: rgba(0, 212, 255, 0.15); backdrop-filter: blur(20px);
        border: 1px solid rgba(0, 212, 255, 0.3); border-radius: 16px;
        padding: 12px 24px; color: #00d4ff; font-size: 1rem; font-weight: 600;
        font-family: 'Inter', sans-serif; z-index: 9999; pointer-events: none;
        opacity: 0; transition: opacity 0.2s, transform 0.2s;
      `;
      document.body.appendChild(toast);
    }
    
    toast.textContent = label;
    toast.style.opacity = '1';
    toast.style.transform = 'translate(-50%, -50%) scale(1)';
    
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translate(-50%, -50%) scale(0.8)';
    }, 600);
  }

  onTouchEnd(e) {
    if (e.touches.length === 0) {
      this.indicator.style.opacity = 0;
      // Reset multi-finger state when all fingers lifted
      this.multiSwipeFired = false;
      this.multiStartPositions = [];
      this.multiFingerCount = 0;
    }
    for (let i = 0; i < e.changedTouches.length; i++) {
      this.lastTouches.delete(e.changedTouches[i].identifier);
    }
  }

  onTap(fingers) {
    if (fingers === 1) {
      this.ws.sendMouseClick(0, 0);       // Left click
    } else if (fingers === 2) {
      this.ws.sendMouseClick(1, 0);       // Right click
    } else if (fingers === 3) {
      // 3-finger tap = Windows Start Menu
      this.ws.sendGestureShortcut(GESTURE.THREE_TAP);
      this.showGestureToast('Start Menu');
      if (navigator.vibrate) navigator.vibrate([15, 30, 15]);
    }
  }
  
  onLongPress() {
    this.ws.sendMouseClick(1, 0); // Right click on long press
    if (navigator.vibrate) navigator.vibrate(50);
  }

  createRipple(x, y) {
    const ripple = document.createElement('div');
    ripple.className = 'ripple';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    ripple.style.width = '20px';
    ripple.style.height = '20px';
    this.container.appendChild(ripple);
    setTimeout(() => {
      if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
    }, 400);
  }
}
