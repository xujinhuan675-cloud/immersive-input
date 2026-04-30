use crate::config::{get, set};
use crate::window::{chat_explain_window_with_text, light_ai_window, set_light_ai_target, text_translate};
use crate::{StringWrapper, APP};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, ClipboardManager, Manager};

pub const COPY_ACTION_MODE_TRANSLATE: &str = "translate";
pub const COPY_ACTION_MODE_LIGHT_AI: &str = "light_ai";
pub const COPY_ACTION_MODE_EXPLAIN: &str = "explain";
pub const COPY_ACTION_MODE_OFF: &str = "off";

const CLIPBOARD_ACTION_MODE_KEY: &str = "clipboard_action_mode";
const LEGACY_CLIPBOARD_MONITOR_KEY: &str = "clipboard_monitor";
const INTERNAL_CLIPBOARD_WRITE_TTL: Duration = Duration::from_secs(2);

pub struct ClipboardActionModeWrapper(pub Mutex<String>);

#[derive(Default)]
pub struct ClipboardWriteGuard {
    text: String,
    written_at: Option<Instant>,
}

pub struct ClipboardWriteGuardWrapper(pub Mutex<ClipboardWriteGuard>);

fn normalize_clipboard_action_mode(mode: &str) -> &str {
    match mode {
        COPY_ACTION_MODE_TRANSLATE
        | COPY_ACTION_MODE_LIGHT_AI
        | COPY_ACTION_MODE_EXPLAIN
        | COPY_ACTION_MODE_OFF => mode,
        _ => COPY_ACTION_MODE_OFF,
    }
}

fn legacy_clipboard_monitor_enabled() -> bool {
    match get(LEGACY_CLIPBOARD_MONITOR_KEY) {
        Some(value) => value.as_bool().unwrap_or(false),
        None => false,
    }
}

fn persist_clipboard_action_mode(mode: &str) {
    set(CLIPBOARD_ACTION_MODE_KEY, mode);
    set(LEGACY_CLIPBOARD_MONITOR_KEY, clipboard_action_enabled(mode));
}

pub fn clipboard_action_enabled(mode: &str) -> bool {
    normalize_clipboard_action_mode(mode) != COPY_ACTION_MODE_OFF
}

pub fn get_clipboard_action_mode() -> String {
    if let Some(value) = get(CLIPBOARD_ACTION_MODE_KEY) {
        if let Some(mode) = value.as_str() {
            let normalized = normalize_clipboard_action_mode(mode);
            if normalized != mode
                || legacy_clipboard_monitor_enabled() != clipboard_action_enabled(normalized)
            {
                persist_clipboard_action_mode(normalized);
            }
            return normalized.to_string();
        }
    }

    let mode = if legacy_clipboard_monitor_enabled() {
        COPY_ACTION_MODE_TRANSLATE
    } else {
        COPY_ACTION_MODE_OFF
    };
    persist_clipboard_action_mode(mode);
    mode.to_string()
}

pub fn set_clipboard_action_mode(mode: &str) {
    let normalized = normalize_clipboard_action_mode(mode);
    persist_clipboard_action_mode(normalized);
}

pub fn remember_internal_clipboard_write(text: &str) {
    let Some(app_handle) = APP.get() else {
        return;
    };
    let state = app_handle.state::<ClipboardWriteGuardWrapper>();
    let mut guard = state.0.lock().unwrap();
    guard.text.clear();
    guard.text.push_str(text);
    guard.written_at = Some(Instant::now());
}

fn should_ignore_internal_clipboard_write(text: &str) -> bool {
    let Some(app_handle) = APP.get() else {
        return false;
    };
    let state = app_handle.state::<ClipboardWriteGuardWrapper>();
    let mut guard = state.0.lock().unwrap();

    let Some(written_at) = guard.written_at else {
        return false;
    };

    if written_at.elapsed() > INTERNAL_CLIPBOARD_WRITE_TTL {
        guard.text.clear();
        guard.written_at = None;
        return false;
    }

    if guard.text == text {
        guard.text.clear();
        guard.written_at = None;
        return true;
    }

    false
}

fn open_light_ai_for_text(handle: &AppHandle, text: &str, target: &str) {
    let clean = text.trim();
    if clean.is_empty() {
        return;
    }

    let str_state: tauri::State<StringWrapper> = handle.state();
    *str_state.0.lock().unwrap() = clean.to_string();
    set_light_ai_target(target);
    light_ai_window();
}

fn open_explain_for_text(text: &str) {
    let clean = text.trim();
    if clean.is_empty() {
        return;
    }

    chat_explain_window_with_text(clean.to_string());
}

pub fn start_clipboard_monitor(app_handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut pre_text = String::new();
        loop {
            let handle = app_handle.app_handle();
            let state = handle.state::<ClipboardActionModeWrapper>();
            if let Ok(clipboard_action_mode) = state.0.try_lock() {
                let mode =
                    normalize_clipboard_action_mode(clipboard_action_mode.as_str()).to_string();
                if !clipboard_action_enabled(&mode) {
                    break;
                }

                if let Ok(Some(text)) = app_handle.clipboard_manager().read_text() {
                    if text != pre_text {
                        if should_ignore_internal_clipboard_write(&text) {
                            pre_text = text;
                            std::thread::sleep(std::time::Duration::from_millis(500));
                            continue;
                        }

                        match mode.as_str() {
                            COPY_ACTION_MODE_LIGHT_AI => {
                                open_light_ai_for_text(&handle, &text, "clipboard");
                            }
                            COPY_ACTION_MODE_EXPLAIN => {
                                open_explain_for_text(&text);
                            }
                            _ => {
                                let hash_trigger = match get("light_ai_hash_trigger") {
                                    Some(val) => val.as_bool().unwrap_or(false),
                                    None => false,
                                };
                                if hash_trigger && text.trim_end().ends_with('#') {
                                    let clean = text.trim_end().trim_end_matches('#').trim();
                                    open_light_ai_for_text(&handle, clean, "clipboard");
                                } else {
                                    text_translate(text.clone());
                                }
                            }
                        }
                        pre_text = text;
                    }
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    });
}
