// Win32 Native Helpers for Windows (Cursor pos, input simulation, active window, clipboard sequence)

use std::thread;
use std::time::Duration;

#[repr(C)]
#[derive(Default, Copy, Clone, Debug)]
pub struct POINT {
    pub x: i32,
    pub y: i32,
}

#[repr(C)]
#[derive(Default, Copy, Clone, Debug)]
pub struct RECT {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

#[repr(C)]
#[derive(Copy, Clone, Debug)]
pub struct MONITORINFO {
    pub cb_size: u32,
    pub rc_monitor: RECT,
    pub rc_work: RECT,
    pub dw_flags: u32,
}

impl Default for MONITORINFO {
    fn default() -> Self {
        Self {
            cb_size: std::mem::size_of::<MONITORINFO>() as u32,
            rc_monitor: RECT::default(),
            rc_work: RECT::default(),
            dw_flags: 0,
        }
    }
}

const MONITOR_DEFAULTTONEAREST: u32 = 2;

#[link(name = "user32")]
extern "system" {
    fn GetCursorPos(lpPoint: *mut POINT) -> i32;
    fn keybd_event(bVk: u8, bScan: u8, dwFlags: u32, dwExtraInfo: usize);
    fn GetForegroundWindow() -> isize;
    fn SetForegroundWindow(hWnd: isize) -> i32;
    fn GetClipboardSequenceNumber() -> u32;
    fn MonitorFromPoint(pt: POINT, dwFlags: u32) -> isize;
    fn GetMonitorInfoW(hMonitor: isize, lpmi: *mut MONITORINFO) -> i32;
}

const VK_SHIFT: u8 = 0x10;
const VK_CONTROL: u8 = 0x11;
const VK_MENU: u8 = 0x12; // Alt key
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
        unsafe {
            SetForegroundWindow(hwnd);
        }
    }
}

pub fn get_clipboard_sequence() -> u32 {
    unsafe { GetClipboardSequenceNumber() }
}

pub fn trigger_ctrl_c() {
    unsafe {
        // 1. Presionar Control primero para evitar que Windows abra el menú de la barra de título con Alt
        keybd_event(VK_CONTROL, 0, 0, 0);
        thread::sleep(Duration::from_millis(15));

        // 2. Liberar Alt y Shift mientras Control sigue presionado
        keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_SHIFT, 0, KEYEVENTF_KEYUP, 0);
        thread::sleep(Duration::from_millis(20));

        // 3. Pulsar y soltar C (Ctrl + C)
        keybd_event(VK_C, 0, 0, 0);
        thread::sleep(Duration::from_millis(20));
        keybd_event(VK_C, 0, KEYEVENTF_KEYUP, 0);
        thread::sleep(Duration::from_millis(15));

        // 4. Liberar Control
        keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0);
    }
}

pub fn trigger_ctrl_v() {
    unsafe {
        // 1. Presionar Control primero
        keybd_event(VK_CONTROL, 0, 0, 0);
        thread::sleep(Duration::from_millis(15));

        // 2. Liberar Alt y Shift mientras Control sigue presionado
        keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_SHIFT, 0, KEYEVENTF_KEYUP, 0);
        thread::sleep(Duration::from_millis(20));

        // 3. Pulsar y soltar V (Ctrl + V)
        keybd_event(VK_V, 0, 0, 0);
        thread::sleep(Duration::from_millis(20));
        keybd_event(VK_V, 0, KEYEVENTF_KEYUP, 0);
        thread::sleep(Duration::from_millis(15));

        // 4. Liberar Control
        keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0);
    }
}

pub fn get_monitor_work_area(x: i32, y: i32) -> Option<RECT> {
    unsafe {
        let h_monitor = MonitorFromPoint(POINT { x, y }, MONITOR_DEFAULTTONEAREST);
        if h_monitor != 0 {
            let mut mi = MONITORINFO::default();
            if GetMonitorInfoW(h_monitor, &mut mi) != 0 {
                return Some(mi.rc_work);
            }
        }
    }
    None
}

/// Calcula la posición óptima de la ventana HUD flotante.
/// Si la ventana no entra hacia abajo (cursor muy cerca de la parte inferior de la pantalla o barra de tareas),
/// se despliega hacia arriba sobre el cursor.
/// También previene que sobresalga por los bordes laterales.
pub fn calculate_hud_position(
    mouse_x: i32,
    mouse_y: i32,
    win_w: i32,
    win_h: i32,
) -> (i32, i32) {
    if let Some(work_area) = get_monitor_work_area(mouse_x, mouse_y) {
        let margin = 10;
        let spacing = 12;

        // Eje Y: si no entra hacia abajo, desplegar hacia arriba
        let mut target_y = if mouse_y + spacing + win_h > work_area.bottom {
            // Desplegar hacia arriba sobre el cursor
            mouse_y - win_h - spacing
        } else {
            // Desplegar normalmente hacia abajo
            mouse_y + spacing
        };

        // Eje X: si no entra a la derecha, desplegar a la izquierda
        let mut target_x = if mouse_x + spacing + win_w > work_area.right {
            mouse_x - win_w - spacing
        } else {
            mouse_x + spacing
        };

        // Asegurar que permanezca completamente visible dentro del área de trabajo
        let min_x = work_area.left + margin;
        let max_x = (work_area.right - win_w - margin).max(min_x);
        target_x = target_x.clamp(min_x, max_x);

        let min_y = work_area.top + margin;
        let max_y = (work_area.bottom - win_h - margin).max(min_y);
        target_y = target_y.clamp(min_y, max_y);

        (target_x, target_y)
    } else {
        (mouse_x + 10, mouse_y + 10)
    }
}
