// fs and cache_dir are only used in macOS OCR code
#[cfg(target_os = "macos")]
use std::fs;

use crate::config::get;
use crate::config::set;
use crate::PrevForegroundWindow;
use crate::StringWrapper;
use crate::APP;
#[cfg(target_os = "macos")]
use dirs::cache_dir;
use log::{info, warn};
use tauri::Manager;
use tauri::Monitor;
use tauri::Window;
use tauri::WindowBuilder;
#[cfg(any(target_os = "macos", target_os = "windows"))]
use window_shadows::set_shadow;

// Get daemon window instance
fn get_daemon_window() -> Window {
    let app_handle = APP.get().unwrap();
    match app_handle.get_window("daemon") {
        Some(v) => v,
        None => {
            warn!("Daemon window not found, create new daemon window!");
            WindowBuilder::new(
                app_handle,
                "daemon",
                tauri::WindowUrl::App("daemon.html".into()),
            )
            .title("Daemon")
            .additional_browser_args("--disable-web-security")
            .visible(false)
            .build()
            .unwrap()
        }
    }
}

// Get monitor where the mouse is currently located
fn get_current_monitor(x: i32, y: i32) -> Monitor {
    info!("Mouse position: {}, {}", x, y);
    let daemon_window = get_daemon_window();
    let monitors = daemon_window.available_monitors().unwrap();

    for m in monitors {
        let size = m.size();
        let position = m.position();

        if x >= position.x
            && x <= (position.x + size.width as i32)
            && y >= position.y
            && y <= (position.y + size.height as i32)
        {
            info!("Current Monitor: {:?}", m);
            return m;
        }
    }
    warn!("Current Monitor not found, using primary monitor");
    daemon_window.primary_monitor().unwrap().unwrap()
}

// Creating a window on the mouse monitor
fn build_window(label: &str, title: &str) -> (Window, bool) {
    use mouse_position::mouse_position::{Mouse, Position};

    let mouse_position = match Mouse::get_mouse_position() {
        Mouse::Position { x, y } => Position { x, y },
        Mouse::Error => {
            warn!("Mouse position not found, using (0, 0) as default");
            Position { x: 0, y: 0 }
        }
    };
    let current_monitor = get_current_monitor(mouse_position.x, mouse_position.y);
    let position = current_monitor.position();

    let app_handle = APP.get().unwrap();
    match app_handle.get_window(label) {
        Some(v) => {
            info!("Window existence: {}", label);
            v.set_focus().unwrap();
            (v, true)
        }
        None => {
            info!("Window not existence, Creating new window: {}", label);
            let mut builder = tauri::WindowBuilder::new(
                app_handle,
                label,
                tauri::WindowUrl::App("index.html".into()),
            )
            .position(position.x.into(), position.y.into())
            .additional_browser_args("--disable-web-security")
            .focused(true)
            .title(title)
            .visible(false);

            #[cfg(target_os = "macos")]
            {
                builder = builder
                    .title_bar_style(tauri::TitleBarStyle::Overlay)
                    .hidden_title(true);
            }
            #[cfg(not(target_os = "macos"))]
            {
                builder = builder.transparent(true).decorations(false);
            }
            let window = builder.build().unwrap();

            if label != "screenshot" {
                #[cfg(not(target_os = "linux"))]
                set_shadow(&window, true).unwrap_or_default();
            }
            let _ = window.current_monitor();
            (window, false)
        }
    }
}

pub fn config_window() {
    let (window, _exists) = build_window("config", "Config");
    window
        .set_min_size(Some(tauri::LogicalSize::new(800, 400)))
        .unwrap();
    window.set_size(tauri::LogicalSize::new(800, 600)).unwrap();
    window.center().unwrap();
    window.show().unwrap();
}

fn translate_window() -> Window {
    use mouse_position::mouse_position::{Mouse, Position};
    // Mouse physical position
    let mut mouse_position = match Mouse::get_mouse_position() {
        Mouse::Position { x, y } => Position { x, y },
        Mouse::Error => {
            warn!("Mouse position not found, using (0, 0) as default");
            Position { x: 0, y: 0 }
        }
    };
    let (window, exists) = build_window("translate", "Translate");
    if exists {
        return window;
    }
    window.set_skip_taskbar(true).unwrap();
    // Get Translate Window Size
    let width = match get("translate_window_width") {
        Some(v) => v.as_i64().unwrap(),
        None => {
            set("translate_window_width", 350);
            350
        }
    };
    let height = match get("translate_window_height") {
        Some(v) => v.as_i64().unwrap(),
        None => {
            set("translate_window_height", 420);
            420
        }
    };

    let monitor = window.current_monitor().unwrap().unwrap();
    let dpi = monitor.scale_factor();

    window
        .set_size(tauri::PhysicalSize::new(
            (width as f64) * dpi,
            (height as f64) * dpi,
        ))
        .unwrap();

    let position_type = match get("translate_window_position") {
        Some(v) => v.as_str().unwrap().to_string(),
        None => "mouse".to_string(),
    };

    match position_type.as_str() {
        "mouse" => {
            // Adjust window position
            let monitor_size = monitor.size();
            let monitor_size_width = monitor_size.width as f64;
            let monitor_size_height = monitor_size.height as f64;
            let monitor_position = monitor.position();
            let monitor_position_x = monitor_position.x as f64;
            let monitor_position_y = monitor_position.y as f64;

            if mouse_position.x as f64 + width as f64 * dpi
                > monitor_position_x + monitor_size_width
            {
                mouse_position.x -= (width as f64 * dpi) as i32;
                if (mouse_position.x as f64) < monitor_position_x {
                    mouse_position.x = monitor_position_x as i32;
                }
            }
            if mouse_position.y as f64 + height as f64 * dpi
                > monitor_position_y + monitor_size_height
            {
                mouse_position.y -= (height as f64 * dpi) as i32;
                if (mouse_position.y as f64) < monitor_position_y {
                    mouse_position.y = monitor_position_y as i32;
                }
            }

            window
                .set_position(tauri::PhysicalPosition::new(
                    mouse_position.x,
                    mouse_position.y,
                ))
                .unwrap();
        }
        _ => {
            let position_x = match get("translate_window_position_x") {
                Some(v) => v.as_i64().unwrap(),
                None => 0,
            };
            let position_y = match get("translate_window_position_y") {
                Some(v) => v.as_i64().unwrap(),
                None => 0,
            };
            window
                .set_position(tauri::PhysicalPosition::new(
                    (position_x as f64) * dpi,
                    (position_y as f64) * dpi,
                ))
                .unwrap();
        }
    }

    window
}

// Save the currently focused window handle before we open our popup (Windows only)
pub fn save_foreground_window() {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
        let app_handle = APP.get().unwrap();
        let state: tauri::State<PrevForegroundWindow> = app_handle.state();
        unsafe {
            let hwnd = GetForegroundWindow();
            // HWND inner type is *mut c_void; cast to isize for storage
            *state.0.lock().unwrap() = hwnd.0 as isize;
        }
    }
}

pub fn selection_translate() {
    use selection::get_text;
    // Save foreground window before we open any popup
    save_foreground_window();
    // Get Selected Text
    let text = get_text();
    if !text.trim().is_empty() {
        let app_handle = APP.get().unwrap();
        // Write into State
        let state: tauri::State<StringWrapper> = app_handle.state();
        state.0.lock().unwrap().replace_range(.., &text);
    }
    // Check config: show floating toolbar or go directly to translate window
    let show_toolbar = match get("selection_show_toolbar") {
        Some(v) => v.as_bool().unwrap_or(true),
        None => {
            set("selection_show_toolbar", true);
            true
        }
    };
    if show_toolbar && !text.trim().is_empty() {
        float_toolbar_window();
    } else {
        let window = translate_window();
        window.emit("new_text", text).unwrap();
    }
}

pub fn input_translate() {
    let app_handle = APP.get().unwrap();
    // Clear State
    let state: tauri::State<StringWrapper> = app_handle.state();
    state
        .0
        .lock()
        .unwrap()
        .replace_range(.., "[INPUT_TRANSLATE]");
    let window = translate_window();
    let position_type = match get("translate_window_position") {
        Some(v) => v.as_str().unwrap().to_string(),
        None => "mouse".to_string(),
    };
    if position_type == "mouse" {
        window.center().unwrap();
    }

    window.emit("new_text", "[INPUT_TRANSLATE]").unwrap();
}

pub fn text_translate(text: String) {
    let app_handle = APP.get().unwrap();
    // Clear State
    let state: tauri::State<StringWrapper> = app_handle.state();
    state.0.lock().unwrap().replace_range(.., &text);
    let window = translate_window();
    window.emit("new_text", text).unwrap();
}

pub fn image_translate() {
    let app_handle = APP.get().unwrap();
    let state: tauri::State<StringWrapper> = app_handle.state();
    state
        .0
        .lock()
        .unwrap()
        .replace_range(.., "[IMAGE_TRANSLATE]");
    let window = translate_window();
    window.emit("new_text", "[IMAGE_TRANSLATE]").unwrap();
}

pub fn recognize_window() {
    let (window, exists) = build_window("recognize", "Recognize");
    if exists {
        window.emit("new_image", "").unwrap();
        window.show().unwrap();
        return;
    }
    let width = match get("recognize_window_width") {
        Some(v) => v.as_i64().unwrap(),
        None => {
            set("recognize_window_width", 800);
            800
        }
    };
    let height = match get("recognize_window_height") {
        Some(v) => v.as_i64().unwrap(),
        None => {
            set("recognize_window_height", 400);
            400
        }
    };
    let monitor = window.current_monitor().unwrap().unwrap();
    let dpi = monitor.scale_factor();
    window
        .set_size(tauri::PhysicalSize::new(
            (width as f64) * dpi,
            (height as f64) * dpi,
        ))
        .unwrap();
    window.center().unwrap();
    window.show().unwrap();
    window.emit("new_image", "").unwrap();
}

#[cfg(not(target_os = "macos"))]
fn screenshot_window() -> Window {
    let (window, _exists) = build_window("screenshot", "Screenshot");

    window.set_skip_taskbar(true).unwrap();
    #[cfg(target_os = "macos")]
    {
        let monitor = window.current_monitor().unwrap().unwrap();
        let size = monitor.size();
        window.set_decorations(false).unwrap();
        window.set_size(*size).unwrap();
    }

    #[cfg(not(target_os = "macos"))]
    window.set_fullscreen(true).unwrap();

    window.set_always_on_top(true).unwrap();
    window
}

pub fn ocr_recognize() {
    #[cfg(target_os = "macos")]
    {
        let app_handle = APP.get().unwrap();
        let mut app_cache_dir_path = cache_dir().expect("Get Cache Dir Failed");
        app_cache_dir_path.push(&app_handle.config().tauri.bundle.identifier);
        if !app_cache_dir_path.exists() {
            // 创建目录
            fs::create_dir_all(&app_cache_dir_path).expect("Create Cache Dir Failed");
        }
        app_cache_dir_path.push("immersive_screenshot_cut.png");

        let path = app_cache_dir_path.to_string_lossy().replace("\\\\?\\", "");
        println!("Screenshot path: {}", path);
        if let Ok(_output) = std::process::Command::new("/usr/sbin/screencapture")
            .arg("-i")
            .arg("-r")
            .arg(path)
            .output()
        {
            recognize_window();
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let window = screenshot_window();
        let window_ = window.clone();
        window.listen("success", move |event| {
            recognize_window();
            window_.unlisten(event.id())
        });
    }
}
pub fn ocr_translate() {
    #[cfg(target_os = "macos")]
    {
        let app_handle = APP.get().unwrap();
        let mut app_cache_dir_path = cache_dir().expect("Get Cache Dir Failed");
        app_cache_dir_path.push(&app_handle.config().tauri.bundle.identifier);
        if !app_cache_dir_path.exists() {
            // 创建目录
            fs::create_dir_all(&app_cache_dir_path).expect("Create Cache Dir Failed");
        }
        app_cache_dir_path.push("immersive_screenshot_cut.png");

        let path = app_cache_dir_path.to_string_lossy().replace("\\\\?\\", "");
        println!("Screenshot path: {}", path);
        if let Ok(_output) = std::process::Command::new("/usr/sbin/screencapture")
            .arg("-i")
            .arg("-r")
            .arg(path)
            .output()
        {
            image_translate();
            ();
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let window = screenshot_window();
        let window_ = window.clone();
        window.listen("success", move |event| {
            image_translate();
            window_.unlisten(event.id())
        });
    }
}

// ─────────────────────────────────────────────
// Floating Toolbar
// ─────────────────────────────────────────────
pub fn float_toolbar_window() {
    use mouse_position::mouse_position::{Mouse, Position};
    let mouse_pos = match Mouse::get_mouse_position() {
        Mouse::Position { x, y } => Position { x, y },
        Mouse::Error => Position { x: 0, y: 0 },
    };
    let app_handle = APP.get().unwrap();
    // If window already exists, just show it
    if let Some(w) = app_handle.get_window("float_toolbar") {
        let monitor = w.current_monitor().unwrap().unwrap();
        let dpi = monitor.scale_factor();
        let monitor_size = monitor.size();
        let monitor_pos = monitor.position();
    let w_width = (400.0 * dpi) as i32;
        let w_height = (80.0 * dpi) as i32;
        let mut x = mouse_pos.x - w_width / 2;
        let mut y = mouse_pos.y - w_height - 12;
        if x + w_width > monitor_pos.x + monitor_size.width as i32 { x = monitor_pos.x + monitor_size.width as i32 - w_width; }
        if x < monitor_pos.x { x = monitor_pos.x; }
        if y < monitor_pos.y { y = mouse_pos.y + 20; }
        w.set_position(tauri::PhysicalPosition::new(x, y)).unwrap_or_default();
        w.show().unwrap_or_default();
        return;
    }
    let window = match tauri::WindowBuilder::new(
        app_handle,
        "float_toolbar",
        tauri::WindowUrl::App("index.html".into()),
    )
    .transparent(true)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(false)
    .visible(false)
    .inner_size(600.0, 100.0) // frontend will resize dynamically
    .additional_browser_args("--disable-web-security")
    .build() {
        Ok(w) => w,
        Err(e) => { warn!("Failed to create float_toolbar window: {:?}", e); return; }
    };
    let monitor = window.current_monitor().unwrap().unwrap();
    let dpi = monitor.scale_factor();
    let monitor_size = monitor.size();
    let monitor_pos = monitor.position();
    let w_width = (400.0 * dpi) as i32;
    let w_height = (80.0 * dpi) as i32;
    let mut x = mouse_pos.x - w_width / 2;
    let mut y = mouse_pos.y - w_height - 12;
    if x + w_width > monitor_pos.x + monitor_size.width as i32 { x = monitor_pos.x + monitor_size.width as i32 - w_width; }
    if x < monitor_pos.x { x = monitor_pos.x; }
    if y < monitor_pos.y { y = mouse_pos.y + 20; }
    window.set_position(tauri::PhysicalPosition::new(x, y)).unwrap_or_default();
    window.show().unwrap_or_default();
}

// ─────────────────────────────────────────────
// LightAI Window
// ─────────────────────────────────────────────
pub fn selection_light_ai() {
    use selection::get_text;
    info!("selection_light_ai called");
    // Save foreground window before we open any popup
    save_foreground_window();
    // Get Selected Text
    let text = get_text();
    info!("Got text from selection: {:?}", text);
    if !text.trim().is_empty() {
        let app_handle = APP.get().unwrap();
        // Write into State
        let state: tauri::State<StringWrapper> = app_handle.state();
        state.0.lock().unwrap().replace_range(.., &text);
        info!("Text saved to state");
    } else {
        info!("No text selected or text is empty");
    }
    // Open light AI window
    light_ai_window();
}

pub fn light_ai_window() {
    use mouse_position::mouse_position::{Mouse, Position};
    let mouse_pos = match Mouse::get_mouse_position() {
        Mouse::Position { x, y } => Position { x, y },
        Mouse::Error => Position { x: 0, y: 0 },
    };
    let app_handle = APP.get().unwrap();
    let text = {
        let state: tauri::State<StringWrapper> = app_handle.state();
        let guard = state.0.lock().unwrap();
        let s = guard.clone();
        drop(guard);
        s
    };
    let (window, exists) = build_window("light_ai", "Light AI");
    window.set_skip_taskbar(true).unwrap_or_default();
    if exists {
        window.emit("new_text", text).unwrap_or_default();
        return;
    }
    let monitor = window.current_monitor().unwrap().unwrap();
    let dpi = monitor.scale_factor();
    let monitor_size = monitor.size();
    let monitor_pos = monitor.position();
    let w_width = 460.0_f64;
    let w_height = 540.0_f64;
    window.set_size(tauri::PhysicalSize::new((w_width * dpi) as u32, (w_height * dpi) as u32)).unwrap_or_default();
    let mut x = mouse_pos.x;
    let mut y = mouse_pos.y;
    if x as f64 + w_width * dpi > (monitor_pos.x + monitor_size.width as i32) as f64 { x -= (w_width * dpi) as i32; }
    if y as f64 + w_height * dpi > (monitor_pos.y + monitor_size.height as i32) as f64 { y -= (w_height * dpi) as i32; }
    if x < monitor_pos.x { x = monitor_pos.x; }
    if y < monitor_pos.y { y = monitor_pos.y; }
    window.set_position(tauri::PhysicalPosition::new(x, y)).unwrap_or_default();
    window.show().unwrap_or_default();  // 必须显示窗口
    window.emit("new_text", text).unwrap_or_default();
}

// ─────────────────────────────────────────────
// Explain Window
// ─────────────────────────────────────────────
pub fn explain_window() {
    use mouse_position::mouse_position::{Mouse, Position};
    let mouse_pos = match Mouse::get_mouse_position() {
        Mouse::Position { x, y } => Position { x, y },
        Mouse::Error => Position { x: 0, y: 0 },
    };
    let app_handle = APP.get().unwrap();
    let text = {
        let state: tauri::State<StringWrapper> = app_handle.state();
        let guard = state.0.lock().unwrap();
        let s = guard.clone();
        drop(guard);
        s
    };
    let (window, exists) = build_window("explain", "Explain");
    window.set_skip_taskbar(true).unwrap_or_default();
    if exists {
        window.emit("new_text", text).unwrap_or_default();
        return;
    }
    let monitor = window.current_monitor().unwrap().unwrap();
    let dpi = monitor.scale_factor();
    let monitor_size = monitor.size();
    let monitor_pos = monitor.position();
    let w_width = 400.0_f64;
    let w_height = 500.0_f64;
    window.set_size(tauri::PhysicalSize::new((w_width * dpi) as u32, (w_height * dpi) as u32)).unwrap_or_default();
    let mut x = mouse_pos.x;
    let mut y = mouse_pos.y;
    if x as f64 + w_width * dpi > (monitor_pos.x + monitor_size.width as i32) as f64 { x -= (w_width * dpi) as i32; }
    if y as f64 + w_height * dpi > (monitor_pos.y + monitor_size.height as i32) as f64 { y -= (w_height * dpi) as i32; }
    if x < monitor_pos.x { x = monitor_pos.x; }
    if y < monitor_pos.y { y = monitor_pos.y; }
    window.set_position(tauri::PhysicalPosition::new(x, y)).unwrap_or_default();
    window.show().unwrap_or_default();  // 必须显示窗口
    window.emit("new_text", text).unwrap_or_default();
}

// ─────────────────────────────────────────────
// Tauri commands for frontend to open windows
// ─────────────────────────────────────────────
#[tauri::command]
pub fn open_light_ai_window() {
    light_ai_window();
}
#[tauri::command]
pub fn open_explain_window() {
    explain_window();
}
// ─────────────────────────────────────────────
// Chat Window
// ─────────────────────────────────────────────
pub fn chat_window() {
    let app_handle = APP.get().unwrap();
    if let Some(w) = app_handle.get_window("chat") {
        w.show().unwrap_or_default();
        w.set_focus().unwrap_or_default();
        return;
    }
    let (window, _) = build_window("chat", "AI 对话");
    window.set_min_size(Some(tauri::LogicalSize::new(400, 300))).unwrap_or_default();
    window.set_size(tauri::LogicalSize::new(600, 800)).unwrap_or_default();
    window.center().unwrap_or_default();
    window.show().unwrap_or_default();
}

#[tauri::command]
pub fn open_chat_window() {
    chat_window();
}

#[tauri::command]
pub fn open_translate_from_toolbar() {
    let app_handle = APP.get().unwrap();
    let text = {
        let state: tauri::State<StringWrapper> = app_handle.state();
        let guard = state.0.lock().unwrap();
        let s = guard.clone();
        drop(guard);
        s
    };
    let window = translate_window();
    window.emit("new_text", text).unwrap_or_default();
}

// ─────────────────────────────────────────────
// Vault Window
// ─────────────────────────────────────────────
pub fn vault_window() {
    let app_handle = APP.get().unwrap();
    if let Some(w) = app_handle.get_window("vault") {
        w.show().unwrap_or_default();
        w.set_focus().unwrap_or_default();
        return;
    }
    let (window, _) = build_window("vault", "密码本");
    window
        .set_min_size(Some(tauri::LogicalSize::new(600, 400)))
        .unwrap_or_default();
    window
        .set_size(tauri::LogicalSize::new(800, 600))
        .unwrap_or_default();
    window.center().unwrap_or_default();
    window.show().unwrap_or_default();
}

#[tauri::command(async)]
pub fn updater_window() {
    let (window, _exists) = build_window("updater", "Updater");
    window
        .set_min_size(Some(tauri::LogicalSize::new(600, 400)))
        .unwrap();
    window.set_size(tauri::LogicalSize::new(600, 400)).unwrap();
    window.center().unwrap();
}
