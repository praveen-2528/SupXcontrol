export class GestureRecognizer {
  constructor(element, callbacks) {
    this.el = element;
    this.cb = callbacks;
    this.touches = new Map();
    this.tapTimeout = null;
    this.longPressTimeout = null;
    this.lastTapTime = 0;
    
    this.el.addEventListener('touchstart', this.onTouchStart.bind(this), {passive: false});
    this.el.addEventListener('touchmove', this.onTouchMove.bind(this), {passive: false});
    this.el.addEventListener('touchend', this.onTouchEnd.bind(this), {passive: false});
    this.el.addEventListener('touchcancel', this.onTouchCancel.bind(this), {passive: false});
  }

  onTouchStart(e) {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      this.touches.set(t.identifier, {
        startX: t.clientX, startY: t.clientY,
        lastX: t.clientX, lastY: t.clientY,
        startTime: Date.now(),
        moved: false
      });
    }

    if (e.touches.length === 1) {
      this.longPressTimeout = setTimeout(() => {
        if (!this.touches.get(e.touches[0].identifier).moved) {
          if (this.cb.onLongPress) this.cb.onLongPress(e.touches[0]);
        }
      }, 500);
    }
    
    if (this.cb.onTouchStart) this.cb.onTouchStart(e);
  }

  onTouchMove(e) {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const data = this.touches.get(t.identifier);
      if (data) {
        if (Math.hypot(t.clientX - data.startX, t.clientY - data.startY) > 10) {
          data.moved = true;
          clearTimeout(this.longPressTimeout);
        }
        data.lastX = t.clientX;
        data.lastY = t.clientY;
      }
    }
    if (this.cb.onTouchMove) this.cb.onTouchMove(e);
  }

  onTouchEnd(e) {
    e.preventDefault();
    clearTimeout(this.longPressTimeout);
    
    const touchCount = e.touches.length + e.changedTouches.length;
    
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const data = this.touches.get(t.identifier);
      if (data) {
        const duration = Date.now() - data.startTime;
        if (!data.moved && duration < 300) {
          if (this.cb.onTap) this.cb.onTap(touchCount);
        }
        this.touches.delete(t.identifier);
      }
    }
    
    if (this.cb.onTouchEnd) this.cb.onTouchEnd(e);
  }

  onTouchCancel(e) {
    e.preventDefault();
    clearTimeout(this.longPressTimeout);
    for (let i = 0; i < e.changedTouches.length; i++) {
      this.touches.delete(e.changedTouches[i].identifier);
    }
    if (this.cb.onTouchEnd) this.cb.onTouchEnd(e); // treat cancel as end for UI cleanup
  }
}
