use crate::config::{get, reload};
use crate::phrases::open_phrases_window;
use crate::vault::{vault_quick_add_window, vault_quick_fill_window};
use crate::window::{input_translate, ocr_recognize, ocr_translate, selection_light_ai, selection_translate};
use log::info;
use once_cell::sync::Lazy;
use rdev::Key;
use std::sync::Mutex;
use std::time::Instant;

struct DoubleTapState {
    last_key: Option<Key>,
    last_time: Option<Instant>,
}

static STATE: Lazy<Mutex<DoubleTapState>> = Lazy::new(|| {
    Mutex::new(DoubleTapState {
        last_key: None,
        last_time: None,
    })
});

/// Double-tap detection interval in milliseconds.
const INTERVAL_MS: u128 = 300;

/// Convert an rdev Key to the config string stored by the frontend.
/// Uses the Debug representation which matches what the JS side stores.
fn key_to_str(key: Key) -> String {
    format!("{:?}", key)
}

/// Called by mouse_hook for every KeyPress event.
/// Detects same-key double-tap within INTERVAL_MS and dispatches the configured action.
pub fn handle_key_press(key: Key) {
    let now = Instant::now();

    let triggered = {
        let mut state = STATE.lock().unwrap_or_else(|e| e.into_inner());

        if let (Some(last_key), Some(last_time)) = (state.last_key, state.last_time) {
            if last_key == key && last_time.elapsed().as_millis() < INTERVAL_MS {
                // Double-tap confirmed — clear state and signal a trigger
                state.last_key = None;
                state.last_time = None;
                true
            } else {
                // Different key or too slow — reset to current key
                state.last_key = Some(key);
                state.last_time = Some(now);
                false
            }
        } else {
            // First press ever
            state.last_key = Some(key);
            state.last_time = Some(now);
            false
        }
    };

    if triggered {
        let key_str = key_to_str(key);
        info!("Double-tap detected: {}", key_str);
        dispatch(&key_str);
    }
}

/// Look up which action (if any) is configured for the given key string and run it.
fn dispatch(key_str: &str) {
    // Reload config so we always see the latest frontend-saved values.
    reload();

    let actions: &[(&str, fn())] = &[
        ("doubletap_selection_translate", selection_translate),
        ("doubletap_input_translate", input_translate),
        ("doubletap_ocr_recognize", ocr_recognize),
        ("doubletap_ocr_translate", ocr_translate),
        ("doubletap_light_ai", selection_light_ai),
        ("doubletap_vault_quick_add", vault_quick_add_window),
        ("doubletap_vault_quick_fill", vault_quick_fill_window),
        ("doubletap_phrases", open_phrases_window),
    ];

    for (config_name, action_fn) in actions {
        if let Some(val) = get(config_name) {
            if val.as_str().unwrap_or("") == key_str {
                info!("Double-tap hotkey: {} → {}", key_str, config_name);
                let action = *action_fn;
                std::thread::spawn(move || action());
                return;
            }
        }
    }
}
