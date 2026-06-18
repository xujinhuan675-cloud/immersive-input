use crate::config::{get, reload, set};
use crate::phrases::open_phrases_window;
use crate::tray::update_tray;
use crate::vault::{vault_quick_add_window, vault_quick_fill_window};
use crate::window::{
    input_translate, ocr_recognize, ocr_translate, selection_explain, selection_light_ai,
};
use crate::APP;
use log::{debug, warn};
use tauri::{AppHandle, GlobalShortcutManager, Manager};

const TEXT_SELECT_BEHAVIOR_KEY: &str = "text_select_behavior";
const LAST_TEXT_SELECT_BEHAVIOR_KEY: &str = "text_select_last_enabled_behavior";
const DEFAULT_TEXT_SELECT_BEHAVIOR: &str = "toolbar";

fn is_enabled_text_select_behavior(value: &str) -> bool {
    matches!(
        value,
        "toolbar" | "direct_translate" | "direct_explain" | "direct_light_ai"
    )
}

fn hide_float_toolbar(app_handle: &AppHandle) {
    if let Some(window) = app_handle.get_window("float_toolbar") {
        let _ = window.hide();
    }
}

pub fn toggle_text_select_behavior() {
    let app_handle = APP.get().unwrap();
    reload();

    let current = get(TEXT_SELECT_BEHAVIOR_KEY)
        .and_then(|value| value.as_str().map(ToString::to_string))
        .unwrap_or_else(|| DEFAULT_TEXT_SELECT_BEHAVIOR.to_string());

    let next = if current == "disabled" {
        get(LAST_TEXT_SELECT_BEHAVIOR_KEY)
            .and_then(|value| value.as_str().map(ToString::to_string))
            .filter(|value| is_enabled_text_select_behavior(value))
            .unwrap_or_else(|| DEFAULT_TEXT_SELECT_BEHAVIOR.to_string())
    } else {
        if is_enabled_text_select_behavior(&current) {
            set(LAST_TEXT_SELECT_BEHAVIOR_KEY, current.as_str());
        }
        hide_float_toolbar(app_handle);
        crate::selection_capture::clear_auto_toolbar_pending_selection();
        "disabled".to_string()
    };

    set(TEXT_SELECT_BEHAVIOR_KEY, next.as_str());
    app_handle
        .emit_all("text_select_behavior_changed", next.as_str())
        .unwrap_or_default();
    update_tray(app_handle.clone(), "".to_string(), "".to_string());
}

pub fn set_text_select_behavior(mode: &str) {
    let app_handle = APP.get().unwrap();
    if is_enabled_text_select_behavior(mode) {
        set(LAST_TEXT_SELECT_BEHAVIOR_KEY, mode);
    }
    if mode == "disabled" {
        hide_float_toolbar(app_handle);
        crate::selection_capture::clear_auto_toolbar_pending_selection();
    }
    set(TEXT_SELECT_BEHAVIOR_KEY, mode);
    app_handle
        .emit_all("text_select_behavior_changed", mode)
        .unwrap_or_default();
    update_tray(app_handle.clone(), "".to_string(), "".to_string());
}

fn register<F>(app_handle: &AppHandle, name: &str, handler: F, key: &str) -> Result<(), String>
where
    F: Fn() + Send + 'static,
{
    let hotkey = {
        if key.is_empty() {
            match get(name) {
                Some(v) => v.as_str().unwrap().to_string(),
                None => {
                    set(name, "");
                    String::new()
                }
            }
        } else {
            key.to_string()
        }
    };

    if !hotkey.is_empty() {
        // Try to unregister the old shortcut first (ignore errors if it doesn't exist)
        let _ = app_handle
            .global_shortcut_manager()
            .unregister(hotkey.as_str());

        match app_handle
            .global_shortcut_manager()
            .register(hotkey.as_str(), handler)
        {
            Ok(()) => {
                debug!("Registered global shortcut: {} for {}", hotkey, name);
            }
            Err(e) => {
                warn!("Failed to register global shortcut: {} {:?}", hotkey, e);
                return Err(e.to_string());
            }
        };
    }
    Ok(())
}

// Register global shortcuts
pub fn register_shortcut(shortcut: &str) -> Result<(), String> {
    let app_handle = APP.get().unwrap();
    match shortcut {
        "hotkey_input_translate" => {
            register(app_handle, "hotkey_input_translate", input_translate, "")?
        }
        "hotkey_ocr_recognize" => register(app_handle, "hotkey_ocr_recognize", ocr_recognize, "")?,
        "hotkey_ocr_translate" => register(app_handle, "hotkey_ocr_translate", ocr_translate, "")?,
        "hotkey_light_ai" => register(app_handle, "hotkey_light_ai", selection_light_ai, "")?,
        "hotkey_explain" => register(app_handle, "hotkey_explain", selection_explain, "")?,
        "hotkey_text_select_toggle" => register(
            app_handle,
            "hotkey_text_select_toggle",
            toggle_text_select_behavior,
            "",
        )?,
        "hotkey_vault_quick_add" => register(
            app_handle,
            "hotkey_vault_quick_add",
            vault_quick_add_window,
            "",
        )?,
        "hotkey_vault_quick_fill" => register(
            app_handle,
            "hotkey_vault_quick_fill",
            vault_quick_fill_window,
            "",
        )?,
        "hotkey_phrases" => register(app_handle, "hotkey_phrases", open_phrases_window, "")?,
        "all" => {
            register(app_handle, "hotkey_input_translate", input_translate, "")?;
            register(app_handle, "hotkey_ocr_recognize", ocr_recognize, "")?;
            register(app_handle, "hotkey_ocr_translate", ocr_translate, "")?;
            register(app_handle, "hotkey_light_ai", selection_light_ai, "")?;
            register(app_handle, "hotkey_explain", selection_explain, "")?;
            register(
                app_handle,
                "hotkey_text_select_toggle",
                toggle_text_select_behavior,
                "",
            )?;
            register(
                app_handle,
                "hotkey_vault_quick_add",
                vault_quick_add_window,
                "",
            )?;
            register(
                app_handle,
                "hotkey_vault_quick_fill",
                vault_quick_fill_window,
                "",
            )?;
            register(app_handle, "hotkey_phrases", open_phrases_window, "")?;
        }
        _ => {}
    }
    Ok(())
}

#[tauri::command]
pub fn register_shortcut_by_frontend(name: &str, shortcut: &str) -> Result<(), String> {
    let app_handle = APP.get().unwrap();
    match name {
        "hotkey_input_translate" => register(
            app_handle,
            "hotkey_input_translate",
            input_translate,
            shortcut,
        )?,
        "hotkey_ocr_recognize" => {
            register(app_handle, "hotkey_ocr_recognize", ocr_recognize, shortcut)?
        }
        "hotkey_ocr_translate" => {
            register(app_handle, "hotkey_ocr_translate", ocr_translate, shortcut)?
        }
        "hotkey_light_ai" => register(app_handle, "hotkey_light_ai", selection_light_ai, shortcut)?,
        "hotkey_explain" => register(app_handle, "hotkey_explain", selection_explain, shortcut)?,
        "hotkey_text_select_toggle" => register(
            app_handle,
            "hotkey_text_select_toggle",
            toggle_text_select_behavior,
            shortcut,
        )?,
        "hotkey_vault_quick_add" => register(
            app_handle,
            "hotkey_vault_quick_add",
            vault_quick_add_window,
            shortcut,
        )?,
        "hotkey_vault_quick_fill" => register(
            app_handle,
            "hotkey_vault_quick_fill",
            vault_quick_fill_window,
            shortcut,
        )?,
        "hotkey_phrases" => register(app_handle, "hotkey_phrases", open_phrases_window, shortcut)?,
        _ => {}
    }
    Ok(())
}
