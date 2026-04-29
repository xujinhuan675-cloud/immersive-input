// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backup;
mod clipboard;
mod cmd;
mod config;
mod crash_log;
mod doubletap_hook;
mod error;
mod focused_input;
mod hotkey;
mod lang_detect;
mod mouse_hook;
mod phrase_inline;
mod phrases;
mod rapid_ocr;
mod screenshot;
mod selection_capture;
mod server;
mod system_ocr;
mod tray;
mod updater;
mod vault;
mod window;

use backup::*;
use clipboard::*;
use cmd::paste_result;
use cmd::take_pending_chat_http_text;
use cmd::take_pending_tts_text;
use cmd::write_clipboard;
use cmd::*;
use config::*;
use focused_input::*;
use hotkey::*;
use lang_detect::*;
use log::{debug, info, LevelFilter};
use once_cell::sync::OnceCell;
use phrases::*;
use rapid_ocr::*;
use screenshot::screenshot;
use server::*;
use std::sync::Mutex;
use system_ocr::*;
use tauri::api::notification::Notification;
use tauri::Manager;
use tauri_plugin_log::LogTarget;
use tray::*;
use updater::check_update;
use vault::*;
use window::config_window;
use window::open_chat_window;
use window::open_explain_window;
use window::open_login_window;
use window::open_translate_from_toolbar;
use window::set_translate_excerpt_mode;
use window::updater_window;

// Global AppHandle
pub static APP: OnceCell<tauri::AppHandle> = OnceCell::new();

// Text to be translated
pub struct StringWrapper(pub Mutex<String>);
// Previous foreground window handle (raw isize, Windows HWND)
pub struct PrevForegroundWindow(pub Mutex<isize>);
pub struct TranslateExcerptModeWrapper(pub Mutex<bool>);
pub struct LightAiTargetWrapper(pub Mutex<String>);
pub struct PendingChatHttpTextWrapper(pub Mutex<String>);
pub struct PendingTtsTextWrapper(pub Mutex<String>);

fn build_log_targets() -> Vec<LogTarget> {
    if cfg!(debug_assertions) {
        vec![LogTarget::LogDir, LogTarget::Stdout]
    } else {
        vec![LogTarget::LogDir]
    }
}

fn build_log_level() -> LevelFilter {
    if cfg!(debug_assertions) {
        LevelFilter::Debug
    } else {
        LevelFilter::Info
    }
}

fn is_autostart_launch() -> bool {
    std::env::args().any(|arg| arg == "--autostart")
}

fn should_open_config_on_startup() -> bool {
    if !is_autostart_launch() {
        return true;
    }

    !get("auto_start_background")
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn configure_windows_app_id(app_id: &str) {
    use windows::core::HSTRING;
    use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;

    if app_id.is_empty() {
        return;
    }

    unsafe {
        let _ = SetCurrentProcessExplicitAppUserModelID(&HSTRING::from(app_id));
    }
}

#[cfg(not(target_os = "windows"))]
fn configure_windows_app_id(_app_id: &str) {}

fn main() {
    crash_log::install_panic_hook();
    crash_log::record("startup", "main entry");
    let context = tauri::generate_context!();
    configure_windows_app_id(&context.config().tauri.bundle.identifier);

    tauri::Builder::default()
        // tauri-plugin-single-instance has a null-pointer crash on some Windows configs.
        // Disabled for now; re-enable when the upstream plugin is fixed.
        // .plugin(tauri_plugin_single_instance::init(|app, _, cwd| {
        //     Notification::new(&app.config().tauri.bundle.identifier)
        //         .title("The program is already running. Please do not start it again!")
        //         .body(cwd)
        //         .icon("pot")
        //         .show()
        //         .unwrap();
        // }))
        .plugin(
            tauri_plugin_log::Builder::default()
                .targets(build_log_targets())
                .timezone_strategy(tauri_plugin_log::TimezoneStrategy::UseLocal)
                .level(build_log_level())
                .level_for("focused_input", LevelFilter::Off)
                .level_for("immersive_input::focused_input", LevelFilter::Off)
                .level_for("hyper", LevelFilter::Warn)
                .level_for("hyper_util", LevelFilter::Warn)
                .level_for("h2", LevelFilter::Warn)
                .level_for("reqwest", LevelFilter::Warn)
                .level_for("reqwest_dav", LevelFilter::Warn)
                .level_for("rustls", LevelFilter::Warn)
                .level_for("mio", LevelFilter::Warn)
                .level_for("tiny_http", LevelFilter::Warn)
                .level_for("notify", LevelFilter::Warn)
                .level_for("notify_debouncer_mini", LevelFilter::Warn)
                .level_for("os_info", LevelFilter::Warn)
                .level_for("tao", LevelFilter::Warn)
                .level_for("wry", LevelFilter::Warn)
                .level_for("tracing", LevelFilter::Warn)
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_fs_watch::init())
        .system_tray(tauri::SystemTray::new())
        .setup(|app| {
            info!("============== Start App ==============");
            crash_log::record("startup", "tauri setup start");
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                let trusted =
                    macos_accessibility_client::accessibility::application_is_trusted_with_prompt();
                info!("MacOS Accessibility Trusted: {}", trusted);
            }
            // Global AppHandle
            APP.get_or_init(|| app.handle());
            // Init Config
            debug!("Init Config Store");
            init_config(app);
            if should_open_config_on_startup() {
                debug!("Opening config window on startup");
                config_window();
            } else {
                debug!("Autostart background launch detected, skip config window");
            }
            app.manage(StringWrapper(Mutex::new("".to_string())));
            app.manage(PrevForegroundWindow(Mutex::new(0)));
            app.manage(TranslateExcerptModeWrapper(Mutex::new(false)));
            app.manage(LightAiTargetWrapper(Mutex::new("selection".to_string())));
            app.manage(PendingChatHttpTextWrapper(Mutex::new(String::new())));
            app.manage(PendingTtsTextWrapper(Mutex::new(String::new())));
            app.manage(FocusedInputSnapshotWrapper(Mutex::new(
                FocusedInputSnapshot::default(),
            )));
            app.manage(VaultModeWrapper(Mutex::new(String::new())));
            // Update Tray Menu
            update_tray(app.app_handle(), "".to_string(), "".to_string());
            // Start http server
            start_server();
            // Register Global Shortcut
            match register_shortcut("all") {
                Ok(()) => info!("Global shortcuts initialized"),
                Err(e) => Notification::new(app.config().tauri.bundle.identifier.clone())
                    .title("Failed to register global shortcut")
                    .body(&e)
                    .icon("immersive-input")
                    .show()
                    .unwrap(),
            }
            // Check Update
            check_update(app.handle());
            init_lang_detect();
            let clipboard_action_mode = get_clipboard_action_mode();
            app.manage(ClipboardActionModeWrapper(Mutex::new(
                clipboard_action_mode.clone(),
            )));
            app.manage(ClipboardWriteGuardWrapper(Mutex::new(
                ClipboardWriteGuard::default(),
            )));
            if clipboard_action_enabled(&clipboard_action_mode) {
                start_clipboard_monitor(app.handle());
            }
            // Start global mouse hook for auto text-select toolbar
            mouse_hook::start_mouse_hook();
            // Start Windows editable-input monitor for the floating AI handle
            start_input_ai_handle_monitor();
            crash_log::record("startup", "tauri setup complete");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            reload_store,
            get_text,
            cut_image,
            get_base64,
            copy_img,
            system_ocr,
            rapid_ocr,
            run_binary,
            register_shortcut_by_frontend,
            update_tray,
            updater_window,
            screenshot,
            lang_detect,
            webdav,
            local,
            install_plugin,
            font_list,
            aliyun,
            paste_result,
            replace_input_text,
            write_clipboard,
            fill_autotab,
            phrase_inline::phrase_inline_fill,
            phrase_inline::phrase_inline_dismiss,
            open_explain_window,
            open_translate_from_toolbar,
            open_light_ai_from_input_handle,
            collapse_light_ai_from_input_handle,
            open_chat_window,
            open_phrases_window,
            open_vault_window,
            open_vault_quick_add,
            open_vault_quick_fill,
            get_vault_mode,
            get_light_ai_target,
            take_pending_chat_http_text,
            take_pending_tts_text,
            set_translate_excerpt_mode,
            save_prev_window,
            open_login_window
        ])
        .on_system_tray_event(tray_event_handler)
        .build(context)
        .expect("error while running tauri application")
        // 窗口关闭不退出
        .run(|_app_handle, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
            }
        });
}
