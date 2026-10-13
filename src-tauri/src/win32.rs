// Win32 Native Helpers for Windows (Cursor pos, input simulation, active window)

#[repr(C)]
#[derive(Default, Copy, Clone, Debug)]
pub struct POINT {
    pub x: i32,
    pub y: i32,
}

#[link(name = "user32")]
extern "system" {
    fn GetCursorPos(lpPoint: *mut POINT) -> i32;
    fn keybd_event(bVk: u8, bScan: u8, dwFlags: u32, dwExtraInfo: usize);
    fn GetForegroundWindow() -> isize;
    fn SetForegroundWindow(hWnd: isize) -> i32;
}

const VK_CONTROL: u8 = 0x11;
const VK_C: u8 = 0x43;
const VK_V: u8 = 0x56;
const KEYEVENTF_KEYUP: u32 = 0x0002;

pub fn get_mouse_position() -> (i32, i32) {
    let mut point = POINT::default();
    unsafe {
        GetCursorPos(&mut point);
    }
    (point.x, point.y)
}

pub fn get_active_window() -> isize {
    unsafe { GetForegroundWindow() }
}

pub fn restore_active_window(hwnd: isize) {
    if hwnd != 0 {
        unsafe { SetForegroundWindow(hwnd); }
    }
}

pub fn trigger_ctrl_c() {
    unsafe {
        keybd_event(VK_CONTROL, 0, 0, 0);
        keybd_event(VK_C, 0, 0, 0);
        keybd_event(VK_C, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0);
    }
}

pub fn trigger_ctrl_v() {
    unsafe {
        keybd_event(VK_CONTROL, 0, 0, 0);
        keybd_event(VK_V, 0, 0, 0);
        keybd_event(VK_V, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0);
    }
}
