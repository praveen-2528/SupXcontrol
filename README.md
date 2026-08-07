```text
  ____                        _  __            _             _ 
 / ___| _   _ _ __   ___ _ __| |/ /___  _ __ | |_ _ __ ___ | |
 \___ \| | | | '_ \ / _ \ '__| ' // _ \| '_ \| __| '__/ _ \| |
  ___) | |_| | |_) |  __/ |  | . \ (_) | | | | |_| | | (_) | |
 |____/ \__,_| .__/ \___|_|  |_|\_\___/|_| |_|\__|_|  \___/|_|
             |_|                                              
```

**Turn your phone into a futuristic wireless trackpad, keyboard & command center for your laptop.**

No bending over. No wires. Just open your phone's browser and take full control.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🖱️ **Smart Trackpad** | Smooth, accelerated cursor control with tap-to-click |
| ⌨️ **Virtual Keyboard** | Full QWERTY with glide/swipe typing and modifier keys (Ctrl, Alt, Win, Shift) |
| 🎵 **Media Controls** | Play/pause, skip tracks, volume — all from your phone |
| 🤏 **Multi-Touch Gestures** | 2/3/4 finger swipes & taps — just like a real laptop trackpad |
| 🔐 **PIN Security** | Random 4-digit PIN generated each session — no unauthorized access |
| 🖐️ **Drag & Drop** | Long-press to grab, swipe to drag, lift to release |
| 📋 **Clipboard Sync** | Copy/paste text between your phone and laptop instantly |
| 📳 **Haptic Profiles** | 8 distinct vibration patterns — feel every action |
| 📱 **Landscape Mode** | Rotate your phone for a wider trackpad with sidebar controls |
| 📁 **File Transfer** | Send files from your phone straight to your laptop's Desktop |

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
3. Enter the **4-digit PIN** displayed in the terminal
4. **Or** scan the QR code at `http://localhost:8765/connect`

> ⚠️ **Important:** Run `start.bat` from **File Explorer** (double-click), not from an IDE terminal. The server needs access to the active Windows desktop session to control the mouse and keyboard.

---

## 🖱️ Trackpad Gestures

| Gesture | Action |
|---|---|
| **1-finger swipe** | Move cursor |
| **1-finger tap** | Left click |
| **1-finger long-press** | 🖐️ Start drag (hold to drag, release to drop) |
| **2-finger tap** | Right click |
| **2-finger swipe** | Scroll (vertical & horizontal) |
| **3-finger tap** | Open Start Menu |
| **3-finger swipe up** | Task View (`Win + Tab`) |
| **3-finger swipe down** | Show Desktop (`Win + D`) |
| **3-finger swipe left** | Previous App (`Alt + Shift + Tab`) |
| **3-finger swipe right** | Next App (`Alt + Tab`) |
| **4-finger swipe up/down** | Volume Up / Volume Down |
| **4-finger swipe left/right** | Media Previous / Media Next |

---

## ⌨️ Keyboard

- **Tap** keys to type — each keystroke streams instantly to your PC
- **Glide** across keys for swipe typing with a glowing neon trail
- **Modifier keys**: Tap `CTRL`, `ALT`, `WIN`, or `SHIFT` to toggle (they glow when active), then tap a key for the shortcut
  - Example: Tap `CTRL` → Tap `C` = **Ctrl+C** (copy)
- Switch between **ABC**, **123**, and **symbols** layouts

---

## 📋 Clipboard Sync

- Tap the **📋 clipboard icon** in the top status bar
- **Pull from PC**: Fetches your laptop's clipboard text to your phone
- **Push to PC**: Sends the text you typed to your laptop's clipboard
- Works both ways — share URLs, passwords, or snippets instantly

---

## 📁 File Transfer

- Tap the **⬆️ upload icon** in the top status bar
- Pick any file from your phone (photos, documents, etc.)
- Files transfer with a **live progress bar** over WebSocket
- Saved to: `Desktop/SuperXontrol_Files/` on your laptop
- Duplicate filenames are auto-renamed (`photo.jpg` → `photo_1.jpg`)

---

## 📱 Landscape Mode

Rotate your phone to landscape for an optimized layout:
- **Tab bar** moves to a vertical sidebar on the left
- **Mouse buttons** stack vertically on the right edge
- **Trackpad** gets maximum surface area
- Compact status bar with hidden labels on small screens

---

## 📳 Haptic Feedback

Each action has its own distinct vibration pattern:

| Action | Feel |
|---|---|
| Tap click | Ultra-short tick |
| Scroll | Barely perceptible |
| Drag start | Double pulse |
| Drag end | Firm release |
| Gesture fire | Triple ripple |
| Key press | Light tap |
| Error | Harsh double buzz |
| Clipboard sync | Soft triple |

---

## ⚙️ Configuration

Edit `server/config.py` to adjust:
- `SENSITIVITY` — Mouse speed multiplier (default: 1.5)
- `SCROLL_SENSITIVITY` — Scroll speed (default: 3.0)
- `ACCELERATION_FACTOR` — Mouse acceleration curve (default: 1.8)
- `PORT` — Server port (default: 8765)

Additional settings available in-app via the ⚙️ gear icon:
- Trackpad sensitivity slider
- Scroll speed slider

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
│   ├── main.py              # FastAPI server + WebSocket + file handler
│   ├── input_controller.py  # Win32 SendInput + clipboard (ctypes)
│   ├── config.py            # Settings
│   └── requirements.txt     # Python dependencies
├── client/
│   ├── index.html           # Phone UI (PWA)
│   ├── css/styles.css       # Futuristic dark theme + landscape mode
│   ├── js/
│   │   ├── app.js           # Main controller + WebSocket manager
│   │   ├── trackpad.js      # Touch → cursor + drag & drop + gestures
│   │   ├── keyboard.js      # Virtual keyboard + glide typing
│   │   ├── gestures.js      # Multi-touch gesture recognizer
│   │   └── file_transfer.js # Chunked file upload over WebSocket
│   └── manifest.json        # PWA support
├── start.bat                # One-click launcher
└── README.md
```

---

## 🏗️ Tech Stack

| Component | Technology |
|---|---|
| Server | Python FastAPI + Uvicorn |
| Input Control | Win32 API (`ctypes` `SendInput`) |
| Clipboard | Win32 API (`OpenClipboard` / `SetClipboardData`) |
| Communication | Binary WebSocket (< 10ms latency) |
| Phone UI | HTML5 + CSS3 + Vanilla JS (ES Modules) |
| PWA | Service Worker + Manifest |
| File Transfer | Chunked binary WebSocket (32KB chunks) |

---

## 🔒 Security

- **PIN Authentication**: A random 4-digit PIN is generated every time the server starts. You must enter it on your phone to connect.
- **Local Network Only**: The server binds to your local WiFi — not exposed to the internet.
- **No Data Storage**: Nothing is logged or stored beyond the current session.

For best security:
- Use a private/home WiFi network
- Don't run on public networks
- The PIN changes every restart

---

## 🗺️ Roadmap

- [ ] Screen mirroring / live preview thumbnail
- [ ] Voice-to-type (speech recognition → laptop)
- [ ] Presentation mode (slide controls + laser pointer)
- [ ] Custom shortcut buttons toolbar
- [ ] Multi-device support (control multiple PCs)
- [ ] AMOLED black theme

---

Made with ⚡ by SuperXontrol
