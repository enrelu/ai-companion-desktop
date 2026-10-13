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
use tauri_plugin_store::StoreExt;

static LAST_ACTIVE_HWND: AtomicIsize = AtomicIsize::new(0);

// Comando: Ocultar ventana flotante (HUD)
#[tauri::command]
fn hide_hud(app: tauri::AppHandle) {
    if let Some(hud) = app.get_webview_window("hud") {
        let _ = hud.hide();
    }
}

// Comando: Copiar texto al portapapeles
#[tauri::command]
fn copy_to_clipboard(app: tauri::AppHandle, text: String) -> Result<(), String> {
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}

// Comando: Auto-reemplazar texto en la aplicación activa
#[tauri::command]
fn replace_text_in_active_app(app: tauri::AppHandle, text: String) -> Result<(), String> {
    // 1. Ocultar la ventana flotante
    if let Some(hud) = app.get_webview_window("hud") {
        let _ = hud.hide();
    }

    // 2. Escribir texto al portapapeles
    app.clipboard()
        .write_text(text)
        .map_err(|e| e.to_string())?;

    // 3. Restaurar el foco a la ventana que tenía el texto
    let target_hwnd = LAST_ACTIVE_HWND.load(Ordering::SeqCst);
    if target_hwnd != 0 {
        win32::restore_active_window(target_hwnd);
    }

    // 4. Pequeña espera para asegurar que la app receptora tiene el foco y simular Ctrl+V
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

// Rutina para pegar directamente un Pin guardado (1, 2, 3 o 4) en cualquier aplicación
fn paste_pin(app: &tauri::AppHandle, slot: u8) {
    let app_handle = app.clone();
    thread::spawn(move || {
        if let Ok(store) = app_handle.store("settings.json") {
            if let Some(pinned_val) = store.get("pinnedItems") {
                if let Some(arr) = pinned_val.as_array() {
                    for item in arr {
                        if item.get("slot").and_then(|s| s.as_u64()) == Some(slot as u64) {
                            if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                                let text_to_paste = text.to_string();
                                if !text_to_paste.is_empty() {
                                    // Guardar la ventana activa actual
                                    let active_hwnd = win32::get_active_window();

                                    // Copiar el texto del pin al portapapeles
                                    let _ = app_handle.clipboard().write_text(text_to_paste);
                                    thread::sleep(Duration::from_millis(30));

                                    // Asegurar foco y simular Ctrl+V
                                    if active_hwnd != 0 {
                                        win32::restore_active_window(active_hwnd);
                                    }
                                    thread::sleep(Duration::from_millis(30));
                                    win32::trigger_ctrl_v();
                                    return;
                                }
                            }
                        }
                    }
                }
            }
        }
    });
}

// Rutina para mostrar la ventana HUD en la posición del ratón con el texto seleccionado
fn trigger_hud_flow(app: &tauri::AppHandle) {
    let app_handle = app.clone();

    thread::spawn(move || {
        // 1. Guardar la ventana activa actual (ej. Word, Chrome, Slack)
        let active_hwnd = win32::get_active_window();
        LAST_ACTIVE_HWND.store(active_hwnd, Ordering::SeqCst);

        // 2. Capturar el número de secuencia antes del copiado
        let initial_seq = win32::get_clipboard_sequence();

        // 3. Simular Ctrl+C en la ventana activa
        win32::trigger_ctrl_c();

        // 4. Esperar hasta 240ms comprobando si el portapapeles cambió (nueva copia efectiva)
        let mut new_copy_detected = false;
        for _ in 0..12 {
            thread::sleep(Duration::from_millis(20));
            if win32::get_clipboard_sequence() != initial_seq {
                new_copy_detected = true;
                break;
            }
        }

        // 5. Si la secuencia del portapapeles CAMBIÓ, leer el texto recién copiado.
        // Si NO cambió (porque no había texto seleccionado o la app no copió nada),
        // ¡NO leer el portapapeles viejo! Usar cadena vacía.
        let captured_text = if new_copy_detected {
            app_handle.clipboard().read_text().unwrap_or_default()
        } else {
            String::new()
        };

        // 6. Obtener la posición del ratón
        let (mouse_x, mouse_y) = win32::get_mouse_position();

        // 7. Posicionar y mostrar la ventana flotante HUD de forma adaptativa
        if let Some(hud_window) = app_handle.get_webview_window("hud") {
            let scale_factor = hud_window.scale_factor().unwrap_or(1.0);
            let (win_w, win_h) = if let Ok(size) = hud_window.outer_size() {
                if size.width > 0 && size.height > 0 {
                    (size.width as i32, size.height as i32)
                } else {
                    ((570.0 * scale_factor) as i32, (360.0 * scale_factor) as i32)
                }
            } else {
                ((570.0 * scale_factor) as i32, (360.0 * scale_factor) as i32)
            };

            let (target_x, target_y) =
                win32::calculate_hud_position(mouse_x, mouse_y, win_w, win_h);

            let _ = hud_window.set_position(PhysicalPosition::new(target_x, target_y));
            let _ = hud_window.unminimize();
            let _ = hud_window.show();
            let _ = hud_window.set_focus();

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
        if main_window.is_visible().unwrap_or(false) && !main_window.is_minimized().unwrap_or(false)
        {
            let _ = main_window.hide();
        } else {
            let _ = main_window.unminimize();
            let _ = main_window.show();
            let _ = main_window.set_focus();
        }
    } else {
        // Si la ventana no existe (fue cerrada), recrearla
        let _ = tauri::WebviewWindowBuilder::new(
            app,
            "main",
            tauri::WebviewUrl::App("index.html".into()),
        )
        .title("AI Companion - Hub")
        .inner_size(660.0, 620.0)
        .center()
        .build();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let alt_t = Shortcut::new(Some(Modifiers::ALT), Code::KeyT);
    let alt_v = Shortcut::new(Some(Modifiers::ALT), Code::KeyV);
    let alt_shift_v = Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::KeyV);

    let alt_1 = Shortcut::new(Some(Modifiers::ALT), Code::Digit1);
    let alt_2 = Shortcut::new(Some(Modifiers::ALT), Code::Digit2);
    let alt_3 = Shortcut::new(Some(Modifiers::ALT), Code::Digit3);
    let alt_4 = Shortcut::new(Some(Modifiers::ALT), Code::Digit4);

    let alt_t_clone = alt_t.clone();
    let alt_v_clone = alt_v.clone();
    let alt_shift_v_clone = alt_shift_v.clone();

    let alt_1_clone = alt_1.clone();
    let alt_2_clone = alt_2.clone();
    let alt_3_clone = alt_3.clone();
    let alt_4_clone = alt_4.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        if shortcut == &alt_t_clone || shortcut == &alt_v_clone {
                            println!("[HotKey] Asistente flotante activado");
                            trigger_hud_flow(app);
                        } else if shortcut == &alt_shift_v_clone {
                            println!("[HotKey] Historial del Portapapeles activado");
                            toggle_hub_window(app);
                        } else if shortcut == &alt_1_clone {
                            println!("[HotKey] Pegando Pin #1");
                            paste_pin(app, 1);
                        } else if shortcut == &alt_2_clone {
                            println!("[HotKey] Pegando Pin #2");
                            paste_pin(app, 2);
                        } else if shortcut == &alt_3_clone {
                            println!("[HotKey] Pegando Pin #3");
                            paste_pin(app, 3);
                        } else if shortcut == &alt_4_clone {
                            println!("[HotKey] Pegando Pin #4");
                            paste_pin(app, 4);
                        }
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            hide_hud,
            copy_to_clipboard,
            replace_text_in_active_app,
            get_cursor_pos
        ])
        .on_window_event(|window, event| match event {
            // Evitar que la ventana principal se destruya al pulsar X (ocultar a la bandeja)
            tauri::WindowEvent::CloseRequested { api, .. } => {
                let _ = window.hide();
                api.prevent_close();
            }
            // Cuando la ventana HUD pierde el foco (clic fuera), cerrarla automáticamente
            tauri::WindowEvent::Focused(false) => {
                if window.label() == "hud" {
                    let _ = window.hide();
                }
            }
            _ => {}
        })
        .setup(move |app| {
            // 1. Configurar System Tray
            let open_hud_i = MenuItem::with_id(
                app,
                "open_hud",
                "⚡ Asistente Flotante (Alt+T o Alt+V)",
                true,
                None::<&str>,
            )?;
            let open_hub_i = MenuItem::with_id(
                app,
                "open_hub",
                "📋 Historial y Ajustes (Alt+Shift+V)",
                true,
                None::<&str>,
            )?;
            let quit_i = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&open_hud_i, &open_hub_i, &quit_i])?;

            let mut tray_builder = TrayIconBuilder::new();
            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }
            let _tray = tray_builder
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
            let _ = global_shortcut.register(alt_t);
            let _ = global_shortcut.register(alt_v);
            let _ = global_shortcut.register(alt_shift_v);

            // Registrar atajos directos para pegar pines 1 a 4
            let _ = global_shortcut.register(alt_1);
            let _ = global_shortcut.register(alt_2);
            let _ = global_shortcut.register(alt_3);
            let _ = global_shortcut.register(alt_4);

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
