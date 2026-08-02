"""
SuperXontrol Input Controller
Controls mouse and keyboard using Win32 API (ctypes) — direct SendInput.
Includes startup self-test to verify input injection is working.
"""
import ctypes
import ctypes.wintypes
import time
import sys
from config import SENSITIVITY, SCROLL_SENSITIVITY, ACCELERATION_FACTOR, ACCELERATION_THRESHOLD


# ─── Win32 Constants ─────────────────────────────────────────────────────────
MOUSEEVENTF_MOVE       = 0x0001
MOUSEEVENTF_LEFTDOWN   = 0x0002
MOUSEEVENTF_LEFTUP     = 0x0004
MOUSEEVENTF_RIGHTDOWN  = 0x0008
MOUSEEVENTF_RIGHTUP    = 0x0010
MOUSEEVENTF_MIDDLEDOWN = 0x0020
MOUSEEVENTF_MIDDLEUP   = 0x0040
MOUSEEVENTF_WHEEL      = 0x0800
MOUSEEVENTF_HWHEEL     = 0x01000

INPUT_MOUSE    = 0
INPUT_KEYBOARD = 1

KEYEVENTF_KEYUP    = 0x0002
KEYEVENTF_UNICODE  = 0x0004

WHEEL_DELTA = 120

# Virtual key codes for special keys
VK_MAP = {
    0x01: 0x0D,  # Enter
    0x02: 0x08,  # Backspace
    0x03: 0x09,  # Tab
    0x04: 0x1B,  # Escape
    0x05: 0x26,  # Arrow Up
    0x06: 0x28,  # Arrow Down
    0x07: 0x25,  # Arrow Left
    0x08: 0x27,  # Arrow Right
    0x09: 0x24,  # Home
    0x0A: 0x23,  # End
    0x0B: 0x21,  # Page Up
    0x0C: 0x22,  # Page Down
    0x0D: 0x2E,  # Delete
    0x0E: 0x2D,  # Insert
    0x10: 0x70,  # F1
    0x11: 0x71,  # F2
    0x12: 0x72,  # F3
    0x13: 0x73,  # F4
    0x14: 0x74,  # F5
    0x15: 0x75,  # F6
    0x16: 0x76,  # F7
    0x17: 0x77,  # F8
    0x18: 0x78,  # F9
    0x19: 0x79,  # F10
    0x1A: 0x7A,  # F11
    0x1B: 0x7B,  # F12
    0x20: 0x14,  # Caps Lock
    0x21: 0x2C,  # Print Screen
    0x22: 0x91,  # Scroll Lock
    0x23: 0x13,  # Pause
    0x30: 0xAF,  # Volume Up
    0x31: 0xAE,  # Volume Down
    0x32: 0xAD,  # Volume Mute
    0x33: 0xB3,  # Media Play/Pause
    0x34: 0xB0,  # Media Next
    0x35: 0xB1,  # Media Previous
    0x36: 0xB2,  # Media Stop
}

VK_CONTROL = 0x11
VK_MENU    = 0x12  # Alt
VK_SHIFT   = 0x10
VK_LWIN    = 0x5B


# ─── Win32 Structures (64-bit compatible) ────────────────────────────────────
class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", ctypes.c_long),
        ("dy", ctypes.c_long),
        ("mouseData", ctypes.c_ulong),
        ("dwFlags", ctypes.c_ulong),
        ("time", ctypes.c_ulong),
        ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
    ]

class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk", ctypes.c_ushort),
        ("wScan", ctypes.c_ushort),
        ("dwFlags", ctypes.c_ulong),
        ("time", ctypes.c_ulong),
        ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
    ]

class HARDWAREINPUT(ctypes.Structure):
    _fields_ = [
        ("uMsg", ctypes.c_ulong),
        ("wParamL", ctypes.c_ushort),
        ("wParamH", ctypes.c_ushort),
    ]

class INPUT_UNION(ctypes.Union):
    _fields_ = [
        ("mi", MOUSEINPUT),
        ("ki", KEYBDINPUT),
        ("hi", HARDWAREINPUT),
    ]

class INPUT(ctypes.Structure):
    _fields_ = [
        ("type", ctypes.c_ulong),
        ("union", INPUT_UNION),
    ]

class POINT(ctypes.Structure):
    _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]


# ─── Win32 API ───────────────────────────────────────────────────────────────
user32 = ctypes.windll.user32
SendInput = user32.SendInput
SendInput.argtypes = [ctypes.c_uint, ctypes.POINTER(INPUT), ctypes.c_int]
SendInput.restype = ctypes.c_uint

GetCursorPos = user32.GetCursorPos
GetCursorPos.argtypes = [ctypes.POINTER(POINT)]
GetCursorPos.restype = ctypes.c_bool

SetCursorPos = user32.SetCursorPos
SetCursorPos.argtypes = [ctypes.c_int, ctypes.c_int]
SetCursorPos.restype = ctypes.c_bool

GetLastError = ctypes.windll.kernel32.GetLastError


def _send_input(*inputs):
    """Send one or more INPUT structures to Windows. Returns number of events inserted."""
    n = len(inputs)
    arr = (INPUT * n)(*inputs)
    result = SendInput(n, arr, ctypes.sizeof(INPUT))
    if result == 0:
        err = GetLastError()
        print(f"  [!] SendInput FAILED (sent {n}, returned 0, GetLastError={err})")
    return result

def _mouse_input(flags, dx=0, dy=0, data=0):
    """Create a mouse INPUT structure."""
    inp = INPUT()
    inp.type = INPUT_MOUSE
    inp.union.mi.dx = int(dx)
    inp.union.mi.dy = int(dy)
    inp.union.mi.mouseData = int(data) & 0xFFFFFFFF
    inp.union.mi.dwFlags = flags
    inp.union.mi.time = 0
    inp.union.mi.dwExtraInfo = None
    return inp

def _key_input(vk=0, scan=0, flags=0):
    """Create a keyboard INPUT structure."""
    inp = INPUT()
    inp.type = INPUT_KEYBOARD
    inp.union.ki.wVk = vk
    inp.union.ki.wScan = scan
    inp.union.ki.dwFlags = flags
    inp.union.ki.time = 0
    inp.union.ki.dwExtraInfo = None
    return inp


def apply_acceleration(delta):
    """Apply mouse acceleration curve for natural feel."""
    abs_d = abs(delta)
    if abs_d > ACCELERATION_THRESHOLD:
        sign = 1 if delta > 0 else -1
        return sign * (ACCELERATION_THRESHOLD + (abs_d - ACCELERATION_THRESHOLD) * ACCELERATION_FACTOR)
    return float(delta)


class InputController:
    def __init__(self):
        # Accumulate fractional mouse movements for sub-pixel precision
        self._mx_accum = 0.0
        self._my_accum = 0.0
        
        print(f"  [+] InputController initialized (Win32 ctypes backend)")
        print(f"  [+] sizeof(INPUT)={ctypes.sizeof(INPUT)}, sizeof(MOUSEINPUT)={ctypes.sizeof(MOUSEINPUT)}")
        
        # Run self-test
        self._self_test()

    def _self_test(self):
        """Verify that input injection is working on this system."""
        print("  [~] Running input self-test...")
        
        # Test 1: Can we read cursor position?
        pt = POINT()
        ok = GetCursorPos(ctypes.byref(pt))
        print(f"  [~] GetCursorPos: ok={ok}, pos=({pt.x}, {pt.y})")
        
        if not ok or (pt.x == 0 and pt.y == 0):
            print("  [!] WARNING: GetCursorPos returned (0,0) - this process may not have")
            print("  [!]   access to the interactive desktop. Please run this script from")
            print("  [!]   a normal terminal (CMD/PowerShell), NOT from an IDE or service.")
            print("  [!]   Try: double-click start.bat or open PowerShell and run:")
            print("  [!]     cd C:\\Users\\manus\\Desktop\\SuperXontrol\\server")
            print("  [!]     python main.py")
        
        # Test 2: Can we send a mouse move event?
        result = _send_input(_mouse_input(MOUSEEVENTF_MOVE, dx=1, dy=0))
        print(f"  [~] SendInput(mouse_move): result={result} (expected 1)")
        
        # Move back
        _send_input(_mouse_input(MOUSEEVENTF_MOVE, dx=-1, dy=0))
        
        # Test 3: Can we set cursor position directly?
        old_pt = POINT()
        GetCursorPos(ctypes.byref(old_pt))
        ok = SetCursorPos(old_pt.x + 1, old_pt.y)
        print(f"  [~] SetCursorPos: ok={ok}")
        if ok:
            SetCursorPos(old_pt.x, old_pt.y)  # Move back
        
        if result == 0:
            print("")
            print("  " + "="*50)
            print("  [!!!] INPUT INJECTION IS NOT WORKING!")
            print("  [!!!] Mouse and keyboard control will NOT function.")
            print("  [!!!]")
            print("  [!!!] SOLUTION: Close this and run the server from a")
            print("  [!!!] normal terminal window. Double-click start.bat")
            print("  [!!!] from File Explorer, or open PowerShell/CMD and run:")
            print("  [!!!]   cd C:\\Users\\manus\\Desktop\\SuperXontrol\\server")
            print("  [!!!]   python main.py")
            print("  " + "="*50)
            print("")
        else:
            print("  [+] Self-test PASSED - input injection is working!")

    def move_mouse(self, dx, dy):
        """Move the mouse cursor by relative (dx, dy) pixels."""
        try:
            adx = apply_acceleration(dx) * SENSITIVITY
            ady = apply_acceleration(dy) * SENSITIVITY

            self._mx_accum += adx
            self._my_accum += ady

            move_x = int(self._mx_accum)
            move_y = int(self._my_accum)
            self._mx_accum -= move_x
            self._my_accum -= move_y

            if move_x != 0 or move_y != 0:
                _send_input(_mouse_input(MOUSEEVENTF_MOVE, dx=move_x, dy=move_y))
        except Exception as e:
            print(f"  [!] Error moving mouse: {e}")

    def click_mouse(self, button_idx, action):
        """Click a mouse button. button: 0=left, 1=right, 2=middle. action: 0=click, 1=press, 2=release, 3=double."""
        try:
            button_map = {
                0: (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
                1: (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
                2: (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
            }
            down, up = button_map.get(button_idx, (None, None))
            if down is None:
                return

            if action == 0:  # click
                _send_input(_mouse_input(down), _mouse_input(up))
            elif action == 1:  # press (hold down)
                _send_input(_mouse_input(down))
            elif action == 2:  # release
                _send_input(_mouse_input(up))
            elif action == 3:  # double-click
                _send_input(_mouse_input(down), _mouse_input(up))
                time.sleep(0.05)
                _send_input(_mouse_input(down), _mouse_input(up))
        except Exception as e:
            print(f"  [!] Error clicking mouse: {e}")

    def scroll_mouse(self, dx, dy):
        """Scroll the mouse wheel."""
        try:
            if dy != 0:
                scroll_amount = int(dy * SCROLL_SENSITIVITY * WHEEL_DELTA)
                _send_input(_mouse_input(MOUSEEVENTF_WHEEL, data=scroll_amount))
            if dx != 0:
                scroll_amount = int(dx * SCROLL_SENSITIVITY * WHEEL_DELTA)
                _send_input(_mouse_input(MOUSEEVENTF_HWHEEL, data=scroll_amount))
        except Exception as e:
            print(f"  [!] Error scrolling: {e}")

    def type_text(self, text):
        """Type a string of text using Unicode input events."""
        try:
            inputs = []
            for char in text:
                code = ord(char)
                inputs.append(_key_input(vk=0, scan=code, flags=KEYEVENTF_UNICODE))
                inputs.append(_key_input(vk=0, scan=code, flags=KEYEVENTF_UNICODE | KEYEVENTF_KEYUP))
            if inputs:
                _send_input(*inputs)
        except Exception as e:
            print(f"  [!] Error typing text: {e}")

    def press_key(self, key_type, modifiers):
        """Press a special key with optional modifiers."""
        vk = VK_MAP.get(key_type)
        if vk is None:
            print(f"  [!] Unknown key type: {hex(key_type)}")
            return

        try:
            inputs = []
            if modifiers & 1:
                inputs.append(_key_input(vk=VK_CONTROL))
            if modifiers & 2:
                inputs.append(_key_input(vk=VK_MENU))
            if modifiers & 4:
                inputs.append(_key_input(vk=VK_SHIFT))
            if modifiers & 8:
                inputs.append(_key_input(vk=VK_LWIN))

            inputs.append(_key_input(vk=vk))
            inputs.append(_key_input(vk=vk, flags=KEYEVENTF_KEYUP))

            if modifiers & 8:
                inputs.append(_key_input(vk=VK_LWIN, flags=KEYEVENTF_KEYUP))
            if modifiers & 4:
                inputs.append(_key_input(vk=VK_SHIFT, flags=KEYEVENTF_KEYUP))
            if modifiers & 2:
                inputs.append(_key_input(vk=VK_MENU, flags=KEYEVENTF_KEYUP))
            if modifiers & 1:
                inputs.append(_key_input(vk=VK_CONTROL, flags=KEYEVENTF_KEYUP))

            _send_input(*inputs)
        except Exception as e:
            print(f"  [!] Error pressing key: {e}")

    def media_control(self, action):
        """Send a media control key."""
        vk = VK_MAP.get(action)
        if vk:
            try:
                _send_input(
                    _key_input(vk=vk),
                    _key_input(vk=vk, flags=KEYEVENTF_KEYUP)
                )
            except Exception as e:
                print(f"  [!] Error media control: {e}")

    def gesture_shortcut(self, gesture_id):
        """Handle multi-finger gestures from the client."""
        try:
            if gesture_id == 0x01: # 3F Up: Task View (Win + Tab)
                _send_input(
                    _key_input(vk=VK_LWIN),
                    _key_input(vk=VK_MAP.get(0x03)), # Tab
                    _key_input(vk=VK_MAP.get(0x03), flags=KEYEVENTF_KEYUP),
                    _key_input(vk=VK_LWIN, flags=KEYEVENTF_KEYUP)
                )
            elif gesture_id == 0x02: # 3F Down: Show Desktop (Win + D)
                _send_input(
                    _key_input(vk=VK_LWIN),
                    _key_input(vk=0x44), # 'D'
                    _key_input(vk=0x44, flags=KEYEVENTF_KEYUP),
                    _key_input(vk=VK_LWIN, flags=KEYEVENTF_KEYUP)
                )
            elif gesture_id == 0x03: # 3F Left: Prev App (Alt + Shift + Tab)
                _send_input(
                    _key_input(vk=VK_MENU),
                    _key_input(vk=VK_SHIFT),
                    _key_input(vk=VK_MAP.get(0x03)), # Tab
                    _key_input(vk=VK_MAP.get(0x03), flags=KEYEVENTF_KEYUP),
                    _key_input(vk=VK_SHIFT, flags=KEYEVENTF_KEYUP),
                    _key_input(vk=VK_MENU, flags=KEYEVENTF_KEYUP)
                )
            elif gesture_id == 0x04: # 3F Right: Next App (Alt + Tab)
                _send_input(
                    _key_input(vk=VK_MENU),
                    _key_input(vk=VK_MAP.get(0x03)), # Tab
                    _key_input(vk=VK_MAP.get(0x03), flags=KEYEVENTF_KEYUP),
                    _key_input(vk=VK_MENU, flags=KEYEVENTF_KEYUP)
                )
            elif gesture_id == 0x05: # 3F Tap: Start Menu (Win)
                _send_input(
                    _key_input(vk=VK_LWIN),
                    _key_input(vk=VK_LWIN, flags=KEYEVENTF_KEYUP)
                )
            elif gesture_id == 0x06: # 4F Up: Volume Up
                self.media_control(0x30)
            elif gesture_id == 0x07: # 4F Down: Volume Down
                self.media_control(0x31)
            elif gesture_id == 0x08: # 4F Left: Media Prev
                self.media_control(0x35)
            elif gesture_id == 0x09: # 4F Right: Media Next
                self.media_control(0x34)
        except Exception as e:
            print(f"  [!] Error executing gesture: {e}")
