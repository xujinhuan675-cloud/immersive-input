use crate::config::{get, reload};
use crate::window::{direct_translate_selection, float_toolbar_window, save_foreground_window};
use crate::StringWrapper;
use crate::APP;
use log::{debug, warn};
use rdev::{listen, Button, Event, EventType};
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use tauri::Manager;

// Atomic state shared between the rdev callback and spawned threads
static MOUSE_DOWN: AtomicBool = AtomicBool::new(false);
static LAST_X: AtomicI64 = AtomicI64::new(0);
static LAST_Y: AtomicI64 = AtomicI64::new(0);
static PRESS_X: AtomicI64 = AtomicI64::new(0);
static PRESS_Y: AtomicI64 = AtomicI64::new(0);

fn point_inside_float_toolbar(x: i64, y: i64) -> bool {
    let Some(app) = APP.get() else {
        return false;
    };
    let Some(window) = app.get_window("float_toolbar") else {
        return false;
    };

    if !window.is_visible().unwrap_or(false) {
        return false;
    }

    let Ok(position) = window.outer_position() else {
        return false;
    };
    let Ok(size) = window.outer_size() else {
        return false;
    };

    let left = position.x as i64;
    let top = position.y as i64;
    let right = left + size.width as i64;
    let bottom = top + size.height as i64;

    x >= left && x <= right && y >= top && y <= bottom
}

/// Start the global mouse hook in a background thread.
/// Detects left-button drag → release events and triggers the configured behavior
/// (show toolbar / direct translate / disabled) based on `text_select_behavior` config.
pub fn start_mouse_hook() {
    std::thread::Builder::new()
        .name("mouse_hook".to_string())
        .spawn(|| {
            if let Err(e) = listen(handle_event) {
                warn!("Mouse hook stopped with error: {:?}", e);
            }
        })
        .expect("Failed to spawn mouse_hook thread");
    debug!("Mouse hook thread started");
}

fn handle_event(event: Event) {
    match event.event_type {
        // Track mouse position continuously
        EventType::MouseMove { x, y } => {
            LAST_X.store(x as i64, Ordering::Relaxed);
            LAST_Y.store(y as i64, Ordering::Relaxed);
        }

        // Record press position
        EventType::ButtonPress(Button::Left) => {
            MOUSE_DOWN.store(true, Ordering::SeqCst);
            PRESS_X.store(LAST_X.load(Ordering::Relaxed), Ordering::SeqCst);
            PRESS_Y.store(LAST_Y.load(Ordering::Relaxed), Ordering::SeqCst);
        }

        // On release, check if it was a drag and trigger toolbar if configured
        EventType::ButtonRelease(Button::Left) => {
            if !MOUSE_DOWN.swap(false, Ordering::SeqCst) {
                return;
            }

            // Reload config from disk so we always see the latest JS-side settings.
            reload();

            // Check text_select_behavior (default: "toolbar").
            // Do NOT write a default value here — that would overwrite the user's setting.
            let behavior = match get("text_select_behavior") {
                Some(v) => v.as_str().unwrap_or("toolbar").to_string(),
                None => "toolbar".to_string(),
            };
            if behavior == "disabled" {
                return;
            }

            // Calculate drag distance (squared, avoid sqrt for perf)
            let dx = LAST_X.load(Ordering::Relaxed) - PRESS_X.load(Ordering::SeqCst);
            let dy = LAST_Y.load(Ordering::Relaxed) - PRESS_Y.load(Ordering::SeqCst);
            let drag_sq = dx * dx + dy * dy;
            const MIN_DRAG_SQ: i64 = 10 * 10; // 10 px minimum drag
            if drag_sq < MIN_DRAG_SQ {
                // Single click (no drag): hide the floating toolbar if it is visible.
                // Clicking inside the toolbar should be handled by the toolbar itself.
                // Clicking outside still dismisses it.
                if behavior == "toolbar" {
                    let click_x = LAST_X.load(Ordering::Relaxed);
                    let click_y = LAST_Y.load(Ordering::Relaxed);
                    if point_inside_float_toolbar(click_x, click_y) {
                        return;
                    }

                    std::thread::spawn(|| {
                        std::thread::sleep(std::time::Duration::from_millis(50));
                        if let Some(app) = APP.get() {
                            if let Some(w) = app.get_window("float_toolbar") {
                                let _ = w.hide();
                            }
                        }
                    });
                }
                return;
            }

            // Read timing config
            let delay_ms: u64 = match get("text_select_delay_ms") {
                Some(v) => v.as_i64().unwrap_or(300).clamp(50, 3000) as u64,
                None => 300,
            };
            let min_len: usize = match get("text_select_min_length") {
                Some(v) => v.as_i64().unwrap_or(2).max(1) as usize,
                None => 2,
            };

            let selection_marker = crate::selection_capture::current_marker();
            // Save foreground window BEFORE showing toolbar so paste_result can restore it
            save_foreground_window();

            // Off-load the slow selection.get_text() to a thread so we don't block rdev
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(delay_ms));

                let text = crate::selection_capture::get_text(Some(selection_marker));
                let trimmed = text.trim().to_string();

                // Vault quick add capture: consume this selection and skip normal toolbar flow.
                // Deliberately placed before min_len check so short passwords are also accepted.
                if crate::vault::handle_quick_add_capture(&trimmed) {
                    return;
                }

                if trimmed.len() < min_len {
                    return;
                }

                // Write text into shared state
                if let Some(app) = APP.get() {
                    let state: tauri::State<StringWrapper> = app.state();
                    state.0.lock().unwrap().replace_range(.., &trimmed);
                }

                let text_len = trimmed.len();
                if behavior == "direct_translate" {
                    direct_translate_selection(trimmed);
                } else {
                    float_toolbar_window();
                }
                debug!("Auto-select toolbar triggered ({}chars)", text_len);
            });
        }

        EventType::KeyPress(key) => {
            crate::selection_capture::handle_key_press(key);
            crate::doubletap_hook::handle_key_press(key);
            crate::focused_input::handle_key_press(key);
        }

        EventType::KeyRelease(key) => {
            crate::selection_capture::handle_key_release(key);
            crate::focused_input::handle_key_release(key);
        }

        _ => {}
    }
}
