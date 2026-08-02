# 🎮 SuperXontrol

**Turn your phone into a wireless trackpad + keyboard for your laptop.**

No bending over. No wires. Just open your phone's browser and take control.

---

## ⚡ Quick Start

### Option 1: One-Click (Windows)
```
Double-click start.bat
```

### Option 2: Manual
```bash
# Install dependencies
pip install -r server/requirements.txt

# Start the server
cd server
python -m uvicorn main:app --host 0.0.0.0 --port 8765
```

### Connect Your Phone
1. Make sure your phone is on the **same WiFi network** as your laptop
2. Open the URL shown in the terminal on your phone's browser
3. **Or** scan the QR code displayed at `http://localhost:8765/connect`

---

## 🖱️ How to Use

### Trackpad Mode
| Gesture | Action |
|---|---|
| Swipe | Move cursor |
| Single tap | Left click |
| Two-finger tap | Right click |
| Three-finger tap | Middle click |
| Two-finger swipe | Scroll |
| Long press | Right click |

### Keyboard Mode
- **Tap** keys to type
- **Glide** across keys for swipe typing
- Toggle **Shift** for uppercase
- Switch to **Numbers/Symbols** layout

### Media Mode
- Play/Pause, Next, Previous track
- Volume Up/Down/Mute

---

## 🛠️ Requirements

- **Laptop**: Windows 10/11, Python 3.8+
- **Phone**: Any modern browser (Chrome, Safari, Firefox)
- **Network**: Both devices on the same WiFi

---

## 📁 Project Structure

```
SuperXontrol/
├── server/
│   ├── main.py              # FastAPI server + WebSocket
│   ├── input_controller.py  # Mouse/keyboard control (pynput)
│   ├── config.py            # Settings
│   └── requirements.txt     # Python dependencies
├── client/
│   ├── index.html           # Phone UI
│   ├── css/styles.css       # Futuristic dark theme
│   ├── js/
│   │   ├── app.js           # Main controller + WebSocket
│   │   ├── trackpad.js      # Touch → cursor movement
│   │   ├── keyboard.js      # Virtual keyboard + glide typing
│   │   └── gestures.js      # Multi-touch gestures
│   └── manifest.json        # PWA support
├── start.bat                # One-click launcher
└── README.md                # This file
```

---

## ⚙️ Configuration

Edit `server/config.py` to adjust:
- `SENSITIVITY` — Mouse speed multiplier (default: 1.5)
- `SCROLL_SENSITIVITY` — Scroll speed (default: 3.0)
- `ACCELERATION_FACTOR` — Mouse acceleration curve (default: 1.8)
- `PORT` — Server port (default: 8765)

---

## 🔒 Security

SuperXontrol runs on your **local network only**. Anyone on the same WiFi can connect. For added security:
- Use a private/home WiFi network
- Don't run on public networks

---

## 🏗️ Tech Stack

| Component | Technology |
|---|---|
| Server | Python FastAPI + uvicorn |
| Input Control | pynput |
| Communication | Binary WebSocket (< 10ms latency) |
| Phone UI | HTML5 + CSS3 + Vanilla JS |
| PWA | Service Worker + Manifest |

---

Made with ⚡ by SuperXontrol
