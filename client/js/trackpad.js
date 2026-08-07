import { GestureRecognizer } from './gestures.js';

const GESTURE = {
  THREE_SWIPE_UP:    0x01,
  THREE_SWIPE_DOWN:  0x02,
  THREE_SWIPE_LEFT:  0x03,
  THREE_SWIPE_RIGHT: 0x04,
  THREE_TAP:         0x05,
  FOUR_SWIPE_UP:     0x06,
  FOUR_SWIPE_DOWN:   0x07,
  FOUR_SWIPE_LEFT:   0x08,
  FOUR_SWIPE_RIGHT:  0x09,
};

const SWIPE_THRESHOLD = 55;

export class Trackpad {
  constructor(wsManager, containerId, sensitivity = 1.0, scrollSpeed = 1.0) {
    this.ws = wsManager;
    this.container = document.getElementById(containerId);
    this.indicator = document.getElementById('touch-indicator');
    
    this.sensitivity = sensitivity;
    this.scrollSpeed = scrollSpeed;
    
    // 1-finger mouse move accumulator
    this.pendingDx = 0;
    this.pendingDy = 0;
    this.rafId = null;
    
    // 2-finger scroll accumulator
    this.scrollDx = 0;
    this.scrollDy = 0;
    this.scrollRafId = null;
    
    // Multi-finger swipe tracking
    this.multiStartPositions = [];
    this.multiSwipeFired = false;
    this.multiFingerCount = 0;
    
    // ── Drag & Drop state ──
    this.isDragging = false;
    
    this.gesture = new GestureRecognizer(this.container, {
      onTouchStart: this.onTouchStart.bind(this),
      onTouchMove: this.onTouchMove.bind(this),
      onTouchEnd: this.onTouchEnd.bind(this),
      onTap: this.onTap.bind(this),
      onLongPress: this.onLongPress.bind(this)
    });
    
    this.lastTouches = new Map();
    
    // Listen for orientation changes to resize
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.resizeTrackpad(), 200);
    });
    window.addEventListener('resize', () => this.resizeTrackpad());
  }
  
  resizeTrackpad() {
    // Force recalculation of trackpad dimensions on orientation change
    if (this.container) {
      this.container.style.height = '';
      void this.container.offsetHeight; // Trigger reflow
    }
  }
  
  setSensitivity(val) { this.sensitivity = val; }
  setScrollSpeed(val) { this.scrollSpeed = val; }

  onTouchStart(e) {
    if (e.touches.length === 1) {
      this.indicator.style.opacity = 1;
      this.indicator.style.left = e.touches[0].clientX + 'px';
      this.indicator.style.top = e.touches[0].clientY + 'px';
      
      // Show drag indicator if dragging
      if (this.isDragging) {
        this.indicator.classList.add('dragging');
      }
      
      this.createRipple(e.touches[0].clientX, e.touches[0].clientY);
    } else {
      this.indicator.style.opacity = 0;
    }
    
    for (let i = 0; i < e.touches.length; i++) {
      const t = e.touches[i];
      this.lastTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
    
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
        let direction;
        if (Math.abs(avgDx) > Math.abs(avgDy)) {
          direction = avgDx > 0 ? 'right' : 'left';
        } else {
          direction = avgDy > 0 ? 'down' : 'up';
        }
        
        this.multiSwipeFired = true;
        this.fireMultiSwipe(this.multiFingerCount, direction);
      }
      
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
      if (navigator.vibrate) navigator.vibrate([10, 20, 10, 20, 10]); // gesture haptic
      this.showGestureToast(label);
    }
  }
  
  showGestureToast(label) {
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
      this.indicator.classList.remove('dragging');
      
      // If we were dragging and all fingers lifted, end the drag
      if (this.isDragging) {
        this.isDragging = false;
        this.ws.sendDragEnd();
        if (navigator.vibrate) navigator.vibrate(30); // firm release
        this.showGestureToast('Drop');
      }
      
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
      if (navigator.vibrate) navigator.vibrate(8); // tap haptic
    } else if (fingers === 2) {
      this.ws.sendMouseClick(1, 0);       // Right click
      if (navigator.vibrate) navigator.vibrate(8);
    } else if (fingers === 3) {
      this.ws.sendGestureShortcut(GESTURE.THREE_TAP);
      this.showGestureToast('Start Menu');
      if (navigator.vibrate) navigator.vibrate([10, 20, 10, 20, 10]);
    }
  }
  
  onLongPress() {
    if (!this.isDragging) {
      // Start drag mode
      this.isDragging = true;
      this.ws.sendDragStart();
      if (navigator.vibrate) navigator.vibrate([20, 40, 20]); // drag start haptic
      this.indicator.classList.add('dragging');
      this.showGestureToast('Drag');
    }
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
