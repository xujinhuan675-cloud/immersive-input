use crate::PrevForegroundWindow;
use crate::APP;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;

/// 内联弹窗是否当前可见
pub static INLINE_ACTIVE: AtomicBool = AtomicBool::new(false);

/// 打开常用语内联窗口。
/// 触发字符删除已由 doubletap_hook::delete_doubletap_chars() 处理。
pub fn open_from_hotkey() {
    INLINE_ACTIVE.store(true, Ordering::SeqCst);
    crate::window::save_foreground_window();
    std::thread::spawn(|| {
        crate::window::phrases_inline_window();
    });
}

pub fn deactivate() {
    INLINE_ACTIVE.store(false, Ordering::SeqCst);
    if let Some(app) = APP.get() {
        if let Some(w) = app.get_window("phrases_inline") {
            let _ = w.hide();
        }
    }
}

// ── Tauri 命令 ──────────────────────────────────────────────────────────────────────────────

/// 选中常用语后调用：还原目标窗口焦点 + Ctrl+V 粘贴。
/// 触发字符已由 doubletap_hook 删除，此处无需再删。
#[tauri::command]
pub fn phrase_inline_fill(
    content: String,
    state: tauri::State<PrevForegroundWindow>,
) -> Result<(), String> {
    deactivate();
    std::thread::sleep(std::time::Duration::from_millis(80));

    #[cfg(target_os = "windows")]
    {
        use arboard::Clipboard;
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            SendInput, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, INPUT, INPUT_0, INPUT_KEYBOARD,
            KEYBDINPUT, VK_CONTROL, VK_V,
        };
        use windows::Win32::UI::WindowsAndMessaging::SetForegroundWindow;

        // 还原目标窗口焦点
        let prev_hwnd = *state.0.lock().unwrap();
        if prev_hwnd != 0 {
            unsafe {
                let _ = SetForegroundWindow(HWND(prev_hwnd as *mut core::ffi::c_void));
            }
            std::thread::sleep(std::time::Duration::from_millis(80));
        }

        let no_scan: u16 = 0;
        let no_flags = KEYBD_EVENT_FLAGS(0);

        // 写入剪贴板并 Ctrl+V
        {
            let mut cb = Clipboard::new().map_err(|e| e.to_string())?;
            cb.set_text(&content).map_err(|e| e.to_string())?;
        }
        std::thread::sleep(std::time::Duration::from_millis(80));

        let paste = [
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
                        wVk: VK_V,
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
                        wVk: VK_V,
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
        unsafe {
            SendInput(&paste, std::mem::size_of::<INPUT>() as i32);
        }
    }

    Ok(())
}

/// 取消（Esc）时调用
#[tauri::command]
pub fn phrase_inline_dismiss() {
    deactivate();
}
