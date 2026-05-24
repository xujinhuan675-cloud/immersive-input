use crate::crash_log;
use log::{debug, error};
use once_cell::sync::Lazy;
use rdev::Key;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Instant;

static PROCESS_START: Lazy<Instant> = Lazy::new(Instant::now);
static CONTROL_DOWN: AtomicBool = AtomicBool::new(false);
static META_DOWN: AtomicBool = AtomicBool::new(false);
static LAST_USER_COPY_INTENT_MS: AtomicU64 = AtomicU64::new(0);
static AUTO_TOOLBAR_PENDING_SELECTION: Lazy<Mutex<Option<AutoToolbarSelectionContext>>> =
    Lazy::new(|| Mutex::new(None));

#[cfg(target_os = "windows")]
static INTERNAL_COPY_ACTIVE: AtomicBool = AtomicBool::new(false);

#[cfg(target_os = "windows")]
static LAST_USER_COPY_BASE_SEQ: AtomicU32 = AtomicU32::new(0);

#[derive(Clone, Copy)]
struct AutoToolbarSelectionContext {
    marker: u64,
    release_x: i32,
    release_y: i32,
}

pub fn current_marker() -> u64 {
    PROCESS_START.elapsed().as_millis().min(u64::MAX as u128) as u64
}

pub fn handle_key_press(key: Key) {
    match key {
        Key::ControlLeft | Key::ControlRight => {
            CONTROL_DOWN.store(true, Ordering::SeqCst);
        }
        Key::MetaLeft | Key::MetaRight => {
            META_DOWN.store(true, Ordering::SeqCst);
        }
        Key::KeyC | Key::Insert => {
            if copy_modifier_active() && !internal_copy_active() {
                LAST_USER_COPY_INTENT_MS.store(current_marker(), Ordering::SeqCst);
                #[cfg(target_os = "windows")]
                LAST_USER_COPY_BASE_SEQ.store(clipboard_sequence(), Ordering::SeqCst);
            }
        }
        _ => {}
    }
}

pub fn handle_key_release(key: Key) {
    match key {
        Key::ControlLeft | Key::ControlRight => {
            CONTROL_DOWN.store(false, Ordering::SeqCst);
        }
        Key::MetaLeft | Key::MetaRight => {
            META_DOWN.store(false, Ordering::SeqCst);
        }
        _ => {}
    }
}

pub fn get_text(user_copy_priority_marker: Option<u64>) -> String {
    #[cfg(target_os = "windows")]
    {
        return get_text_windows(user_copy_priority_marker);
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = user_copy_priority_marker;
        selection::get_text()
    }
}

pub fn get_text_for_auto_toolbar(
    user_copy_priority_marker: Option<u64>,
    release_x: i32,
    release_y: i32,
) -> String {
    #[cfg(target_os = "windows")]
    {
        return get_text_windows_for_auto_toolbar(user_copy_priority_marker, release_x, release_y);
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (user_copy_priority_marker, release_x, release_y);
        selection::get_text()
    }
}

pub fn set_auto_toolbar_pending_selection(marker: u64, release_x: i32, release_y: i32) {
    let mut guard = AUTO_TOOLBAR_PENDING_SELECTION
        .lock()
        .unwrap_or_else(|err| err.into_inner());
    *guard = Some(AutoToolbarSelectionContext {
        marker,
        release_x,
        release_y,
    });
}

pub fn clear_auto_toolbar_pending_selection() {
    let mut guard = AUTO_TOOLBAR_PENDING_SELECTION
        .lock()
        .unwrap_or_else(|err| err.into_inner());
    *guard = None;
}

pub fn has_auto_toolbar_pending_selection() -> bool {
    AUTO_TOOLBAR_PENDING_SELECTION
        .lock()
        .map(|guard| guard.is_some())
        .unwrap_or(false)
}

pub fn capture_auto_toolbar_pending_selection() -> String {
    let context = {
        let mut guard = AUTO_TOOLBAR_PENDING_SELECTION
            .lock()
            .unwrap_or_else(|err| err.into_inner());
        guard.take()
    };

    let Some(context) = context else {
        return String::new();
    };

    get_text_for_auto_toolbar(Some(context.marker), context.release_x, context.release_y)
}

fn copy_modifier_active() -> bool {
    CONTROL_DOWN.load(Ordering::SeqCst) || META_DOWN.load(Ordering::SeqCst)
}

fn has_user_copy_intent_since(marker: Option<u64>) -> bool {
    marker
        .map(|value| LAST_USER_COPY_INTENT_MS.load(Ordering::SeqCst) >= value)
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn internal_copy_active() -> bool {
    INTERNAL_COPY_ACTIVE.load(Ordering::SeqCst)
}

#[cfg(not(target_os = "windows"))]
fn internal_copy_active() -> bool {
    false
}

#[cfg(target_os = "windows")]
fn get_text_windows(user_copy_priority_marker: Option<u64>) -> String {
    if let Some(text) = read_user_clipboard_text(user_copy_priority_marker) {
        crash_log::record(
            "selection_capture",
            format!("user clipboard text chars={}", text.len()),
        );
        return text;
    }

    crash_log::record("selection_capture", "automation capture start");
    match get_text_by_automation() {
        Ok(text) if !text.is_empty() => {
            crash_log::record(
                "selection_capture",
                format!("automation capture chars={}", text.len()),
            );
            return text;
        }
        Ok(_) => {
            crash_log::record("selection_capture", "automation capture empty");
            debug!("get_text_by_automation is empty");
        }
        Err(err) => {
            crash_log::record(
                "selection_capture",
                format!("automation capture error={}", err),
            );
            error!("get_text_by_automation error: {}", err);
        }
    }

    if let Some(text) = read_user_clipboard_text(user_copy_priority_marker) {
        crash_log::record(
            "selection_capture",
            format!("late user clipboard text chars={}", text.len()),
        );
        return text;
    }

    if copy_modifier_active() {
        debug!("Skipping internal clipboard fallback because copy modifier is held");
        return String::new();
    }

    if has_user_copy_intent_since(user_copy_priority_marker) {
        debug!("Skipping internal clipboard fallback because user copy is still settling");
        return String::new();
    }

    debug!("fallback to clipboard capture");
    crash_log::record("selection_capture", "clipboard fallback start");
    match get_text_by_clipboard(user_copy_priority_marker) {
        Ok(text) if !text.is_empty() => {
            crash_log::record(
                "selection_capture",
                format!("clipboard fallback chars={}", text.len()),
            );
            text
        }
        Ok(_) => {
            crash_log::record("selection_capture", "clipboard fallback empty");
            debug!("get_text_by_clipboard is empty");
            String::new()
        }
        Err(err) => {
            crash_log::record(
                "selection_capture",
                format!("clipboard fallback error={}", err),
            );
            error!("get_text_by_clipboard error: {}", err);
            String::new()
        }
    }
}

#[cfg(target_os = "windows")]
fn get_text_windows_for_auto_toolbar(
    user_copy_priority_marker: Option<u64>,
    release_x: i32,
    release_y: i32,
) -> String {
    if let Some(text) = read_user_clipboard_text(user_copy_priority_marker) {
        crash_log::record(
            "selection_capture",
            format!("auto toolbar user clipboard text chars={}", text.len()),
        );
        return text;
    }

    crash_log::record("selection_capture", "auto toolbar focused automation capture start");
    match get_text_by_automation() {
        Ok(text) if !text.is_empty() => {
            crash_log::record(
                "selection_capture",
                format!("auto toolbar focused automation chars={}", text.len()),
            );
            return text;
        }
        Ok(_) => {
            crash_log::record(
                "selection_capture",
                "auto toolbar focused automation empty",
            );
            debug!("auto toolbar focused automation is empty");
        }
        Err(err) => {
            crash_log::record(
                "selection_capture",
                format!("auto toolbar focused automation error={}", err),
            );
            error!("auto toolbar focused automation error: {}", err);
        }
    }

    crash_log::record(
        "selection_capture",
        format!(
            "auto toolbar point automation capture start x={} y={}",
            release_x, release_y
        ),
    );
    match get_text_by_automation_from_point(release_x, release_y) {
        Ok(text) if !text.is_empty() => {
            crash_log::record(
                "selection_capture",
                format!("auto toolbar point automation chars={}", text.len()),
            );
            return text;
        }
        Ok(_) => {
            crash_log::record("selection_capture", "auto toolbar point automation empty");
            debug!("auto toolbar point automation is empty");
        }
        Err(err) => {
            crash_log::record(
                "selection_capture",
                format!("auto toolbar point automation error={}", err),
            );
            error!("auto toolbar point automation error: {}", err);
        }
    }

    if let Some(text) = read_user_clipboard_text(user_copy_priority_marker) {
        crash_log::record(
            "selection_capture",
            format!("auto toolbar late user clipboard text chars={}", text.len()),
        );
        return text;
    }

    if copy_modifier_active() {
        debug!("Skipping auto toolbar clipboard fallback because copy modifier is held");
        return String::new();
    }

    if has_user_copy_intent_since(user_copy_priority_marker) {
        debug!("Skipping auto toolbar clipboard fallback because user copy is still settling");
        return String::new();
    }

    debug!("auto toolbar fallback to protected clipboard capture");
    crash_log::record("selection_capture", "auto toolbar clipboard fallback start");
    match get_text_by_clipboard_for_auto_toolbar(user_copy_priority_marker) {
        Ok(text) if !text.is_empty() => {
            crash_log::record(
                "selection_capture",
                format!("auto toolbar clipboard fallback chars={}", text.len()),
            );
            text
        }
        Ok(_) => {
            crash_log::record("selection_capture", "auto toolbar clipboard fallback empty");
            debug!("auto toolbar clipboard fallback is empty");
            String::new()
        }
        Err(err) => {
            crash_log::record(
                "selection_capture",
                format!("auto toolbar clipboard fallback error={}", err),
            );
            error!("auto toolbar clipboard fallback error: {}", err);
            String::new()
        }
    }
}

#[cfg(target_os = "windows")]
fn read_user_clipboard_text(user_copy_priority_marker: Option<u64>) -> Option<String> {
    use std::time::Duration;

    if !has_user_copy_intent_since(user_copy_priority_marker) {
        return None;
    }

    let base_seq = LAST_USER_COPY_BASE_SEQ.load(Ordering::SeqCst);
    for attempt in 0..12 {
        if clipboard_sequence() != base_seq {
            let text = read_clipboard_text().ok()?.trim().to_string();
            if !text.is_empty() {
                debug!("Using user clipboard text captured after selection release");
                return Some(text);
            }
        }

        if attempt < 11 {
            std::thread::sleep(Duration::from_millis(20));
        }
    }

    None
}

#[cfg(target_os = "windows")]
fn read_user_clipboard_text_if_ready(
    user_copy_priority_marker: Option<u64>,
) -> Result<Option<String>, Box<dyn std::error::Error>> {
    if !has_user_copy_intent_since(user_copy_priority_marker) {
        return Ok(None);
    }

    let base_seq = LAST_USER_COPY_BASE_SEQ.load(Ordering::SeqCst);
    if clipboard_sequence() == base_seq {
        return Ok(None);
    }

    let text = read_clipboard_text()?.trim().to_string();
    if !text.is_empty() {
        debug!("Using user clipboard text captured after selection release");
        return Ok(Some(text));
    }

    Ok(None)
}

#[cfg(target_os = "windows")]
fn clipboard_sequence() -> u32 {
    use windows::Win32::System::DataExchange::GetClipboardSequenceNumber;

    unsafe { GetClipboardSequenceNumber() }
}

#[cfg(target_os = "windows")]
fn get_selected_text_from_element(
    element: &windows::Win32::UI::Accessibility::IUIAutomationElement,
) -> Result<String, Box<dyn std::error::Error>> {
    use windows::Win32::UI::Accessibility::{IUIAutomationTextPattern, UIA_TextPatternId};

    let selection: IUIAutomationTextPattern =
        unsafe { element.GetCurrentPatternAs(UIA_TextPatternId) }?;
    let ranges = unsafe { selection.GetSelection() }?;
    let length = unsafe { ranges.Length() }?;

    let mut target = String::new();
    for index in 0..length {
        let range = unsafe { ranges.GetElement(index) }?;
        let text = unsafe { range.GetText(-1) }?;
        target.push_str(&text.to_string());
    }

    Ok(target.trim().to_string())
}

#[cfg(target_os = "windows")]
fn get_text_by_automation() -> Result<String, Box<dyn std::error::Error>> {
    use windows::Win32::System::Com::{CoCreateInstance, CoInitialize, CLSCTX_ALL};
    use windows::Win32::UI::Accessibility::{CUIAutomation, IUIAutomation};

    let _ = unsafe { CoInitialize(None) };
    let automation: IUIAutomation = unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_ALL) }?;
    let element = unsafe { automation.GetFocusedElement() }?;
    get_selected_text_from_element(&element)
}

#[cfg(target_os = "windows")]
fn get_text_by_automation_from_point(
    release_x: i32,
    release_y: i32,
) -> Result<String, Box<dyn std::error::Error>> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::System::Com::{CoCreateInstance, CoInitialize, CLSCTX_ALL};
    use windows::Win32::UI::Accessibility::{CUIAutomation, IUIAutomation};

    let _ = unsafe { CoInitialize(None) };
    let automation: IUIAutomation = unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_ALL) }?;
    let element = unsafe {
        automation.ElementFromPoint(POINT {
            x: release_x,
            y: release_y,
        })
    }?;

    if let Ok(text) = get_selected_text_from_element(&element) {
        if !text.is_empty() {
            return Ok(text);
        }
    }

    let walker = unsafe { automation.ControlViewWalker() }?;
    let mut current = element;
    for _ in 0..8 {
        let parent = unsafe { walker.GetParentElement(&current) }?;
        if let Ok(text) = get_selected_text_from_element(&parent) {
            if !text.is_empty() {
                return Ok(text);
            }
        }
        current = parent;
    }

    Ok(String::new())
}

#[cfg(target_os = "windows")]
fn get_text_by_clipboard_for_auto_toolbar(
    user_copy_priority_marker: Option<u64>,
) -> Result<String, Box<dyn std::error::Error>> {
    use arboard::{Clipboard, ImageData};
    use std::time::Duration;

    let old_text = Clipboard::new()?.get_text().ok().map(|value| value.trim().to_string());
    let old_image: Option<ImageData<'static>> = Clipboard::new()?.get_image().ok();
    let seq_before = clipboard_sequence();

    if copy_modifier_active() {
        debug!("Skipping auto toolbar clipboard capture because copy modifier is held");
        return Ok(String::new());
    }

    if let Some(text) = read_user_clipboard_text_if_ready(user_copy_priority_marker)? {
        return Ok(text);
    }

    send_internal_copy()?;
    std::thread::sleep(Duration::from_millis(70));

    let seq_after_capture = clipboard_sequence();
    if seq_after_capture == seq_before {
        return Ok(String::new());
    }

    if let Some(text) = read_user_clipboard_text_if_ready(user_copy_priority_marker)? {
        return Ok(text);
    }

    let captured_text = read_clipboard_text().unwrap_or_default().trim().to_string();
    let seq_before_restore = clipboard_sequence();
    if seq_before_restore != seq_after_capture {
        crash_log::record(
            "selection_capture",
            "auto toolbar clipboard changed during fallback; skip captured text",
        );
        return Ok(String::new());
    }

    restore_clipboard(old_text.clone(), old_image)?;

    if captured_text.is_empty() {
        return Ok(String::new());
    }

    if old_text.as_deref() == Some(captured_text.as_str()) {
        crash_log::record(
            "selection_capture",
            "auto toolbar clipboard fallback matched previous text; treating as stale",
        );
        return Ok(String::new());
    }

    Ok(captured_text)
}

#[cfg(target_os = "windows")]
fn get_text_by_clipboard(
    user_copy_priority_marker: Option<u64>,
) -> Result<String, Box<dyn std::error::Error>> {
    use arboard::{Clipboard, ImageData};
    use std::time::Duration;

    let old_text = Clipboard::new()?.get_text().ok();
    let old_image: Option<ImageData<'static>> = Clipboard::new()?.get_image().ok();
    let seq_before = clipboard_sequence();

    if copy_modifier_active() {
        debug!("Skipping internal clipboard capture because copy modifier is held");
        return Ok(String::new());
    }

    if let Some(text) = read_user_clipboard_text_if_ready(user_copy_priority_marker)? {
        return Ok(text);
    }

    send_internal_copy()?;
    std::thread::sleep(Duration::from_millis(70));

    let captured_text = read_clipboard_text().unwrap_or_default().trim().to_string();
    let seq_after_capture = clipboard_sequence();
    if seq_after_capture == seq_before {
        return Err(other_error("Copy Failed"));
    }

    if let Some(text) = read_user_clipboard_text_if_ready(user_copy_priority_marker)? {
        return Ok(text);
    }

    let seq_before_restore = clipboard_sequence();
    if seq_before_restore != seq_after_capture {
        return Ok(read_clipboard_text()
            .unwrap_or(captured_text.clone())
            .trim()
            .to_string());
    }

    restore_clipboard(old_text, old_image)?;
    Ok(captured_text)
}

#[cfg(target_os = "windows")]
fn send_internal_copy() -> Result<(), Box<dyn std::error::Error>> {
    use std::time::Duration;
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
        VK_C, VK_CONTROL,
    };

    let no_scan: u16 = 0;
    let no_flags = KEYBD_EVENT_FLAGS(0);
    let release_flags = KEYEVENTF_KEYUP;
    let inputs = [
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VK_CONTROL,
                    wScan: no_scan,
                    dwFlags: release_flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        },
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VK_C,
                    wScan: no_scan,
                    dwFlags: release_flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        },
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VK_CONTROL,
                    wScan: no_scan,
                    dwFlags: no_flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        },
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VK_C,
                    wScan: no_scan,
                    dwFlags: no_flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        },
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VK_C,
                    wScan: no_scan,
                    dwFlags: KEYEVENTF_KEYUP,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        },
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VK_CONTROL,
                    wScan: no_scan,
                    dwFlags: KEYEVENTF_KEYUP,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        },
    ];

    INTERNAL_COPY_ACTIVE.store(true, Ordering::SeqCst);
    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    std::thread::sleep(Duration::from_millis(30));
    INTERNAL_COPY_ACTIVE.store(false, Ordering::SeqCst);

    if sent == 0 {
        return Err(other_error("Copy Failed"));
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn read_clipboard_text() -> Result<String, Box<dyn std::error::Error>> {
    use arboard::Clipboard;

    Ok(Clipboard::new()?.get_text()?)
}

#[cfg(target_os = "windows")]
fn restore_clipboard(
    old_text: Option<String>,
    old_image: Option<arboard::ImageData<'static>>,
) -> Result<(), Box<dyn std::error::Error>> {
    use arboard::Clipboard;

    let mut clipboard = Clipboard::new()?;
    match (old_text, old_image) {
        (Some(text), _) => clipboard.set_text(text)?,
        (None, Some(image)) => clipboard.set_image(image)?,
        (None, None) => clipboard.clear()?,
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn other_error(message: &'static str) -> Box<dyn std::error::Error> {
    Box::new(std::io::Error::new(std::io::ErrorKind::Other, message))
}
