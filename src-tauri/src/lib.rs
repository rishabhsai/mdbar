mod notes;

use std::sync::atomic::{AtomicBool, Ordering};

use font_kit::source::SystemSource;
use tauri::{
    include_image,
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    ActivationPolicy, AppHandle, Manager, PhysicalPosition, Runtime, WebviewWindow, WindowEvent,
};

const MAIN_WINDOW_LABEL: &str = "main";
const TRAY_ID: &str = "mdbar-tray";
const QUIT_ID: &str = "quit";

struct PanelAutoHide(AtomicBool);

#[tauri::command(rename_all = "camelCase")]
fn set_panel_auto_hide(app: AppHandle, enabled: bool) -> Result<(), String> {
    app.state::<PanelAutoHide>()
        .0
        .store(enabled, Ordering::Relaxed);
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
fn toggle_main_window(app: AppHandle) -> Result<(), String> {
    let window = get_main_window(&app)?;

    if window.is_visible().unwrap_or(false) {
        window.hide().map_err(|error| error.to_string())?;
        return Ok(());
    }

    reveal_panel(&app, &window);
    Ok(())
}

#[tauri::command]
fn list_system_fonts() -> Result<Vec<String>, String> {
    let mut families = SystemSource::new()
        .all_families()
        .map_err(|error| format!("Couldn't read the system fonts: {error}"))?;

    families.sort_unstable();
    families.dedup();

    Ok(families)
}

fn get_main_window<R: Runtime>(app: &AppHandle<R>) -> Result<WebviewWindow<R>, String> {
    app.get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "mdbar could not find the main panel.".to_string())
}

fn reveal_panel<R: Runtime>(app: &AppHandle<R>, window: &WebviewWindow<R>) {
    place_window_under_tray(app, window);
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

fn place_window_under_tray<R: Runtime>(app: &AppHandle<R>, window: &WebviewWindow<R>) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };

    let Ok(Some(rect)) = tray.rect() else {
        return;
    };

    let Ok(Some(monitor)) = window.current_monitor() else {
        return;
    };

    let Ok(size) = window.outer_size() else {
        return;
    };

    let monitor_origin = monitor.position();
    let monitor_size = monitor.size();

    let tray_origin = rect.position.to_physical::<f64>(1.0);
    let tray_size = rect.size.to_physical::<f64>(1.0);

    let desired_x =
        tray_origin.x.round() as i32 + ((tray_size.width - size.width as f64) / 2.0).round() as i32;
    let desired_y = tray_origin.y.round() as i32 + tray_size.height.round() as i32 + 10;

    let max_x =
        monitor_origin.x + monitor_size.width as i32 - size.width as i32 - 12;
    let min_x = monitor_origin.x + 12;
    let x = desired_x.clamp(min_x, max_x.max(min_x));

    let max_y =
        monitor_origin.y + monitor_size.height as i32 - size.height as i32 - 12;
    let y = desired_y.min(max_y.max(monitor_origin.y + 12));

    let _ = window.set_position(PhysicalPosition::new(x, y));
}

fn build_app_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    #[cfg(target_os = "macos")]
    {
        let app_menu = Submenu::with_items(
            app,
            app.package_info().name.clone(),
            true,
            &[&PredefinedMenuItem::quit(app, None)?],
        )?;

        return Menu::with_items(app, &[&app_menu, &edit_menu]);
    }

    #[cfg(not(target_os = "macos"))]
    {
        Menu::with_items(app, &[&edit_menu])
    }
}

fn build_tray<R: Runtime>(app: &mut tauri::App<R>) -> tauri::Result<()> {
    let quit_item = MenuItem::with_id(app, QUIT_ID, "Quit mdbar", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&quit_item])?;

    let mut tray_builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .tooltip("mdbar")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            if event.id.as_ref() == QUIT_ID {
                app.exit(0);
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button,
                button_state,
                ..
            } = event
            {
                if button == MouseButton::Left && button_state == MouseButtonState::Up {
                    let app = tray.app_handle();
                    if let Ok(window) = get_main_window(app) {
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.hide();
                        } else {
                            reveal_panel(app, &window);
                        }
                    }
                }
            }
        });

    #[cfg(target_os = "macos")]
    {
        let tray_icon = include_image!("./icons/tray-template.png");
        tray_builder = tray_builder.icon(tray_icon).icon_as_template(true);
    }

    #[cfg(not(target_os = "macos"))]
    if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    }

    tray_builder.build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PanelAutoHide(AtomicBool::new(true)))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            toggle_main_window,
            set_panel_auto_hide,
            list_system_fonts,
            notes::open_daily_note,
            notes::list_library_notes,
            notes::list_library_folders,
            notes::open_library_note,
            notes::create_library_note,
            notes::create_library_folder,
            notes::rename_library_note,
            notes::delete_library_folder,
            notes::save_note,
            notes::save_pasted_image,
            notes::delete_note,
            notes::open_note_in_default_app,
            notes::reveal_note_in_finder
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(ActivationPolicy::Accessory);

            let menu = build_app_menu(app.handle())?;
            app.set_menu(menu)?;
            build_tray(app)?;

            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                let _ = window.hide();
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != MAIN_WINDOW_LABEL {
                return;
            }

            if let WindowEvent::Focused(false) = event {
                let should_hide = window
                    .app_handle()
                    .state::<PanelAutoHide>()
                    .0
                    .load(Ordering::Relaxed);

                if should_hide {
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
