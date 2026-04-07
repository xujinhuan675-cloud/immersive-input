use crate::config::{get, reload};
use crate::window::{float_toolbar_window, direct_translate_selection, save_foreground_window};
use crate::StringWrapper;
use crate::APP;
use log::{info, warn};
use tauri::Manager;
use rdev::{listen, Button, Event, EventType};
use selection::get_text;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};

// Atomic state shared between the rdev callback and spawned threads
static MOUSE_DOWN: AtomicBool = AtomicBool::new(false);
static LAST_X: AtomicI64 = AtomicI64::new(0);
static LAST_Y: AtomicI64 = AtomicI64::new(0);
static PRESS_X: AtomicI64 = AtomicI64::new(0);
static PRESS_Y: AtomicI64 = AtomicI64::new(0);

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
    info!("Mouse hook thread started");
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

            // Save foreground window BEFORE showing toolbar so paste_result can restore it
            save_foreground_window();

            // Off-load the slow selection.get_text() to a thread so we don't block rdev
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(delay_ms));

                let text = get_text();
                let trimmed = text.trim().to_string();

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
                info!(
                    "Auto-select toolbar triggered ({}chars)",
                    text_len
                );
            });
        }

        EventType::KeyPress(key) => {
            crate::doubletap_hook::handle_key_press(key);
        }

        _ => {}
    }
}
