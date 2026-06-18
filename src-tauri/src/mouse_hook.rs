use crate::config::{get, reload};
use crate::crash_log;
use crate::window::{
    auto_selection_explain, auto_selection_light_ai, auto_selection_translate, float_toolbar_window,
    save_foreground_window,
};
use crate::StringWrapper;
use crate::APP;
use log::{debug, warn};
use rdev::{listen, Button, Event, EventType};
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU64, Ordering};
use tauri::Manager;

// Atomic state shared between the rdev callback and spawned threads
static MOUSE_DOWN: AtomicBool = AtomicBool::new(false);
static LAST_X: AtomicI64 = AtomicI64::new(0);
static LAST_Y: AtomicI64 = AtomicI64::new(0);
static PRESS_X: AtomicI64 = AtomicI64::new(0);
static PRESS_Y: AtomicI64 = AtomicI64::new(0);
static MOVE_INTENT_NEXT_GUARD_ID: AtomicU64 = AtomicU64::new(1);
static MOVE_INTENT_ACTIVE_GUARD_ID: AtomicU64 = AtomicU64::new(0);
static MOVE_INTENT_PRESS_ACTIVE: AtomicBool = AtomicBool::new(false);
static MOVE_INTENT_PRESS_X: AtomicI64 = AtomicI64::new(0);
static MOVE_INTENT_PRESS_Y: AtomicI64 = AtomicI64::new(0);
static MOVE_INTENT_CANCEL_GUARD_ID: AtomicU64 = AtomicU64::new(0);
static MOVE_INTENT_SUPPRESS_CURRENT_RELEASE: AtomicBool = AtomicBool::new(false);
static FLOAT_TOOLBAR_PRESS_ACTIVE: AtomicBool = AtomicBool::new(false);

const MIN_DRAG_SQ: i64 = 10 * 10; // 10 px minimum drag
const MOVE_INTENT_DRAG_SQ: i64 = 8 * 8;

fn hide_float_toolbar() {
    if let Some(app) = APP.get() {
        if let Some(w) = app.get_window("float_toolbar") {
            let _ = w.hide();
        }
    }
}

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
/// (show toolbar / open translate window / open explain window / disabled)
/// based on `text_select_behavior` config.
pub fn start_mouse_hook() {
    crash_log::record("mouse_hook", "starting hook thread");
    std::thread::Builder::new()
        .name("mouse_hook".to_string())
        .spawn(|| {
            crash_log::record("mouse_hook", "listen start");
            if let Err(e) = listen(handle_event) {
                crash_log::record("mouse_hook", format!("listen stopped error={:?}", e));
                warn!("Mouse hook stopped with error: {:?}", e);
            }
        })
        .expect("Failed to spawn mouse_hook thread");
    crash_log::record("mouse_hook", "hook thread spawned");
    debug!("Mouse hook thread started");
}

fn handle_event(event: Event) {
    match event.event_type {
        // Track mouse position continuously
        EventType::MouseMove { x, y } => {
            let current_x = x as i64;
            let current_y = y as i64;
            LAST_X.store(current_x, Ordering::Relaxed);
            LAST_Y.store(current_y, Ordering::Relaxed);

            if MOVE_INTENT_PRESS_ACTIVE.load(Ordering::SeqCst) {
                let dx = current_x - MOVE_INTENT_PRESS_X.load(Ordering::SeqCst);
                let dy = current_y - MOVE_INTENT_PRESS_Y.load(Ordering::SeqCst);
                if dx * dx + dy * dy >= MOVE_INTENT_DRAG_SQ {
                    let guard_id = MOVE_INTENT_ACTIVE_GUARD_ID.load(Ordering::SeqCst);
                    MOVE_INTENT_CANCEL_GUARD_ID.store(guard_id, Ordering::SeqCst);
                    MOVE_INTENT_SUPPRESS_CURRENT_RELEASE.store(true, Ordering::SeqCst);
                    crate::selection_capture::clear_auto_toolbar_pending_selection();
                    hide_float_toolbar();
                }
            }
        }

        // Record press position
        EventType::ButtonPress(Button::Left) => {
            let press_x = LAST_X.load(Ordering::Relaxed);
            let press_y = LAST_Y.load(Ordering::Relaxed);
            let pressed_toolbar = point_inside_float_toolbar(press_x, press_y);
            MOUSE_DOWN.store(true, Ordering::SeqCst);
            PRESS_X.store(press_x, Ordering::SeqCst);
            PRESS_Y.store(press_y, Ordering::SeqCst);
            FLOAT_TOOLBAR_PRESS_ACTIVE.store(pressed_toolbar, Ordering::SeqCst);

            if crate::selection_capture::has_auto_toolbar_pending_selection()
                && !pressed_toolbar
            {
                MOVE_INTENT_PRESS_ACTIVE.store(true, Ordering::SeqCst);
                MOVE_INTENT_SUPPRESS_CURRENT_RELEASE.store(false, Ordering::SeqCst);
                MOVE_INTENT_PRESS_X.store(press_x, Ordering::SeqCst);
                MOVE_INTENT_PRESS_Y.store(press_y, Ordering::SeqCst);
            } else {
                MOVE_INTENT_PRESS_ACTIVE.store(false, Ordering::SeqCst);
                MOVE_INTENT_SUPPRESS_CURRENT_RELEASE.store(false, Ordering::SeqCst);
            }
        }

        // On release, check if it was a drag and trigger toolbar if configured
        EventType::ButtonRelease(Button::Left) => {
            if !MOUSE_DOWN.swap(false, Ordering::SeqCst) {
                return;
            }
            MOVE_INTENT_PRESS_ACTIVE.store(false, Ordering::SeqCst);
            let was_toolbar_press = FLOAT_TOOLBAR_PRESS_ACTIVE.swap(false, Ordering::SeqCst);
            if MOVE_INTENT_SUPPRESS_CURRENT_RELEASE.swap(false, Ordering::SeqCst) {
                return;
            }

            // Calculate drag distance (squared, avoid sqrt for perf)
            let dx = LAST_X.load(Ordering::Relaxed) - PRESS_X.load(Ordering::SeqCst);
            let dy = LAST_Y.load(Ordering::Relaxed) - PRESS_Y.load(Ordering::SeqCst);
            let drag_sq = dx * dx + dy * dy;
            let click_x = LAST_X.load(Ordering::Relaxed);
            let click_y = LAST_Y.load(Ordering::Relaxed);
            let selection_marker = crate::selection_capture::current_marker();
            let mut move_guard_id = 0;

            if drag_sq >= MIN_DRAG_SQ && !was_toolbar_press {
                move_guard_id = MOVE_INTENT_NEXT_GUARD_ID.fetch_add(1, Ordering::SeqCst);
                MOVE_INTENT_ACTIVE_GUARD_ID.store(move_guard_id, Ordering::SeqCst);
                MOVE_INTENT_PRESS_ACTIVE.store(false, Ordering::SeqCst);
                crate::selection_capture::set_auto_toolbar_pending_selection(
                    selection_marker,
                    click_x.clamp(i32::MIN as i64, i32::MAX as i64) as i32,
                    click_y.clamp(i32::MIN as i64, i32::MAX as i64) as i32,
                );
            }

            // Keep the low-level hook callback minimal. Window queries, config I/O,
            // and selection capture all happen after we return control to USER32.
            std::thread::spawn(move || {
                // Reload config from disk so we always see the latest JS-side settings.
                reload();

                // Check text_select_behavior (default: "toolbar").
                // Do NOT write a default value here — that would overwrite the user's setting.
                let behavior = match get("text_select_behavior") {
                    Some(v) => v.as_str().unwrap_or("toolbar").to_string(),
                    None => "toolbar".to_string(),
                };
                if behavior == "disabled" {
                    crate::selection_capture::clear_auto_toolbar_pending_selection();
                    return;
                }

                if drag_sq < MIN_DRAG_SQ || was_toolbar_press {
                    // Single click (no drag): hide the floating toolbar if it is visible.
                    // Clicking inside the toolbar should be handled by the toolbar itself.
                    // Clicking outside still dismisses it.
                    if behavior == "toolbar" {
                        if point_inside_float_toolbar(click_x, click_y) {
                            return;
                        }

                        std::thread::sleep(std::time::Duration::from_millis(50));
                        crate::selection_capture::clear_auto_toolbar_pending_selection();
                        if let Some(app) = APP.get() {
                            if let Some(w) = app.get_window("float_toolbar") {
                                let _ = w.hide();
                            }
                        }
                    }
                    return;
                }

                crash_log::record(
                    "mouse_hook",
                    format!(
                        "drag worker start drag_sq={} behavior={}",
                        drag_sq, behavior
                    ),
                );

                let min_len: usize = match get("text_select_min_length") {
                    Some(v) => v.as_i64().unwrap_or(2).max(1) as usize,
                    None => 2,
                };

                // Save foreground window BEFORE showing toolbar so paste_result can restore it.
                save_foreground_window();

                let move_intent_cancelled =
                    MOVE_INTENT_CANCEL_GUARD_ID.load(Ordering::SeqCst) == move_guard_id;
                if move_intent_cancelled {
                    crash_log::record("mouse_hook", "skip capture: post-selection move intent");
                    return;
                }

                if crate::vault::quick_add_capture_active() {
                    let text = crate::selection_capture::capture_auto_toolbar_pending_selection();
                    let trimmed = text.trim().to_string();
                    let _ = crate::vault::handle_quick_add_capture(&trimmed);
                    return;
                }

                match behavior.as_str() {
                    "direct_translate" => {
                        let text = crate::selection_capture::capture_auto_toolbar_pending_selection();
                        let trimmed = text.trim().to_string();
                        if crate::vault::handle_quick_add_capture(&trimmed)
                            || trimmed.len() < min_len
                        {
                            return;
                        }
                        crash_log::record("mouse_hook", "opening auto translate");
                        auto_selection_translate(trimmed);
                    }
                    "direct_explain" => {
                        let text = crate::selection_capture::capture_auto_toolbar_pending_selection();
                        let trimmed = text.trim().to_string();
                        if crate::vault::handle_quick_add_capture(&trimmed)
                            || trimmed.len() < min_len
                        {
                            return;
                        }
                        crash_log::record("mouse_hook", "opening auto explain");
                        auto_selection_explain(trimmed);
                    }
                    "direct_light_ai" => {
                        let text = crate::selection_capture::capture_auto_toolbar_pending_selection();
                        let trimmed = text.trim().to_string();
                        if crate::vault::handle_quick_add_capture(&trimmed)
                            || trimmed.len() < min_len
                        {
                            return;
                        }
                        crash_log::record("mouse_hook", "opening auto light ai");
                        auto_selection_light_ai(trimmed);
                    }
                    _ => {
                        if let Some(app) = APP.get() {
                            let state: tauri::State<StringWrapper> = app.state();
                            state.0.lock().unwrap().clear();
                        }
                        crash_log::record("mouse_hook", "opening float toolbar");
                        float_toolbar_window();
                    }
                }
                debug!("Auto-select toolbar triggered");
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
