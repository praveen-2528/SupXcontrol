export class Keyboard {
  constructor(wsManager, containerId, previewId) {
    this.ws = wsManager;
    this.container = document.getElementById(containerId);
    this.preview = document.getElementById(previewId);
    this.canvas = document.getElementById('glide-canvas');
    this.ctx = this.canvas.getContext('2d');
    
    this.mode = 'lower'; // lower, upper, numbers
    this.shiftActive = false;
    
    this.ROWS_LOWER = [
      ['q','w','e','r','t','y','u','i','o','p'],
      ['a','s','d','f','g','h','j','k','l'],
      ['SHIFT','z','x','c','v','b','n','m','BACKSPACE'],
      ['NUMBERS','SPACE','ENTER']
    ];
    this.ROWS_UPPER = [
      ['Q','W','E','R','T','Y','U','I','O','P'],
      ['A','S','D','F','G','H','J','K','L'],
      ['SHIFT','Z','X','C','V','B','N','M','BACKSPACE'],
      ['NUMBERS','SPACE','ENTER']
    ];
    this.ROWS_NUMBERS = [
      ['1','2','3','4','5','6','7','8','9','0'],
      ['-','/',':',';','(',')','$','&','@','"'],
      ['LOWER','.',',','?','!','\'','BACKSPACE'],
      ['LOWER','SPACE','ENTER']
    ];
    
    this.glidePath = [];
    this.isGliding = false;
    
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    
    this.render();
    
    this.container.addEventListener('touchstart', this.onTouchStart.bind(this), {passive: false});
    this.container.addEventListener('touchmove', this.onTouchMove.bind(this), {passive: false});
    this.container.addEventListener('touchend', this.onTouchEnd.bind(this), {passive: false});
  }
  
  resizeCanvas() {
    this.canvas.width = this.container.clientWidth;
    this.canvas.height = this.container.clientHeight;
  }
  
  render() {
    // Remove only keyboard rows, keeping canvas intact
    this.container.querySelectorAll('.kb-row').forEach(r => r.remove());
    
    let rows = this.ROWS_LOWER;
    if (this.mode === 'upper') rows = this.ROWS_UPPER;
    else if (this.mode === 'numbers') rows = this.ROWS_NUMBERS;
    
    rows.forEach(row => {
      const rowEl = document.createElement('div');
      rowEl.className = 'kb-row';
      row.forEach(key => {
        const keyEl = document.createElement('div');
        keyEl.className = 'kb-key';
        keyEl.dataset.key = key;
        
        if (key === 'SHIFT') {
          keyEl.classList.add('special');
          keyEl.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
          if (this.shiftActive) keyEl.classList.add('active-toggle');
        } else if (key === 'BACKSPACE') {
          keyEl.classList.add('special');
          keyEl.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM18 9l-6 6M12 9l6 6"/></svg>';
        } else if (key === 'ENTER') {
          keyEl.classList.add('special');
          keyEl.textContent = 'return';
        } else if (key === 'SPACE') {
          keyEl.classList.add('space');
          keyEl.textContent = 'space';
        } else if (key === 'NUMBERS') {
          keyEl.classList.add('special');
          keyEl.textContent = '123';
        } else if (key === 'LOWER') {
          keyEl.classList.add('special');
          keyEl.textContent = 'ABC';
        } else {
          keyEl.textContent = key;
        }
        
        rowEl.appendChild(keyEl);
      });
      this.container.appendChild(rowEl);
    });
  }

  handleKey(key) {
    if (navigator.vibrate) navigator.vibrate(15);
    
    if (key === 'SHIFT') {
      this.shiftActive = !this.shiftActive;
      this.mode = this.shiftActive ? 'upper' : 'lower';
      this.render();
      return;
    }
    if (key === 'NUMBERS') {
      this.mode = 'numbers';
      this.shiftActive = false;
      this.render();
      return;
    }
    if (key === 'LOWER') {
      this.mode = 'lower';
      this.shiftActive = false;
      this.render();
      return;
    }
    
    if (key === 'BACKSPACE') {
      this.ws.sendKeyPress(0x02, 0); // Backspace
      this.preview.textContent = this.preview.textContent.slice(0, -1);
    } else if (key === 'ENTER') {
      this.ws.sendKeyPress(0x01, 0); // Enter
      this.preview.textContent = '';
    } else if (key === 'SPACE') {
      this.ws.sendKeyText(' ');
      this.preview.textContent += ' ';
    } else {
      this.ws.sendKeyText(key);
      this.preview.textContent += key;
    }
    
    // Auto unshift after char
    if (this.shiftActive && key !== 'SHIFT' && key !== 'BACKSPACE') {
      this.shiftActive = false;
      this.mode = 'lower';
      this.render();
    }
  }

  getNearestKey(x, y) {
    const keys = Array.from(this.container.querySelectorAll('.kb-key:not(.special):not(.space)'));
    let nearest = null;
    let minDist = Infinity;
    
    for (const key of keys) {
      const rect = key.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = Math.hypot(x - cx, y - cy);
      
      if (dist < 35 && dist < minDist) {
        minDist = dist;
        nearest = key.dataset.key;
      }
    }
    return nearest;
  }

  onTouchStart(e) {
    e.preventDefault();
    const t = e.touches[0];
    this.isGliding = false;
    this.glidePath = [{x: t.clientX, y: t.clientY}];
    
    // Find touched key for visual active state
    const el = document.elementFromPoint(t.clientX, t.clientY);
    if (el && el.closest('.kb-key')) {
      el.closest('.kb-key').classList.add('active');
    }
  }

  onTouchMove(e) {
    e.preventDefault();
    const t = e.touches[0];
    const dx = t.clientX - this.glidePath[0].x;
    const dy = t.clientY - this.glidePath[0].y;
    
    if (Math.hypot(dx, dy) > 20) {
      this.isGliding = true;
    }
    
    if (this.isGliding) {
      this.glidePath.push({x: t.clientX, y: t.clientY});
      this.drawGlideTrail();
      
      // Clear active states
      this.container.querySelectorAll('.kb-key.active').forEach(el => el.classList.remove('active'));
    }
  }

  onTouchEnd(e) {
    e.preventDefault();
    
    this.container.querySelectorAll('.kb-key.active').forEach(el => el.classList.remove('active'));
    
    if (this.isGliding && this.glidePath.length > 5) {
      // Process glide
      let word = '';
      let lastKey = null;
      
      for (let i = 0; i < this.glidePath.length; i += 3) { // Sample points
        const p = this.glidePath[i];
        const key = this.getNearestKey(p.x, p.y);
        if (key && key !== lastKey) {
          word += key;
          lastKey = key;
        }
      }
      
      if (word.length > 0) {
        // Very basic glide typing (just sends the raw string)
        this.ws.sendKeyText(word + ' ');
        this.preview.textContent += word + ' ';
        if (navigator.vibrate) navigator.vibrate([10, 30, 10]);
      }
      
      // Fade out trail
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    } else {
      // Tap
      const t = e.changedTouches[0];
      const el = document.elementFromPoint(t.clientX, t.clientY);
      const keyEl = el ? el.closest('.kb-key') : null;
      if (keyEl) {
        this.handleKey(keyEl.dataset.key);
      }
    }
    
    this.isGliding = false;
    this.glidePath = [];
  }

  drawGlideTrail() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.glidePath.length < 2) return;
    
    const rect = this.canvas.getBoundingClientRect();
    
    this.ctx.beginPath();
    this.ctx.moveTo(this.glidePath[0].x - rect.left, this.glidePath[0].y - rect.top);
    
    for (let i = 1; i < this.glidePath.length; i++) {
      this.ctx.lineTo(this.glidePath[i].x - rect.left, this.glidePath[i].y - rect.top);
    }
    
    this.ctx.strokeStyle = '#00d4ff';
    this.ctx.lineWidth = 4;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.shadowBlur = 10;
    this.ctx.shadowColor = '#00d4ff';
    this.ctx.stroke();
  }
}
