mod win32;

use std::sync::atomic::{AtomicIsize, Ordering};
use std::thread;
use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, PhysicalPosition,
};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

static LAST_ACTIVE_HWND: AtomicIsize = AtomicIsize::new(0);

// Comando: Copiar texto al portapapeles
#[tauri::command]
fn copy_to_clipboard(app: tauri::AppHandle, text: String) -> Result<(), String> {
    app.clipboard()
        .write_text(text)
        .map_err(|e| e.to_string())
}

// Comando: Auto-reemplazar texto en la aplicación activa
#[tauri::command]
fn replace_text_in_active_app(app: tauri::AppHandle, text: String) -> Result<(), String> {
    // 1. Escribir texto al portapapeles
    app.clipboard()
        .write_text(text)
        .map_err(|e| e.to_string())?;

    // 2. Restaurar el foco a la ventana que tenía el texto
    let target_hwnd = LAST_ACTIVE_HWND.load(Ordering::SeqCst);
    if target_hwnd != 0 {
        win32::restore_active_window(target_hwnd);
    }

    // 3. Pequeña espera para asegurar que la app receptora tiene el foco y simular Ctrl+V
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(60));
        win32::trigger_ctrl_v();
    });

    Ok(())
}

// Comando: Obtener coordenadas del ratón
#[tauri::command]
fn get_cursor_pos() -> (i32, i32) {
    win32::get_mouse_position()
}

// Rutina para mostrar la ventana HUD en la posición del ratón con el texto seleccionado
fn trigger_hud_flow(app: &tauri::AppHandle) {
    let app_handle = app.clone();

    thread::spawn(move || {
        // 1. Guardar la ventana activa actual (ej. Word, Chrome, Slack)
        let active_hwnd = win32::get_active_window();
        LAST_ACTIVE_HWND.store(active_hwnd, Ordering::SeqCst);

        // 2. Simular Ctrl+C en la ventana activa
        win32::trigger_ctrl_c();
        thread::sleep(Duration::from_millis(100));

        // 3. Leer el texto capturado del portapapeles
        let captured_text = app_handle
            .clipboard()
            .read_text()
            .unwrap_or_default();

        // 4. Obtener la posición del ratón
        let (mouse_x, mouse_y) = win32::get_mouse_position();

        // 5. Posicionar y mostrar la ventana flotante HUD
        if let Some(hud_window) = app_handle.get_webview_window("hud") {
            let _ = hud_window.set_position(PhysicalPosition::new(mouse_x + 10, mouse_y + 10));
            let _ = hud_window.unminimize();
            let _ = hud_window.show();
            let _ = hud_window.set_focus();

            // 6. Emitir evento con el texto para que la UI de TS lo procese
            let _ = hud_window.emit(
                "trigger-hud",
                serde_json::json!({
                    "text": captured_text
                }),
            );
        }
    });
}

// Rutina para alternar la visibilidad de la ventana principal (Hub)
fn toggle_hub_window(app: &tauri::AppHandle) {
    if let Some(main_window) = app.get_webview_window("main") {
        if main_window.is_visible().unwrap_or(false) && !main_window.is_minimized().unwrap_or(false) {
            let _ = main_window.hide();
        } else {
            let _ = main_window.unminimize();
            let _ = main_window.show();
            let _ = main_window.set_focus();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let alt_t = Shortcut::new(Some(Modifiers::ALT), Code::KeyT);
    let alt_shift_v = Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::KeyV);

    let alt_t_clone = alt_t.clone();
    let alt_shift_v_clone = alt_shift_v.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        if shortcut == &alt_t_clone {
                            println!("[HotKey] Alt+T activado");
                            trigger_hud_flow(app);
                        } else if shortcut == &alt_shift_v_clone {
                            println!("[HotKey] Alt+Shift+V activado");
                            toggle_hub_window(app);
                        }
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            copy_to_clipboard,
            replace_text_in_active_app,
            get_cursor_pos
        ])
        .setup(move |app| {
            // 1. Configurar System Tray
            let open_hud_i = MenuItem::with_id(app, "open_hud", "⚡ Asistente Flotante (Alt+T)", true, None::<&str>)?;
            let open_hub_i = MenuItem::with_id(app, "open_hub", "📋 Historial y Ajustes (Alt+Shift+V)", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&open_hud_i, &open_hub_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open_hud" => {
                        trigger_hud_flow(app);
                    }
                    "open_hub" => {
                        toggle_hub_window(app);
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            // 2. Registrar atajos globales por defecto
            let global_shortcut = app.global_shortcut();
            match global_shortcut.register(alt_t) {
                Ok(_) => println!("✅ Atajo Alt+T registrado con éxito"),
                Err(e) => eprintln!("❌ Error registrando Alt+T: {:?}", e),
            }
            match global_shortcut.register(alt_shift_v) {
                Ok(_) => println!("✅ Atajo Alt+Shift+V registrado con éxito"),
                Err(e) => eprintln!("❌ Error registrando Alt+Shift+V: {:?}", e),
            }

            // 3. Monitor ligero en segundo plano para el historial de portapapeles (20 slots)
            let app_for_clip = app.handle().clone();
            thread::spawn(move || {
                let mut last_text = String::new();
                loop {
                    thread::sleep(Duration::from_millis(600));
                    if let Ok(current) = app_for_clip.clipboard().read_text() {
                        let trimmed = current.trim().to_string();
                        if !trimmed.is_empty() && trimmed != last_text && trimmed.len() <= 50_000 {
                            last_text = trimmed.clone();
                            let _ = app_for_clip.emit(
                                "clipboard-changed",
                                serde_json::json!({
                                    "text": trimmed
                                }),
                            );
                        }
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
