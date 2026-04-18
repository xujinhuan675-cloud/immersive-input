use crate::config::StoreWrapper;
use crate::error::Error;
use crate::PrevForegroundWindow;
use crate::StringWrapper;
use crate::APP;
use log::{error, info};
use serde_json::{json, Value};
use std::io::Read;
use tauri::Manager;

#[tauri::command]
pub fn get_text(state: tauri::State<StringWrapper>) -> String {
    return state.0.lock().unwrap().to_string();
}

#[tauri::command]
pub fn reload_store() {
    let state = APP.get().unwrap().state::<StoreWrapper>();
    let mut store = state.0.lock().unwrap();
    store.load().unwrap();
}

#[tauri::command]
pub fn cut_image(left: u32, top: u32, width: u32, height: u32, app_handle: tauri::AppHandle) {
    use dirs::cache_dir;
    use image::GenericImage;
    info!("Cut image: {}x{}+{}+{}", width, height, left, top);
    let mut app_cache_dir_path = cache_dir().expect("Get Cache Dir Failed");
    app_cache_dir_path.push(&app_handle.config().tauri.bundle.identifier);
    app_cache_dir_path.push("immersive_screenshot.png");
    if !app_cache_dir_path.exists() {
        return;
    }
    let mut img = match image::open(&app_cache_dir_path) {
        Ok(v) => v,
        Err(e) => {
            error!("{:?}", e.to_string());
            return;
        }
    };
    let img2 = img.sub_image(left, top, width, height);
    app_cache_dir_path.pop();
    app_cache_dir_path.push("immersive_screenshot_cut.png");
    match img2.to_image().save(&app_cache_dir_path) {
        Ok(_) => {}
        Err(e) => {
            error!("{:?}", e.to_string());
        }
    }
}

#[tauri::command]
pub fn get_base64(app_handle: tauri::AppHandle) -> String {
    use base64::{engine::general_purpose, Engine as _};
    use dirs::cache_dir;
    use std::fs::File;
    use std::io::Read;
    let mut app_cache_dir_path = cache_dir().expect("Get Cache Dir Failed");
    app_cache_dir_path.push(&app_handle.config().tauri.bundle.identifier);
    app_cache_dir_path.push("immersive_screenshot_cut.png");
    if !app_cache_dir_path.exists() {
        return "".to_string();
    }
    let mut file = File::open(app_cache_dir_path).unwrap();
    let mut vec = Vec::new();
    match file.read_to_end(&mut vec) {
        Ok(_) => {}
        Err(e) => {
            error!("{:?}", e.to_string());
            return "".to_string();
        }
    }
    let base64 = general_purpose::STANDARD.encode(&vec);
    base64.replace("\r\n", "")
}

#[tauri::command]
pub fn copy_img(app_handle: tauri::AppHandle, width: usize, height: usize) -> Result<(), Error> {
    use arboard::{Clipboard, ImageData};
    use dirs::cache_dir;
    use image::ImageReader;
    use std::borrow::Cow;

    let mut app_cache_dir_path = cache_dir().expect("Get Cache Dir Failed");
    app_cache_dir_path.push(&app_handle.config().tauri.bundle.identifier);
    app_cache_dir_path.push("immersive_screenshot_cut.png");
    let data = ImageReader::open(app_cache_dir_path)?.decode()?;

    let img = ImageData {
        width,
        height,
        bytes: Cow::from(data.as_bytes()),
    };
    let result = Clipboard::new()?.set_image(img)?;
    Ok(result)
}

#[tauri::command]
pub fn install_plugin(path_list: Vec<String>) -> Result<i32, Error> {
    let mut success_count = 0;

    for path in path_list {
        if !path.ends_with("potext") {
            continue;
        }
        let path = std::path::Path::new(&path);
        let file_name = path.file_name().unwrap().to_str().unwrap();
        let file_name = file_name.replace(".potext", "");
        if !file_name.starts_with("plugin") {
            return Err(Error::Error(
                "Invalid Plugin: file name must start with plugin".into(),
            ));
        }

        let mut zip = zip::ZipArchive::new(std::fs::File::open(path)?)?;
        #[allow(unused_mut)]
        let mut plugin_type: String;
        if let Ok(mut info) = zip.by_name("info.json") {
            let mut content = String::new();
            info.read_to_string(&mut content)?;
            let json: serde_json::Value = serde_json::from_str(&content)?;
            plugin_type = json["plugin_type"]
                .as_str()
                .ok_or(Error::Error("can't find plugin type in info.json".into()))?
                .to_string();
        } else {
            return Err(Error::Error("Invalid Plugin: miss info.json".into()));
        }
        if zip.by_name("main.js").is_err() {
            return Err(Error::Error("Invalid Plugin: miss main.js".into()));
        }
        let config_path = dirs::config_dir().unwrap();
        let config_path =
            config_path.join(APP.get().unwrap().config().tauri.bundle.identifier.clone());
        let config_path = config_path.join("plugins");
        let config_path = config_path.join(plugin_type);
        let plugin_path = config_path.join(file_name);
        std::fs::create_dir_all(&config_path)?;
        zip.extract(&plugin_path)?;

        success_count += 1;
    }
    Ok(success_count)
}

#[tauri::command]
pub fn run_binary(
    plugin_type: String,
    plugin_name: String,
    cmd_name: String,
    args: Vec<String>,
) -> Result<Value, Error> {
    #[cfg(target_os = "windows")]
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    let config_path = dirs::config_dir().unwrap();
    let config_path = config_path.join(APP.get().unwrap().config().tauri.bundle.identifier.clone());
    let config_path = config_path.join("plugins");
    let config_path = config_path.join(plugin_type);
    let plugin_path = config_path.join(plugin_name);

    #[cfg(target_os = "windows")]
    let mut cmd = Command::new("cmd");
    #[cfg(target_os = "windows")]
    let cmd = cmd.creation_flags(0x08000000);
    #[cfg(target_os = "windows")]
    let cmd = cmd.args(["/c", &cmd_name]);
    #[cfg(not(target_os = "windows"))]
    let mut cmd = Command::new(&cmd_name);

    let output = cmd.args(args).current_dir(plugin_path).output()?;
    Ok(json!({
        "stdout": String::from_utf8_lossy(&output.stdout).to_string(),
        "stderr": String::from_utf8_lossy(&output.stderr).to_string(),
        "status": output.status.code().unwrap_or(-1),
    }))
}

#[tauri::command]
pub fn font_list() -> Result<Vec<String>, Error> {
    use font_kit::source::SystemSource;
    let source = SystemSource::new();

    Ok(source.all_families()?)
}

/// Write text to clipboard
#[tauri::command]
pub fn write_clipboard(text: String) -> Result<(), String> {
    use arboard::Clipboard;
    let mut cb = Clipboard::new().map_err(|e| e.to_string())?;
    cb.set_text(text).map_err(|e| e.to_string())?;
    Ok(())
}

/// Write text to clipboard, restore previous window focus, then simulate Ctrl+V
#[tauri::command]
pub fn paste_result(text: String, state: tauri::State<PrevForegroundWindow>) -> Result<(), String> {
    // 1. Write result text to clipboard
    {
        use arboard::Clipboard;
        let mut cb = Clipboard::new().map_err(|e| e.to_string())?;
        cb.set_text(&text).map_err(|e| e.to_string())?;
    }
    std::thread::sleep(std::time::Duration::from_millis(80));

    // 2. On Windows: restore foreground window and simulate Ctrl+V
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS,
            KEYEVENTF_KEYUP, VK_CONTROL, VK_V,
        };
        use windows::Win32::UI::WindowsAndMessaging::SetForegroundWindow;

        let prev_hwnd = *state.0.lock().unwrap();
        if prev_hwnd != 0 {
            // Cast stored isize back to *mut c_void for HWND
            unsafe {
                let _ = SetForegroundWindow(HWND(prev_hwnd as *mut core::ffi::c_void));
            }
            std::thread::sleep(std::time::Duration::from_millis(80));
        }

        // wScan expects u16, not VIRTUAL_KEY; wFlags is KEYBD_EVENT_FLAGS
        let no_scan: u16 = 0;
        let no_flags = KEYBD_EVENT_FLAGS(0);
        let inputs = [
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
            SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
        }
    }
    Ok(())
}

/// Fill account into the previous foreground window (Ctrl+V), then Tab, then fill password.
/// The Tab key is used to jump between account and password fields on standard login forms.
/// If Tab fails to reach the password field, the JS side shows a hint to use the fallback button.
#[tauri::command]
pub fn fill_autotab(
    account: String,
    password: String,
    state: tauri::State<PrevForegroundWindow>,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use arboard::Clipboard;
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS,
            KEYEVENTF_KEYUP, VK_CONTROL, VK_TAB, VK_V,
        };
        use windows::Win32::UI::WindowsAndMessaging::SetForegroundWindow;

        // Restore the target window focus
        let prev_hwnd = *state.0.lock().unwrap();
        if prev_hwnd != 0 {
            unsafe {
                let _ = SetForegroundWindow(HWND(prev_hwnd as *mut core::ffi::c_void));
            }
            std::thread::sleep(std::time::Duration::from_millis(80));
        }

        let no_scan: u16 = 0;
        let no_flags = KEYBD_EVENT_FLAGS(0);

        // 1. Set account to clipboard and Ctrl+V
        {
            let mut cb = Clipboard::new().map_err(|e| e.to_string())?;
            cb.set_text(&account).map_err(|e| e.to_string())?;
        }
        std::thread::sleep(std::time::Duration::from_millis(80));
        let paste_account = [
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
            SendInput(&paste_account, std::mem::size_of::<INPUT>() as i32);
        }
        std::thread::sleep(std::time::Duration::from_millis(120));

        // 2. Tab (jump to password field)
        let tab_press = [
            INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: VK_TAB,
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
                        wVk: VK_TAB,
                        wScan: no_scan,
                        dwFlags: KEYEVENTF_KEYUP,
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            },
        ];
        unsafe {
            SendInput(&tab_press, std::mem::size_of::<INPUT>() as i32);
        }
        std::thread::sleep(std::time::Duration::from_millis(120));

        // 3. Set password to clipboard and Ctrl+V
        {
            let mut cb = Clipboard::new().map_err(|e| e.to_string())?;
            cb.set_text(&password).map_err(|e| e.to_string())?;
        }
        std::thread::sleep(std::time::Duration::from_millis(80));
        let paste_password = [
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
            SendInput(&paste_password, std::mem::size_of::<INPUT>() as i32);
        }
    }
    Ok(())
}
