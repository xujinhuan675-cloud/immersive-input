use crate::config::{get, reload};
use crate::window::{
    hide_input_ai_handle_window, hide_light_ai_window, is_light_ai_opened_from_input_handle,
    is_light_ai_window_visible, light_ai_window_from_input_handle, restore_foreground_window,
    save_foreground_window, set_light_ai_opened_from_input_handle, show_input_ai_handle_window,
};
use crate::{LightAiTargetWrapper, StringWrapper, APP};
use log::debug;
use once_cell::sync::Lazy;
use rdev::Key;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::Manager;

#[derive(Clone, Default)]
pub struct FocusedInputRect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    #[allow(dead_code)]
    pub bottom: i32,
}

#[derive(Clone, Default)]
pub struct FocusedInputSnapshot {
    pub available: bool,
    pub text: String,
    #[allow(dead_code)]
    pub rect: Option<FocusedInputRect>,
    pub caret_rect: Option<FocusedInputRect>,
    pub target_key: String,
}

pub struct FocusedInputSnapshotWrapper(pub Mutex<FocusedInputSnapshot>);

const HANDLE_HEIGHT: i32 = 24;
const SHIFT_ENTER_TRIGGER_WINDOW_MS: u64 = 1800;
const HANDLE_MONITOR_INTERVAL_MS: u64 = 120;
const CONFIG_RELOAD_INTERVAL_MS: u64 = 800;
const HANDLE_UNAVAILABLE_GRACE_MS: u64 = 500;
const INPUT_AI_HANDLE_ENABLED_KEY: &str = "input_ai_handle_enabled";

static PROCESS_START: Lazy<Instant> = Lazy::new(Instant::now);
static SHIFT_DOWN: AtomicBool = AtomicBool::new(false);
static LAST_SHIFT_ENTER_TRIGGER_MS: AtomicU64 = AtomicU64::new(0);
static HANDLE_SUPPRESSED: AtomicBool = AtomicBool::new(false);
static LAST_SHIFT_ENTER_SNAPSHOT: Lazy<Mutex<Option<FocusedInputSnapshot>>> =
    Lazy::new(|| Mutex::new(None));

#[derive(Default)]
struct InputHandleMonitorState {
    current_target_key: String,
    visible_for_current_target: bool,
    last_applied_trigger_ms: u64,
    trigger_anchor_rect: Option<FocusedInputRect>,
    last_available_snapshot: Option<FocusedInputSnapshot>,
    last_available_ms: u64,
    enabled: bool,
    last_config_reload_ms: u64,
}

#[cfg(target_os = "windows")]
pub fn start_input_ai_handle_monitor() {
    std::thread::Builder::new()
        .name("input_ai_handle_monitor".to_string())
        .spawn(|| {
            let mut monitor_state = InputHandleMonitorState::default();

            loop {
                let Some(app_handle) = APP.get() else {
                    std::thread::sleep(Duration::from_millis(HANDLE_MONITOR_INTERVAL_MS));
                    continue;
                };

                let current_ms = current_marker();
                refresh_handle_enabled(&mut monitor_state, current_ms);

                if !monitor_state.enabled {
                    reset_monitor_state(&mut monitor_state);
                    {
                        let state: tauri::State<FocusedInputSnapshotWrapper> = app_handle.state();
                        *state.0.lock().unwrap() = FocusedInputSnapshot::default();
                    }
                    hide_input_ai_handle_window();
                    std::thread::sleep(Duration::from_millis(HANDLE_MONITOR_INTERVAL_MS));
                    continue;
                }

                let snapshot = capture_focused_input_snapshot().unwrap_or_default();

                if snapshot.available {
                    monitor_state.last_available_snapshot = Some(snapshot.clone());
                    monitor_state.last_available_ms = current_ms;
                }

                handle_snapshot_for_visibility(&snapshot, &mut monitor_state, current_ms);

                let snapshot_for_ui = if snapshot.available {
                    Some(snapshot.clone())
                } else if monitor_state.visible_for_current_target {
                    monitor_state.last_available_snapshot.clone()
                } else {
                    None
                };

                {
                    let state: tauri::State<FocusedInputSnapshotWrapper> = app_handle.state();
                    *state.0.lock().unwrap() = snapshot_for_ui.clone().unwrap_or_default();
                }

                if let Some(active_snapshot) = snapshot_for_ui.as_ref().filter(|_| monitor_state.visible_for_current_target)
                {
                    let _ = active_snapshot;
                    if let Some((x, y)) =
                        preferred_handle_position(monitor_state.trigger_anchor_rect.as_ref())
                    {
                        show_input_ai_handle_window(x, y);
                    } else {
                        hide_input_ai_handle_window();
                    }
                } else {
                    hide_input_ai_handle_window();
                }

                std::thread::sleep(Duration::from_millis(HANDLE_MONITOR_INTERVAL_MS));
            }
        })
        .expect("Failed to spawn input_ai_handle_monitor thread");
}

#[cfg(not(target_os = "windows"))]
pub fn start_input_ai_handle_monitor() {}

pub fn handle_key_press(key: Key) {
    if matches!(key, Key::ShiftLeft | Key::ShiftRight) {
        SHIFT_DOWN.store(true, Ordering::SeqCst);
        return;
    }

    if matches!(key, Key::Return | Key::KpReturn) && SHIFT_DOWN.load(Ordering::SeqCst) {
        reload();
        if !is_input_ai_handle_enabled() {
            return;
        }
        save_foreground_window();
        HANDLE_SUPPRESSED.store(false, Ordering::SeqCst);
        LAST_SHIFT_ENTER_TRIGGER_MS.store(current_marker(), Ordering::SeqCst);
        *LAST_SHIFT_ENTER_SNAPSHOT.lock().unwrap() = capture_focused_input_snapshot();
    }
}

pub fn handle_key_release(key: Key) {
    if matches!(key, Key::ShiftLeft | Key::ShiftRight) {
        SHIFT_DOWN.store(false, Ordering::SeqCst);
    }
}

fn current_marker() -> u64 {
    PROCESS_START.elapsed().as_millis().min(u64::MAX as u128) as u64
}

fn is_input_ai_handle_enabled() -> bool {
    get(INPUT_AI_HANDLE_ENABLED_KEY)
        .and_then(|value| value.as_bool())
        .unwrap_or(true)
}

fn refresh_handle_enabled(monitor_state: &mut InputHandleMonitorState, current_ms: u64) {
    if monitor_state.last_config_reload_ms == 0
        || current_ms.saturating_sub(monitor_state.last_config_reload_ms) >= CONFIG_RELOAD_INTERVAL_MS
    {
        reload();
        monitor_state.enabled = is_input_ai_handle_enabled();
        monitor_state.last_config_reload_ms = current_ms;
    }
}

fn reset_monitor_state(monitor_state: &mut InputHandleMonitorState) {
    monitor_state.current_target_key.clear();
    monitor_state.visible_for_current_target = false;
    monitor_state.last_applied_trigger_ms = 0;
    monitor_state.trigger_anchor_rect = None;
    monitor_state.last_available_snapshot = None;
    monitor_state.last_available_ms = 0;
}

fn handle_snapshot_for_visibility(
    snapshot: &FocusedInputSnapshot,
    monitor_state: &mut InputHandleMonitorState,
    current_ms: u64,
) {
    let keep_visible_for_open_light_ai =
        is_light_ai_opened_from_input_handle() && is_light_ai_window_visible();

    if HANDLE_SUPPRESSED.load(Ordering::SeqCst) {
        monitor_state.visible_for_current_target = false;
        monitor_state.trigger_anchor_rect = None;
        return;
    }

    if !snapshot.available {
        if keep_visible_for_open_light_ai
            && monitor_state.visible_for_current_target
            && monitor_state.trigger_anchor_rect.is_some()
        {
            return;
        }
        if monitor_state.visible_for_current_target
            && monitor_state.last_available_ms > 0
            && current_ms.saturating_sub(monitor_state.last_available_ms) <= HANDLE_UNAVAILABLE_GRACE_MS
        {
            return;
        }
        monitor_state.visible_for_current_target = false;
        monitor_state.trigger_anchor_rect = None;
        monitor_state.current_target_key.clear();
        return;
    }

    if snapshot.target_key != monitor_state.current_target_key {
        monitor_state.current_target_key = snapshot.target_key.clone();
        monitor_state.visible_for_current_target = false;
        monitor_state.last_applied_trigger_ms = 0;
        monitor_state.trigger_anchor_rect = None;
    }

    monitor_state.last_available_snapshot = Some(snapshot.clone());

    let latest_trigger_ms = LAST_SHIFT_ENTER_TRIGGER_MS.load(Ordering::SeqCst);
    let has_fresh_trigger = latest_trigger_ms > monitor_state.last_applied_trigger_ms
        && current_ms.saturating_sub(latest_trigger_ms) <= SHIFT_ENTER_TRIGGER_WINDOW_MS;

    if has_fresh_trigger {
        monitor_state.last_applied_trigger_ms = latest_trigger_ms;
        monitor_state.current_target_key = snapshot.target_key.clone();

        if monitor_state.trigger_anchor_rect.is_none() || !monitor_state.visible_for_current_target {
            let trigger_snapshot = LAST_SHIFT_ENTER_SNAPSHOT.lock().unwrap().clone();
            let next_anchor = trigger_snapshot
                .as_ref()
                .and_then(|value| value.caret_rect.clone())
                .or_else(|| snapshot.caret_rect.clone());
            monitor_state.trigger_anchor_rect = next_anchor;
        }

        monitor_state.visible_for_current_target = monitor_state.trigger_anchor_rect.is_some();
        return;
    }

    if monitor_state.visible_for_current_target && snapshot.target_key != monitor_state.current_target_key {
        monitor_state.visible_for_current_target = false;
        monitor_state.trigger_anchor_rect = None;
    }
}

fn preferred_handle_position(anchor_rect: Option<&FocusedInputRect>) -> Option<(i32, i32)> {
    let anchor_rect = anchor_rect?;
    let x = anchor_rect.right + 8;
    let y = anchor_rect.top - (HANDLE_HEIGHT / 2);
    Some((x.max(0), y.max(0)))
}

#[cfg(target_os = "windows")]
fn capture_focused_input_snapshot() -> Option<FocusedInputSnapshot> {
    use windows::Win32::Foundation::BOOL;
    use windows::Win32::System::Com::{CoCreateInstance, CoInitialize, SAFEARRAY, CLSCTX_ALL};
    use windows::Win32::System::Ole::{
        SafeArrayAccessData, SafeArrayDestroy, SafeArrayGetLBound, SafeArrayGetUBound,
        SafeArrayUnaccessData,
    };
    use windows::Win32::UI::Accessibility::{
        CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationTextPattern,
        IUIAutomationTextPattern2, IUIAutomationTextRange, IUIAutomationTreeWalker,
        IUIAutomationValuePattern, UIA_DocumentControlTypeId, UIA_EditControlTypeId,
        UIA_TextPattern2Id, UIA_TextPatternId, UIA_ValuePatternId,
    };

    fn rect_from_safearray(array: *mut SAFEARRAY) -> Option<FocusedInputRect> {
        if array.is_null() {
            return None;
        }

        let cleanup = |did_access: bool| {
            if did_access {
                unsafe {
                    SafeArrayUnaccessData(array).ok();
                }
            }
            unsafe {
                SafeArrayDestroy(array).ok();
            }
        };

        let lower_bound = unsafe { SafeArrayGetLBound(array, 1) }.ok()?;
        let upper_bound = unsafe { SafeArrayGetUBound(array, 1) }.ok()?;
        let value_count = (upper_bound - lower_bound + 1).max(0) as usize;
        if value_count < 4 {
            cleanup(false);
            return None;
        }

        let mut raw_data = std::ptr::null_mut();
        if unsafe { SafeArrayAccessData(array, &mut raw_data) }.is_err() {
            cleanup(false);
            return None;
        }

        let values = unsafe { std::slice::from_raw_parts(raw_data as *const f64, value_count) };
        let left = values[0];
        let top = values[1];
        let width = values[2];
        let height = values[3];

        cleanup(true);

        if height <= 0.0 {
            return None;
        }

        let normalized_width = width.max(2.0);

        Some(FocusedInputRect {
            left: left.round() as i32,
            top: top.round() as i32,
            right: (left + normalized_width).round() as i32,
            bottom: (top + height).round() as i32,
        })
    }

    fn capture_caret_context_from_range(
        range: &IUIAutomationTextRange,
    ) -> (Option<FocusedInputRect>, Option<IUIAutomationElement>) {
        let rect = unsafe { range.GetBoundingRectangles() }
            .ok()
            .and_then(rect_from_safearray);
        let owner = unsafe { range.GetEnclosingElement() }.ok();
        (rect, owner)
    }

    fn capture_caret_context_from_text_pattern2(
        text_pattern: &IUIAutomationTextPattern2,
    ) -> (Option<FocusedInputRect>, Option<IUIAutomationElement>) {
        let mut is_active = BOOL::default();
        let Ok(range) = (unsafe { text_pattern.GetCaretRange(&mut is_active) }) else {
            return (None, None);
        };
        capture_caret_context_from_range(&range)
    }

    fn capture_caret_context_from_text_pattern(
        text_pattern: &IUIAutomationTextPattern,
    ) -> (Option<FocusedInputRect>, Option<IUIAutomationElement>) {
        let Ok(ranges) = (unsafe { text_pattern.GetSelection() }) else {
            return (None, None);
        };
        let Ok(length) = (unsafe { ranges.Length() }) else {
            return (None, None);
        };
        if length <= 0 {
            return (None, None);
        }

        let Ok(range) = (unsafe { ranges.GetElement(0) }) else {
            return (None, None);
        };
        capture_caret_context_from_range(&range)
    }

    fn build_target_identity(
        element: &IUIAutomationElement,
        process_id: u32,
    ) -> (Option<FocusedInputRect>, String) {
        let rect = unsafe { element.CurrentBoundingRectangle() }
            .ok()
            .and_then(|value| {
                if value.right <= value.left || value.bottom <= value.top {
                    None
                } else {
                    Some(FocusedInputRect {
                        left: value.left,
                        top: value.top,
                        right: value.right,
                        bottom: value.bottom,
                    })
                }
            });

        let native_window = unsafe { element.CurrentNativeWindowHandle() }
            .ok()
            .map(|hwnd| hwnd.0 as isize)
            .unwrap_or_default();
        let class_name = unsafe { element.CurrentClassName() }
            .ok()
            .map(|value| value.to_string())
            .unwrap_or_default();
        let framework_id = unsafe { element.CurrentFrameworkId() }
            .ok()
            .map(|value| value.to_string())
            .unwrap_or_default();

        let target_key = if let Some(rect_value) = rect.as_ref() {
            format!(
                "{}:{}:{}:{}:{}:{}:{}:{}",
                process_id,
                native_window,
                class_name,
                framework_id,
                rect_value.left,
                rect_value.top,
                rect_value.right,
                rect_value.bottom
            )
        } else {
            format!("{}:{}:{}:{}", process_id, native_window, class_name, framework_id)
        };

        (rect, target_key)
    }

    fn find_stable_target_element(
        automation: &IUIAutomation,
        caret_owner_element: Option<&IUIAutomationElement>,
        focused_element: &IUIAutomationElement,
    ) -> IUIAutomationElement {
        fn is_input_container(element: &IUIAutomationElement) -> bool {
            unsafe { element.CurrentControlType() }
                .map(|control_type| {
                    control_type == UIA_EditControlTypeId || control_type == UIA_DocumentControlTypeId
                })
                .unwrap_or(false)
        }

        fn find_input_container_ancestor(
            walker: &IUIAutomationTreeWalker,
            start: &IUIAutomationElement,
        ) -> Option<IUIAutomationElement> {
            if is_input_container(start) {
                return Some(start.clone());
            }

            let mut current = start.clone();
            for _ in 0..8 {
                let parent = unsafe { walker.GetParentElement(&current) }.ok()?;
                if is_input_container(&parent) {
                    return Some(parent);
                }
                current = parent;
            }
            None
        }

        let Ok(walker) = (unsafe { automation.ControlViewWalker() }) else {
            return focused_element.clone();
        };

        if let Some(element) = caret_owner_element
            .and_then(|owner| find_input_container_ancestor(&walker, owner))
        {
            return element;
        }

        find_input_container_ancestor(&walker, focused_element).unwrap_or_else(|| focused_element.clone())
    }

    fn capture_caret_context(
        element: &IUIAutomationElement,
    ) -> (Option<FocusedInputRect>, Option<IUIAutomationElement>) {
        let text_pattern2_result: Result<IUIAutomationTextPattern2, _> =
            unsafe { element.GetCurrentPatternAs(UIA_TextPattern2Id) };

        if let Ok(text_pattern2) = text_pattern2_result {
            let result = capture_caret_context_from_text_pattern2(&text_pattern2);
            if result.0.is_some() {
                return result;
            }
        }

        let text_pattern_result: Result<IUIAutomationTextPattern, _> =
            unsafe { element.GetCurrentPatternAs(UIA_TextPatternId) };

        text_pattern_result
            .ok()
            .map(|text_pattern| capture_caret_context_from_text_pattern(&text_pattern))
            .unwrap_or((None, None))
    }

    let _ = unsafe { CoInitialize(None) };
    let automation: IUIAutomation = unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_ALL) }.ok()?;
    let element = unsafe { automation.GetFocusedElement() }.ok()?;

    let process_id = unsafe { element.CurrentProcessId() }.ok()? as u32;
    if process_id == std::process::id() {
        return None;
    }

    let has_focus = unsafe { element.CurrentHasKeyboardFocus() }.ok()?.as_bool();
    if !has_focus {
        return None;
    }

    let is_enabled = unsafe { element.CurrentIsEnabled() }.ok()?.as_bool();
    if !is_enabled {
        return None;
    }

    let is_password = unsafe { element.CurrentIsPassword() }.ok()?.as_bool();
    if is_password {
        return None;
    }

    let control_type = unsafe { element.CurrentControlType() }.ok()?;
    let is_keyboard_focusable = unsafe { element.CurrentIsKeyboardFocusable() }
        .ok()
        .map(|value| value.as_bool())
        .unwrap_or(false);
    let is_text_like_control =
        control_type == UIA_EditControlTypeId || control_type == UIA_DocumentControlTypeId;

    let value_pattern_result: Result<IUIAutomationValuePattern, _> =
        unsafe { element.GetCurrentPatternAs(UIA_ValuePatternId) };

    let (mut caret_rect, mut caret_owner_element) = capture_caret_context(&element);
    let mut text = String::new();
    let editable = if let Ok(value_pattern) = value_pattern_result {
        let is_read_only = unsafe { value_pattern.CurrentIsReadOnly() }
            .map(|value| value.as_bool())
            .unwrap_or(true);
        if is_read_only {
            false
        } else {
            text = unsafe { value_pattern.CurrentValue() }
                .map(|value| value.to_string())
                .unwrap_or_default();
            true
        }
    } else if is_keyboard_focusable || is_text_like_control {
        let text_pattern_result: Result<IUIAutomationTextPattern, _> =
            unsafe { element.GetCurrentPatternAs(UIA_TextPatternId) };

        if let Ok(text_pattern) = text_pattern_result {
            if caret_rect.is_none() {
                let caret_context = capture_caret_context_from_text_pattern(&text_pattern);
                caret_rect = caret_context.0;
                if caret_owner_element.is_none() {
                    caret_owner_element = caret_context.1;
                }
            }
            text = unsafe { text_pattern.DocumentRange() }
                .and_then(|range| unsafe { range.GetText(-1) })
                .map(|value| value.to_string())
                .unwrap_or_default();
            true
        } else {
            false
        }
    } else {
        false
    };

    if !editable {
        return None;
    }

    let key_source_element = find_stable_target_element(&automation, caret_owner_element.as_ref(), &element);
    let (rect, target_key) = build_target_identity(&key_source_element, process_id);

    Some(FocusedInputSnapshot {
        available: true,
        text,
        rect,
        caret_rect,
        target_key,
    })
}

#[cfg(not(target_os = "windows"))]
fn capture_focused_input_snapshot() -> Option<FocusedInputSnapshot> {
    None
}

#[tauri::command]
pub fn get_light_ai_target(state: tauri::State<LightAiTargetWrapper>) -> String {
    state.0.lock().unwrap().clone()
}

#[tauri::command]
pub fn open_light_ai_from_input_handle(
    snapshot_state: tauri::State<FocusedInputSnapshotWrapper>,
    text_state: tauri::State<StringWrapper>,
    target_state: tauri::State<LightAiTargetWrapper>,
) {
    if is_light_ai_opened_from_input_handle() && is_light_ai_window_visible() {
        let restore_snapshot = snapshot_state.0.lock().unwrap().clone();
        hide_light_ai_window();
        restore_foreground_window();
        HANDLE_SUPPRESSED.store(false, Ordering::SeqCst);
        *LAST_SHIFT_ENTER_SNAPSHOT.lock().unwrap() = Some(restore_snapshot);
        LAST_SHIFT_ENTER_TRIGGER_MS.store(current_marker(), Ordering::SeqCst);
        return;
    }

    HANDLE_SUPPRESSED.store(false, Ordering::SeqCst);
    set_light_ai_opened_from_input_handle(true);
    save_foreground_window();

    let mut snapshot = snapshot_state.0.lock().unwrap().clone();
    if !snapshot.available {
        snapshot = capture_focused_input_snapshot().unwrap_or_default();
    }

    {
        let mut target = target_state.0.lock().unwrap();
        *target = "focused_input".to_string();
    }

    {
        let mut text = text_state.0.lock().unwrap();
        text.replace_range(.., &snapshot.text);
    }

    debug!("Opening AI editor for focused input ({} chars)", snapshot.text.chars().count());

    std::thread::spawn(|| {
        light_ai_window_from_input_handle();
    });
}

#[tauri::command]
pub fn collapse_light_ai_from_input_handle(
    snapshot_state: tauri::State<FocusedInputSnapshotWrapper>,
) {
    let restore_snapshot = snapshot_state.0.lock().unwrap().clone();
    hide_light_ai_window();
    restore_foreground_window();
    HANDLE_SUPPRESSED.store(false, Ordering::SeqCst);
    *LAST_SHIFT_ENTER_SNAPSHOT.lock().unwrap() = Some(restore_snapshot);
    LAST_SHIFT_ENTER_TRIGGER_MS.store(current_marker(), Ordering::SeqCst);
}
