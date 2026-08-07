import socket
import struct
import json
import io
import os
import qrcode
import webbrowser
import random
from datetime import datetime
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, File, UploadFile
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, HTMLResponse, FileResponse, JSONResponse
import uvicorn

from config import HOST, PORT
from input_controller import InputController

app = FastAPI(title="SuperXontrol Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

input_controller = InputController()

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return '127.0.0.1'

local_ip = get_local_ip()
server_url = f"http://{local_ip}:{PORT}"
SERVER_PIN = f"{random.randint(1000, 9999):04d}"

@app.on_event("startup")
async def startup_event():
    print(f"\n" + "="*50)
    print(f"  [*] SuperXontrol Server Started!")
    print(f"  [>] Connect here: {server_url}/connect")
    print(f"  [i] Make sure your phone is on the same Wi-Fi network.")
    print(f"  [🔑] YOUR PIN CODE IS: {SERVER_PIN}")
    print(f"="*50 + "\n")
    try:
        webbrowser.open(f"{server_url}/connect")
    except:
        pass

@app.get("/qr")
async def get_qr_code():
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(server_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")

@app.get("/api/info")
async def get_info():
    return {
        "ip": local_ip,
        "port": PORT,
        "url": server_url,
        "hostname": socket.gethostname()
    }

@app.get("/connect")
async def connect_page():
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Connect to SuperXontrol</title>
        <style>
            body {{
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background-color: #121212;
                color: #ffffff;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
            }}
            .card {{
                background-color: #1e1e1e;
                padding: 2rem;
                border-radius: 12px;
                box-shadow: 0 8px 16px rgba(0,0,0,0.5);
                text-align: center;
            }}
            h1 {{ margin-top: 0; color: #bb86fc; }}
            img {{ border-radius: 8px; margin: 1rem 0; }}
            .url {{ font-size: 1.2rem; font-family: monospace; background: #2c2c2c; padding: 10px; border-radius: 6px; }}
            p {{ color: #b3b3b3; }}
        </style>
    </head>
    <body>
        <div class="card">
            <h1>📱 SuperXontrol</h1>
            <p>Scan this QR code with your phone to connect.</p>
            <img src="/qr" alt="QR Code" width="250" height="250" />
            <p>Or open this URL on your phone:</p>
            <div class="url">{server_url}</div>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html)

# ── Shared files directory ──
SHARED_DIR = os.path.join(os.path.expanduser("~"), "Desktop", "SuperXontrol_Files")
os.makedirs(SHARED_DIR, exist_ok=True)

# Track connected phone WebSocket for sending files to phone
connected_phone = None

@app.get("/portal")
async def portal_page():
    portal_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "portal.html")
    if os.path.exists(portal_path):
        with open(portal_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse(content="<h1>Portal not found</h1>", status_code=404)

@app.get("/api/portal-info")
async def portal_info():
    return {
        "pin": SERVER_PIN,
        "files_dir": SHARED_DIR,
        "url": server_url,
        "hostname": socket.gethostname()
    }

@app.get("/api/files")
async def list_files():
    files = []
    if os.path.isdir(SHARED_DIR):
        for fname in os.listdir(SHARED_DIR):
            fpath = os.path.join(SHARED_DIR, fname)
            if os.path.isfile(fpath):
                stat = os.stat(fpath)
                files.append({
                    "name": fname,
                    "size": stat.st_size,
                    "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                })
    files.sort(key=lambda x: x["modified"], reverse=True)
    return files

@app.get("/api/download/{filename}")
async def download_file(filename: str):
    fpath = os.path.join(SHARED_DIR, os.path.basename(filename))
    if os.path.isfile(fpath):
        return FileResponse(fpath, filename=filename)
    return JSONResponse({"error": "File not found"}, status_code=404)

@app.post("/api/upload-to-phone")
async def upload_to_phone(file: UploadFile = File(...)):
    """Upload a file from the laptop portal to the shared folder (and notify phone)."""
    try:
        fname = os.path.basename(file.filename)
        fpath = os.path.join(SHARED_DIR, fname)
        
        # Handle duplicate names
        base, ext = os.path.splitext(fname)
        counter = 1
        while os.path.exists(fpath):
            fpath = os.path.join(SHARED_DIR, f"{base}_{counter}{ext}")
            fname = f"{base}_{counter}{ext}"
            counter += 1
        
        content = await file.read()
        with open(fpath, "wb") as f:
            f.write(content)
        
        print(f"  [portal] File uploaded: {fname} ({len(content)} bytes)")
        
        # Notify connected phone via WebSocket
        if connected_phone:
            try:
                # Send file-available notification: 0x13 + filename UTF-8
                notify = bytes([0x13]) + fname.encode('utf-8')
                await connected_phone.send_bytes(notify)
            except:
                pass
        
        return {"status": "ok", "filename": fname, "size": len(content)}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

@app.get("/api/clipboard")
async def get_clipboard():
    try:
        text = input_controller.get_clipboard()
        return {"text": text or ""}
    except Exception as e:
        return {"text": "", "error": str(e)}

@app.post("/api/clipboard")
async def set_clipboard_api():
    """Set clipboard from portal. Expects JSON body with 'text' field."""
    import sys
    from starlette.requests import Request
    # This is a workaround - we need the raw request
    return {"status": "ok"}

# Override with proper request handling
@app.api_route("/api/clipboard", methods=["POST"])
async def set_clipboard_post(request):
    try:
        body = await request.json()
        text = body.get("text", "")
        input_controller.set_clipboard(text)
        print(f"  [portal] Clipboard set: '{text[:50]}...'")
        return {"status": "ok"}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, pin: str = None):
    global connected_phone
    await websocket.accept()
    client_host = websocket.client.host if websocket.client else "unknown"
    
    if pin != SERVER_PIN:
        print(f"  [!] Rejected connection from {client_host}: Invalid PIN '{pin}'")
        try:
            await websocket.send_bytes(struct.pack('>BB', 0xFE, 0x01)) # 0x01 = rejected
            await websocket.close(code=1008)
        except:
            pass
        return

    print(f"  [+] Client authenticated and connected from {client_host}")
    connected_phone = websocket
    try:
        await websocket.send_bytes(struct.pack('>BB', 0xFE, 0x00)) # 0x00 = ok
        print(f"  [+] Sent connection ack to {client_host}")
    except Exception as e:
        print(f"  [!] Error sending ack: {e}")
        connected_phone = None
        return

    msg_count = 0
    # File transfer state
    file_name = None
    file_size = 0
    file_received = 0
    file_handle = None
    file_save_dir = os.path.join(os.path.expanduser("~"), "Desktop", "SuperXontrol_Files")
    
    try:
        while True:
            data = await websocket.receive_bytes()
            if not data:
                continue
                
            msg_type = data[0]
            msg_count += 1
            
            if msg_type == 0x01: # Mouse Move
                if len(data) >= 5:
                    dx, dy = struct.unpack('>hh', data[1:5])
                    if msg_count <= 5 or msg_count % 100 == 0:
                        print(f"  [mouse] move dx={dx} dy={dy} (msg #{msg_count})")
                    input_controller.move_mouse(dx, dy)
            elif msg_type == 0x02: # Mouse Click
                if len(data) >= 3:
                    button = data[1]
                    action = data[2]
                    print(f"  [click] button={button} action={action}")
                    input_controller.click_mouse(button, action)
                    try:
                        await websocket.send_bytes(struct.pack('>BB', 0x06, 0)) # tap haptic
                    except:
                        pass
            elif msg_type == 0x03: # Mouse Scroll
                if len(data) >= 5:
                    dx, dy = struct.unpack('>hh', data[1:5])
                    input_controller.scroll_mouse(dx, dy)
            elif msg_type == 0x04: # Key Press
                if len(data) >= 3:
                    key_type = data[1]
                    modifiers = data[2]
                    print(f"  [key] type=0x{key_type:02x} modifiers=0x{modifiers:02x}")
                    input_controller.press_key(key_type, modifiers)
                    try:
                        await websocket.send_bytes(struct.pack('>BB', 0x06, 5)) # key haptic
                    except:
                        pass
            elif msg_type == 0x05: # Key Text
                if len(data) > 1:
                    try:
                        text = data[1:].decode('utf-8')
                        print(f"  [text] '{text}'")
                        input_controller.type_text(text)
                    except UnicodeDecodeError:
                        print("  [!] Failed to decode text")
            elif msg_type == 0x07: # Media Control
                if len(data) >= 2:
                    action = data[1]
                    print(f"  [media] action=0x{action:02x}")
                    input_controller.media_control(action)
            elif msg_type == 0x08: # Gesture Shortcut
                if len(data) >= 2:
                    gesture_id = data[1]
                    GESTURE_NAMES = {
                        0x01: '3F-swipe-up (Task View)',
                        0x02: '3F-swipe-down (Show Desktop)',
                        0x03: '3F-swipe-left (Prev App)',
                        0x04: '3F-swipe-right (Next App)',
                        0x05: '3F-tap (Start Menu)',
                        0x06: '4F-swipe-up (Vol Up)',
                        0x07: '4F-swipe-down (Vol Down)',
                        0x08: '4F-swipe-left (Media Prev)',
                        0x09: '4F-swipe-right (Media Next)',
                    }
                    print(f"  [gesture] {GESTURE_NAMES.get(gesture_id, f'unknown 0x{gesture_id:02x}')}")
                    input_controller.gesture_shortcut(gesture_id)
                    try:
                        await websocket.send_bytes(struct.pack('>BB', 0x06, 4)) # gesture haptic
                    except:
                        pass
            
            # ── Drag & Drop ──
            elif msg_type == 0x09: # Drag Start
                print(f"  [drag] START")
                input_controller.click_mouse(0, 1) # Left press (hold)
                try:
                    await websocket.send_bytes(struct.pack('>BB', 0x06, 2)) # drag start haptic
                except:
                    pass
            elif msg_type == 0x0A: # Drag End
                print(f"  [drag] END")
                input_controller.click_mouse(0, 2) # Left release
                try:
                    await websocket.send_bytes(struct.pack('>BB', 0x06, 3)) # drag end haptic
                except:
                    pass
            
            # ── Clipboard Sync ──
            elif msg_type == 0x0B: # Clipboard Push (phone → laptop)
                if len(data) > 1:
                    try:
                        text = data[1:].decode('utf-8')
                        print(f"  [clipboard] PUSH: '{text[:50]}...' ({len(text)} chars)")
                        input_controller.set_clipboard(text)
                        await websocket.send_bytes(struct.pack('>BB', 0x06, 7)) # clipboard haptic
                    except Exception as e:
                        print(f"  [!] Clipboard push error: {e}")
            elif msg_type == 0x0D: # Clipboard Request (phone asks for laptop clipboard)
                print(f"  [clipboard] PULL requested")
                try:
                    text = input_controller.get_clipboard()
                    if text:
                        encoded = text.encode('utf-8')
                        response = bytes([0x0C]) + encoded
                        await websocket.send_bytes(response)
                        await websocket.send_bytes(struct.pack('>BB', 0x06, 7)) # clipboard haptic
                        print(f"  [clipboard] Sent {len(text)} chars to phone")
                    else:
                        await websocket.send_bytes(bytes([0x0C]))
                except Exception as e:
                    print(f"  [!] Clipboard pull error: {e}")
            
            # ── File Transfer ──
            elif msg_type == 0x10: # File Upload Start
                try:
                    name_len = struct.unpack('>H', data[1:3])[0]
                    fname = data[3:3+name_len].decode('utf-8')
                    fsize = struct.unpack('>I', data[3+name_len:7+name_len])[0]
                    
                    # Sanitize filename
                    fname = os.path.basename(fname)
                    os.makedirs(file_save_dir, exist_ok=True)
                    fpath = os.path.join(file_save_dir, fname)
                    
                    # Handle duplicate names
                    base, ext = os.path.splitext(fname)
                    counter = 1
                    while os.path.exists(fpath):
                        fpath = os.path.join(file_save_dir, f"{base}_{counter}{ext}")
                        counter += 1
                    
                    file_name = fpath
                    file_size = fsize
                    file_received = 0
                    file_handle = open(fpath, 'wb')
                    print(f"  [file] START: '{fname}' ({fsize} bytes) -> {fpath}")
                except Exception as e:
                    print(f"  [!] File header error: {e}")
                    file_handle = None
                    
            elif msg_type == 0x11: # File Upload Chunk
                if file_handle:
                    try:
                        chunk_idx = struct.unpack('>H', data[1:3])[0]
                        chunk_data = data[3:]
                        file_handle.write(chunk_data)
                        file_received += len(chunk_data)
                        
                        if chunk_idx % 10 == 0:
                            pct = int(file_received / file_size * 100) if file_size > 0 else 0
                            print(f"  [file] chunk #{chunk_idx} ({pct}%)")
                        
                        # Check if complete
                        if file_received >= file_size:
                            file_handle.close()
                            file_handle = None
                            print(f"  [file] COMPLETE: {file_name}")
                            try:
                                await websocket.send_bytes(struct.pack('>BB', 0x12, 0x00)) # success ack
                            except:
                                pass
                    except Exception as e:
                        print(f"  [!] File chunk error: {e}")
                        if file_handle:
                            file_handle.close()
                            file_handle = None
                        try:
                            await websocket.send_bytes(struct.pack('>BB', 0x12, 0x01)) # error ack
                        except:
                            pass
            
            elif msg_type == 0xFF: # Ping/Pong
                try:
                    await websocket.send_bytes(struct.pack('>B', 0xFF))
                except:
                    pass
            else:
                print(f"  [?] Unknown message type: 0x{msg_type:02x}")
                
    except WebSocketDisconnect:
        print(f"  [-] Client {client_host} disconnected (after {msg_count} messages)")
    except Exception as e:
        print(f"  [!] WebSocket error: {e}")
    finally:
        global connected_phone
        if connected_phone == websocket:
            connected_phone = None
        if file_handle:
            file_handle.close()

# Mount client directory if it exists
client_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "client")
if os.path.isdir(client_dir):
    app.mount("/", StaticFiles(directory=client_dir, html=True), name="client")
else:
    print(f"Warning: Client directory not found at {client_dir}")

if __name__ == "__main__":
    uvicorn.run("main:app", host=HOST, port=PORT, log_level="info")
