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
fn key_to_str(key: Key) -> String {
    format!("{:?}", key)
}

/// Returns true if the key produces a visible character when typed into a text field.
/// Used to determine whether to clean up the 2 trigger chars before running the action.
fn key_produces_char(key: Key) -> bool {
    matches!(
        key,
        Key::KeyA | Key::KeyB | Key::KeyC | Key::KeyD | Key::KeyE
        | Key::KeyF | Key::KeyG | Key::KeyH | Key::KeyI | Key::KeyJ
        | Key::KeyK | Key::KeyL | Key::KeyM | Key::KeyN | Key::KeyO
        | Key::KeyP | Key::KeyQ | Key::KeyR | Key::KeyS | Key::KeyT
        | Key::KeyU | Key::KeyV | Key::KeyW | Key::KeyX | Key::KeyY | Key::KeyZ
        | Key::Num0 | Key::Num1 | Key::Num2 | Key::Num3 | Key::Num4
        | Key::Num5 | Key::Num6 | Key::Num7 | Key::Num8 | Key::Num9
        | Key::Space
        | Key::BackQuote | Key::Minus | Key::Equal
        | Key::LeftBracket | Key::RightBracket | Key::BackSlash
        | Key::SemiColon | Key::Quote | Key::Comma | Key::Dot | Key::Slash
    )
}

/// Send 2 Backspace keypresses to the currently focused window,
/// erasing the 2 trigger characters the user just typed.
fn delete_doubletap_chars() {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            SendInput, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, INPUT, INPUT_0, INPUT_KEYBOARD,
            KEYBDINPUT, VK_BACK,
        };
        let no_scan: u16 = 0;
        let no_flags = KEYBD_EVENT_FLAGS(0);
        for _ in 0..2 {
            let bs = [
                INPUT {
                    r#type: INPUT_KEYBOARD,
                    Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: VK_BACK, wScan: no_scan, dwFlags: no_flags, time: 0, dwExtraInfo: 0 } },
                },
                INPUT {
                    r#type: INPUT_KEYBOARD,
                    Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: VK_BACK, wScan: no_scan, dwFlags: KEYEVENTF_KEYUP, time: 0, dwExtraInfo: 0 } },
                },
            ];
            unsafe { SendInput(&bs, std::mem::size_of::<INPUT>() as i32); }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
    }
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
        dispatch(key, &key_str);
    }
}

/// Look up which action (if any) is configured for the given key string and run it.
/// If the key produces a printable character, first delete the 2 typed trigger chars.
fn dispatch(key: Key, key_str: &str) {
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
                info!("Double-tap hotkey: {} \u{2192} {}", key_str, config_name);
                let produces_char = key_produces_char(key);
                let action = *action_fn;
                std::thread::spawn(move || {
                    // 删除输入框里已打出的两个触发字符
                    if produces_char {
                        delete_doubletap_chars();
                    }
                    action();
                });
                return;
            }
        }
    }
}
