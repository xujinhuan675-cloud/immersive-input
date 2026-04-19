use log::{error, info};
use once_cell::sync::Lazy;
use rdev::Key;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::time::Instant;

static PROCESS_START: Lazy<Instant> = Lazy::new(Instant::now);
static CONTROL_DOWN: AtomicBool = AtomicBool::new(false);
static META_DOWN: AtomicBool = AtomicBool::new(false);
static LAST_USER_COPY_INTENT_MS: AtomicU64 = AtomicU64::new(0);

#[cfg(target_os = "windows")]
static INTERNAL_COPY_ACTIVE: AtomicBool = AtomicBool::new(false);

#[cfg(target_os = "windows")]
static LAST_USER_COPY_BASE_SEQ: AtomicU32 = AtomicU32::new(0);

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
        return text;
    }

    match get_text_by_automation() {
        Ok(text) if !text.is_empty() => return text,
        Ok(_) => info!("get_text_by_automation is empty"),
        Err(err) => error!("get_text_by_automation error: {}", err),
    }

    if let Some(text) = read_user_clipboard_text(user_copy_priority_marker) {
        return text;
    }

    if copy_modifier_active() {
        info!("Skipping internal clipboard fallback because copy modifier is held");
        return String::new();
    }

    if has_user_copy_intent_since(user_copy_priority_marker) {
        info!("Skipping internal clipboard fallback because user copy is still settling");
        return String::new();
    }

    info!("fallback to clipboard capture");
    match get_text_by_clipboard(user_copy_priority_marker) {
        Ok(text) if !text.is_empty() => text,
        Ok(_) => {
            info!("get_text_by_clipboard is empty");
            String::new()
        }
        Err(err) => {
            error!("get_text_by_clipboard error: {}", err);
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
                info!("Using user clipboard text captured after selection release");
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
        info!("Using user clipboard text captured after selection release");
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
fn get_text_by_automation() -> Result<String, Box<dyn std::error::Error>> {
    use windows::Win32::System::Com::{CoCreateInstance, CoInitialize, CLSCTX_ALL};
    use windows::Win32::UI::Accessibility::{
        CUIAutomation, IUIAutomation, IUIAutomationTextPattern, UIA_TextPatternId,
    };

    let _ = unsafe { CoInitialize(None) };
    let automation: IUIAutomation = unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_ALL) }?;
    let element = unsafe { automation.GetFocusedElement() }?;
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
fn get_text_by_clipboard(
    user_copy_priority_marker: Option<u64>,
) -> Result<String, Box<dyn std::error::Error>> {
    use arboard::{Clipboard, ImageData};
    use std::time::Duration;

    let old_text = Clipboard::new()?.get_text().ok();
    let old_image: Option<ImageData<'static>> = Clipboard::new()?.get_image().ok();
    let seq_before = clipboard_sequence();

    if copy_modifier_active() {
        info!("Skipping internal clipboard capture because copy modifier is held");
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
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS,
        KEYEVENTF_KEYUP, VK_C, VK_CONTROL,
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
