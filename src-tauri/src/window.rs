// fs and cache_dir are only used in macOS OCR code
#[cfg(target_os = "macos")]
use std::fs;

use crate::config::get;
use crate::config::set;
use crate::LightAiTargetWrapper;
use crate::PrevForegroundWindow;
use crate::StringWrapper;
use crate::TranslateExcerptModeWrapper;
use crate::APP;
#[cfg(target_os = "macos")]
use dirs::cache_dir;
use log::{debug, warn};
use once_cell::sync::Lazy;
#[cfg(target_os = "windows")]
use once_cell::sync::OnceCell;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::Manager;
use tauri::Monitor;
use tauri::Window;
use tauri::WindowBuilder;
#[cfg(any(target_os = "macos", target_os = "windows"))]
use window_shadows::set_shadow;
#[cfg(target_os = "windows")]
use windows::Win32::{
    Foundation::{HINSTANCE, LPARAM, WPARAM},
    UI::WindowsAndMessaging::{CreateIcon, SendMessageW, HICON, ICON_BIG, ICON_SMALL, WM_SETICON},
};

#[cfg(all(
    target_os = "windows",
    debug_assertions,
    not(feature = "custom-protocol")
))]
static DEV_WEBVIEW_DATA_DIR: Lazy<std::path::PathBuf> = Lazy::new(|| {
    let is_isolated = std::env::var("IMMERSIVE_INPUT_DEV_WEBVIEW_ISOLATED")
        .ok()
        .map(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
        .unwrap_or(false);
    let base_dir = dirs::data_local_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("com.immersive-input.desktop")
        .join("immersive-input-webview2-dev");
    let session_id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    let dir = if is_isolated {
        base_dir.join(format!("session-{}-{}", std::process::id(), session_id))
    } else {
        base_dir.join("shared-profile")
    };

    if let Some(parent) = dir.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::create_dir_all(&dir);
    if is_isolated {
        debug!(
            "[startup] using isolated WebView2 data directory for tauri dev: {:?}",
            dir
        );
    } else {
        debug!(
            "[startup] using persistent WebView2 data directory for tauri dev: {:?}",
            dir
        );
    }
    dir
});

#[cfg(all(
    target_os = "windows",
    debug_assertions,
    not(feature = "custom-protocol")
))]
fn with_dev_webview_data_directory<R: tauri::Runtime>(
    builder: WindowBuilder<R>,
) -> WindowBuilder<R> {
    builder.data_directory(DEV_WEBVIEW_DATA_DIR.clone())
}

#[cfg(not(all(
    target_os = "windows",
    debug_assertions,
    not(feature = "custom-protocol")
)))]
fn with_dev_webview_data_directory<R: tauri::Runtime>(
    builder: WindowBuilder<R>,
) -> WindowBuilder<R> {
    builder
}

// Get daemon window instance
fn get_daemon_window() -> Window {
    let app_handle = APP.get().unwrap();
    match app_handle.get_window("daemon") {
        Some(v) => v,
        None => {
            warn!("Daemon window not found, create new daemon window!");
            with_dev_webview_data_directory(WindowBuilder::new(
                app_handle,
                "daemon",
                tauri::WindowUrl::App("daemon.html".into()),
            ))
            .title("Daemon")
            .additional_browser_args("--disable-web-security")
            .visible(false)
            .build()
            .unwrap()
        }
    }
}

/// Safely get the monitor associated with a window.
/// If current_monitor() returns None (e.g. window is invisible / not yet shown),
/// falls back to primary monitor so we never panic.
fn get_window_monitor(window: &Window) -> Monitor {
    window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())
        .or_else(|| get_daemon_window().primary_monitor().ok().flatten())
        .expect("No monitor found for window")
}

pub fn set_light_ai_target(target: &str) {
    let app_handle = APP.get().unwrap();
    let state: tauri::State<LightAiTargetWrapper> = app_handle.state();
    *state.0.lock().unwrap() = target.to_string();
}

#[cfg(target_os = "windows")]
fn default_window_icon() -> Option<tauri::Icon> {
    if let Ok(icon_image) = image::load_from_memory(include_bytes!("../icons/128x128.png")) {
        let rgba = icon_image.into_rgba8();
        let (width, height) = rgba.dimensions();
        return Some(tauri::Icon::Rgba {
            rgba: rgba.into_raw(),
            width,
            height,
        });
    }

    None
}

#[cfg(not(target_os = "windows"))]
fn default_window_icon() -> Option<tauri::Icon> {
    None
}

#[cfg(target_os = "windows")]
static WINDOWS_APP_ICON_HANDLE: OnceCell<usize> = OnceCell::new();

#[cfg(target_os = "windows")]
fn default_window_hicon() -> Option<HICON> {
    WINDOWS_APP_ICON_HANDLE
        .get_or_try_init(|| -> Result<usize, ()> {
            let icon_image = image::load_from_memory(include_bytes!("../icons/128x128.png"))
                .map_err(|_| ())?
                .into_rgba8();
            let (width, height) = icon_image.dimensions();
            let mut rgba = icon_image.into_raw();
            let mut and_mask = Vec::with_capacity((rgba.len() / 4).max(1));

            for idx in (0..rgba.len()).step_by(4) {
                and_mask.push(rgba[idx + 3].wrapping_sub(u8::MAX));
                rgba.swap(idx, idx + 2);
            }

            let handle = unsafe {
                CreateIcon(
                    HINSTANCE::default(),
                    width as i32,
                    height as i32,
                    1,
                    32,
                    and_mask.as_ptr(),
                    rgba.as_ptr(),
                )
            }
            .map_err(|_| ())?;

            Ok(handle.0 as usize)
        })
        .ok()
        .map(|handle| HICON(*handle as *mut core::ffi::c_void))
}

#[cfg(target_os = "windows")]
fn apply_windows_window_icons(window: &Window) {
    let Ok(raw_hwnd) = window.hwnd() else {
        return;
    };
    let hwnd = windows::Win32::Foundation::HWND(raw_hwnd.0 as *mut core::ffi::c_void);
    let Some(hicon) = default_window_hicon() else {
        return;
    };

    unsafe {
        SendMessageW(
            hwnd,
            WM_SETICON,
            WPARAM(ICON_SMALL as usize),
            LPARAM(hicon.0 as isize),
        );
        SendMessageW(
            hwnd,
            WM_SETICON,
            WPARAM(ICON_BIG as usize),
            LPARAM(hicon.0 as isize),
        );
    }
}

#[cfg(not(target_os = "windows"))]
fn apply_windows_window_icons(_window: &Window) {}

#[derive(Clone, Copy)]
struct PopupAnchorBounds {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

static INPUT_AI_HANDLE_BOUNDS: Lazy<Mutex<Option<PopupAnchorBounds>>> =
    Lazy::new(|| Mutex::new(None));
static LIGHT_AI_OPENED_FROM_INPUT_HANDLE: AtomicBool = AtomicBool::new(false);

fn apply_default_window_icon(window: &Window) {
    if let Some(icon) = default_window_icon() {
        window.set_icon(icon).unwrap_or_default();
    }
    apply_windows_window_icons(window);
}

#[cfg(target_os = "windows")]
fn ensure_window_shows_in_taskbar(window: &Window) {
    // These windows are created hidden first. On Windows, explicitly re-adding
    // them after show() avoids cases where the taskbar button never appears.
    window.set_skip_taskbar(false).unwrap_or_default();
}

#[cfg(not(target_os = "windows"))]
fn ensure_window_shows_in_taskbar(_window: &Window) {}

fn show_app_window(window: &Window) {
    apply_default_window_icon(window);
    window.show().unwrap_or_default();
    ensure_window_shows_in_taskbar(window);
    apply_default_window_icon(window);
}

fn set_input_ai_handle_bounds(x: i32, y: i32, width: i32, height: i32) {
    *INPUT_AI_HANDLE_BOUNDS.lock().unwrap() = Some(PopupAnchorBounds {
        x,
        y,
        width,
        height,
    });
}

fn get_input_ai_handle_bounds() -> Option<PopupAnchorBounds> {
    *INPUT_AI_HANDLE_BOUNDS.lock().unwrap()
}

pub fn set_light_ai_opened_from_input_handle(opened: bool) {
    LIGHT_AI_OPENED_FROM_INPUT_HANDLE.store(opened, Ordering::SeqCst);
}

pub fn is_light_ai_opened_from_input_handle() -> bool {
    LIGHT_AI_OPENED_FROM_INPUT_HANDLE.load(Ordering::SeqCst)
}

pub fn is_light_ai_window_visible() -> bool {
    APP.get()
        .and_then(|app_handle| app_handle.get_window("light_ai"))
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false)
}

pub fn hide_light_ai_window() {
    if let Some(app_handle) = APP.get() {
        if let Some(window) = app_handle.get_window("light_ai") {
            window.hide().unwrap_or_default();
        }
    }
    set_light_ai_opened_from_input_handle(false);
}

pub fn restore_foreground_window() {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::SetForegroundWindow;

        let app_handle = APP.get().unwrap();
        let state: tauri::State<PrevForegroundWindow> = app_handle.state();
        let prev_hwnd = *state.0.lock().unwrap();
        if prev_hwnd != 0 {
            unsafe {
                let _ = SetForegroundWindow(HWND(prev_hwnd as *mut core::ffi::c_void));
            }
            std::thread::sleep(std::time::Duration::from_millis(80));
        }
    }
}

// Get monitor where the mouse is currently located
fn get_current_monitor(x: i32, y: i32) -> Monitor {
    debug!("Mouse position: {}, {}", x, y);
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
            debug!("Current Monitor: {:?}", m);
            return m;
        }
    }
    warn!("Current Monitor not found, using primary monitor");
    daemon_window.primary_monitor().unwrap().unwrap()
}

fn window_size_key(label: &str, field: &str) -> String {
    format!("{}_window_{}", label, field)
}

fn get_saved_window_dimension(label: &str, field: &str, default_value: i64) -> i64 {
    let key = window_size_key(label, field);
    match get(&key) {
        Some(value) => value.as_i64().unwrap_or(default_value),
        None => {
            set(&key, default_value);
            default_value
        }
    }
}

fn get_saved_window_size(label: &str, default_width: i64, default_height: i64) -> (i64, i64) {
    (
        get_saved_window_dimension(label, "width", default_width),
        get_saved_window_dimension(label, "height", default_height),
    )
}

fn get_saved_window_size_with_min(
    label: &str,
    default_width: i64,
    default_height: i64,
    min_width: i64,
    min_height: i64,
) -> (i64, i64) {
    let (saved_width, saved_height) = get_saved_window_size(label, default_width, default_height);
    if saved_width >= min_width && saved_height >= min_height {
        return (saved_width, saved_height);
    }

    set(&window_size_key(label, "width"), default_width);
    set(&window_size_key(label, "height"), default_height);
    (default_width, default_height)
}

fn apply_saved_window_size(
    window: &Window,
    label: &str,
    default_width: i64,
    default_height: i64,
) -> (i64, i64) {
    let (width, height) = get_saved_window_size(label, default_width, default_height);
    window
        .set_size(tauri::LogicalSize::new(width as f64, height as f64))
        .unwrap_or_default();
    (width, height)
}

fn apply_saved_window_size_with_min(
    window: &Window,
    label: &str,
    default_width: i64,
    default_height: i64,
    min_width: i64,
    min_height: i64,
) -> (i64, i64) {
    let (width, height) =
        get_saved_window_size_with_min(label, default_width, default_height, min_width, min_height);
    window
        .set_size(tauri::LogicalSize::new(width as f64, height as f64))
        .unwrap_or_default();
    (width, height)
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
            debug!("Window existence: {}", label);
            apply_default_window_icon(&v);
            v.set_focus().unwrap();
            (v, true)
        }
        None => {
            debug!("Window not existence, Creating new window: {}", label);
            let mut builder = with_dev_webview_data_directory(tauri::WindowBuilder::new(
                app_handle,
                label,
                tauri::WindowUrl::App("index.html".into()),
            ))
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

            if let Some(icon) = default_window_icon() {
                builder = builder.icon(icon).unwrap();
            }

            let window = builder.build().unwrap();
            apply_default_window_icon(&window);

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
    let t0 = std::time::Instant::now();
    let app_handle = APP.get().unwrap();

    // 如果窗口已存在，直接激活
    if let Some(w) = app_handle.get_window("config") {
        apply_default_window_icon(&w);
        show_app_window(&w);
        w.set_focus().unwrap_or_default();
        return;
    }

    // Config 窗口不使用透明：已移除透明效果功能。
    // WebView2 白色实底 + #app-loading 遮罩保证无白屏问题。
    let mut builder = with_dev_webview_data_directory(tauri::WindowBuilder::new(
        app_handle,
        "config",
        tauri::WindowUrl::App("index.html".into()),
    ))
    .additional_browser_args("--disable-web-security")
    .focused(true)
    .title("Config")
    .inner_size(800.0, 600.0)
    .visible(false);

    #[cfg(target_os = "macos")]
    {
        builder = builder
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true);
    }
    #[cfg(not(target_os = "macos"))]
    {
        builder = builder.decorations(false);
    }

    if let Some(icon) = default_window_icon() {
        builder = builder.icon(icon).unwrap();
    }

    let window = builder.build().unwrap();
    apply_default_window_icon(&window);

    #[cfg(not(target_os = "linux"))]
    set_shadow(&window, true).unwrap_or_default();

    window
        .set_min_size(Some(tauri::LogicalSize::new(800, 400)))
        .unwrap();
    apply_saved_window_size_with_min(&window, "config", 800, 600, 800, 400);
    window.center().unwrap();
    show_app_window(&window);
    debug!(
        "[startup] config window shown at {}ms (loading overlay active)",
        t0.elapsed().as_millis()
    );
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
    let (window, _) = build_window("translate", "Translate");
    window.set_skip_taskbar(true).unwrap();
    let (width, height) = get_saved_window_size("translate", 350, 420);

    let monitor = get_window_monitor(&window);
    let dpi = monitor.scale_factor();

    window
        .set_size(tauri::LogicalSize::new(width as f64, height as f64))
        .unwrap();

    // Adjust window position
    let monitor_size = monitor.size();
    let monitor_size_width = monitor_size.width as f64;
    let monitor_size_height = monitor_size.height as f64;
    let monitor_position = monitor.position();
    let monitor_position_x = monitor_position.x as f64;
    let monitor_position_y = monitor_position.y as f64;

    if mouse_position.x as f64 + width as f64 * dpi > monitor_position_x + monitor_size_width {
        mouse_position.x -= (width as f64 * dpi) as i32;
        if (mouse_position.x as f64) < monitor_position_x {
            mouse_position.x = monitor_position_x as i32;
        }
    }
    if mouse_position.y as f64 + height as f64 * dpi > monitor_position_y + monitor_size_height {
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

    window.show().unwrap_or_default();
    window.set_focus().unwrap_or_default();
    window
}

fn is_translate_excerpt_mode_enabled() -> bool {
    let app_handle = APP.get().unwrap();
    let state: tauri::State<TranslateExcerptModeWrapper> = app_handle.state();
    let enabled = *state.0.lock().unwrap();
    enabled
}

fn append_to_existing_translate_window_if_excerpt(text: &str) -> bool {
    if text.trim().is_empty() || !is_translate_excerpt_mode_enabled() {
        return false;
    }

    let app_handle = APP.get().unwrap();
    if let Some(window) = app_handle.get_window("translate") {
        window
            .emit("new_text", text.to_string())
            .unwrap_or_default();
        return true;
    }

    false
}

#[tauri::command]
pub fn set_translate_excerpt_mode(enabled: bool) {
    let app_handle = APP.get().unwrap();
    let state: tauri::State<TranslateExcerptModeWrapper> = app_handle.state();
    *state.0.lock().unwrap() = enabled;
}

// Save the currently focused window handle
pub fn save_foreground_window() {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::WindowsAndMessaging::{
            GetForegroundWindow, GetWindowThreadProcessId,
        };
        let app_handle = APP.get().unwrap();
        let state: tauri::State<PrevForegroundWindow> = app_handle.state();
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.0.is_null() {
                return;
            }
            let mut process_id = 0u32;
            let _ = GetWindowThreadProcessId(hwnd, Some(&mut process_id));
            if process_id == std::process::id() {
                return;
            }
            // HWND inner type is *mut c_void; cast to isize for storage
            *state.0.lock().unwrap() = hwnd.0 as isize;
        }
    }
}

pub fn selection_translate() {
    // Save foreground window before we open any popup
    save_foreground_window();
    // Get Selected Text
    let text = crate::selection_capture::get_text(None);
    if !text.trim().is_empty() {
        let app_handle = APP.get().unwrap();
        // Write into State
        let state: tauri::State<StringWrapper> = app_handle.state();
        state.0.lock().unwrap().replace_range(.., &text);

        if append_to_existing_translate_window_if_excerpt(&text) {
            return;
        }
    }
    // Check config: show floating toolbar or go directly to translate window
    crate::config::reload();
    let behavior = match get("text_select_behavior") {
        Some(v) => v.as_str().unwrap_or("toolbar").to_string(),
        None => "toolbar".to_string(),
    };
    if behavior == "toolbar" && !text.trim().is_empty() {
        float_toolbar_window();
    } else {
        let window = translate_window();
        window.emit("new_text", text).unwrap();
    }
}

/// Called from mouse_hook when behavior is "direct_translate".
/// Writes the already-captured text into state and opens the translate window directly.
pub fn direct_translate_selection(text: String) {
    let app_handle = APP.get().unwrap();
    let state: tauri::State<StringWrapper> = app_handle.state();
    state.0.lock().unwrap().replace_range(.., &text);

    if append_to_existing_translate_window_if_excerpt(&text) {
        return;
    }

    let window = translate_window();
    window.emit("new_text", text).unwrap();
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
    window.emit("new_text", "[INPUT_TRANSLATE]").unwrap();
}

pub fn text_translate(text: String) {
    let app_handle = APP.get().unwrap();
    // Clear State
    let state: tauri::State<StringWrapper> = app_handle.state();
    state.0.lock().unwrap().replace_range(.., &text);

    if append_to_existing_translate_window_if_excerpt(&text) {
        return;
    }

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
        show_app_window(&window);
        return;
    }
    apply_saved_window_size(&window, "recognize", 800, 400);
    window.center().unwrap();
    show_app_window(&window);
    window.emit("new_image", "").unwrap();
}

#[cfg(not(target_os = "macos"))]
fn screenshot_window() -> Window {
    let (window, exists) = build_window("screenshot", "Screenshot");

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
    if exists {
        window.emit("refresh_screenshot", ()).unwrap_or_default();
    }
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
        debug!("Screenshot path: {}", path);
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
        debug!("Screenshot path: {}", path);
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
        let monitor = get_window_monitor(&w);
        let dpi = monitor.scale_factor();
        let monitor_size = monitor.size();
        let monitor_pos = monitor.position();
        let w_width = (400.0 * dpi) as i32;
        let w_height = (80.0 * dpi) as i32;
        let mut x = mouse_pos.x - w_width / 2;
        let mut y = mouse_pos.y - w_height - 12;
        if x + w_width > monitor_pos.x + monitor_size.width as i32 {
            x = monitor_pos.x + monitor_size.width as i32 - w_width;
        }
        if x < monitor_pos.x {
            x = monitor_pos.x;
        }
        if y < monitor_pos.y {
            y = mouse_pos.y + 20;
        }
        w.set_position(tauri::PhysicalPosition::new(x, y))
            .unwrap_or_default();
        w.show().unwrap_or_default();
        w.emit("selection_text_updated", ()).unwrap_or_default();
        return;
    }
    let mut builder = with_dev_webview_data_directory(tauri::WindowBuilder::new(
        app_handle,
        "float_toolbar",
        tauri::WindowUrl::App("index.html".into()),
    ))
    // transparent(true) + CSS box-shadow 实现悬浮卡片效果，圆角外区域透明显示后方内容
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(false)
    .visible(false)
    .inner_size(600.0, 100.0) // frontend will resize dynamically
    .additional_browser_args("--disable-web-security");
    #[cfg(not(target_os = "macos"))]
    {
        // macOS without tauri's private API does not expose WindowBuilder::transparent.
        builder = builder.transparent(true);
    }
    let window = match builder.build() {
        Ok(w) => w,
        Err(e) => {
            warn!("Failed to create float_toolbar window: {:?}", e);
            return;
        }
    };
    let monitor = get_window_monitor(&window);
    let dpi = monitor.scale_factor();
    let monitor_size = monitor.size();
    let monitor_pos = monitor.position();
    let w_width = (400.0 * dpi) as i32;
    let w_height = (80.0 * dpi) as i32;
    let mut x = mouse_pos.x - w_width / 2;
    let mut y = mouse_pos.y - w_height - 12;
    if x + w_width > monitor_pos.x + monitor_size.width as i32 {
        x = monitor_pos.x + monitor_size.width as i32 - w_width;
    }
    if x < monitor_pos.x {
        x = monitor_pos.x;
    }
    if y < monitor_pos.y {
        y = mouse_pos.y + 20;
    }
    window
        .set_position(tauri::PhysicalPosition::new(x, y))
        .unwrap_or_default();
    window.show().unwrap_or_default();
}

pub fn show_input_ai_handle_window(x: i32, y: i32) {
    let Some(app_handle) = APP.get() else {
        return;
    };
    set_input_ai_handle_bounds(x, y, 24, 24);

    if let Some(window) = app_handle.get_window("input_ai_handle") {
        window
            .set_size(tauri::LogicalSize::new(24.0, 24.0))
            .unwrap_or_default();
        window
            .set_position(tauri::PhysicalPosition::new(x, y))
            .unwrap_or_default();
        window.show().unwrap_or_default();
        return;
    }

    let mut builder = with_dev_webview_data_directory(tauri::WindowBuilder::new(
        app_handle,
        "input_ai_handle",
        tauri::WindowUrl::App("index.html".into()),
    ))
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(false)
    .resizable(false)
    .visible(false)
    .inner_size(24.0, 24.0)
    .additional_browser_args("--disable-web-security");
    #[cfg(not(target_os = "macos"))]
    {
        builder = builder.transparent(true);
    }
    let window = match builder.build() {
        Ok(window) => window,
        Err(error) => {
            warn!("Failed to create input_ai_handle window: {:?}", error);
            return;
        }
    };

    window
        .set_size(tauri::LogicalSize::new(24.0, 24.0))
        .unwrap_or_default();
    window
        .set_position(tauri::PhysicalPosition::new(x, y))
        .unwrap_or_default();
    window.show().unwrap_or_default();
}

pub fn hide_input_ai_handle_window() {
    if let Some(app_handle) = APP.get() {
        if let Some(window) = app_handle.get_window("input_ai_handle") {
            window.hide().unwrap_or_default();
        }
    }
}

// ─────────────────────────────────────────────
// LightAI Window
// ─────────────────────────────────────────────
pub fn selection_light_ai() {
    debug!("selection_light_ai called");
    set_light_ai_opened_from_input_handle(false);
    set_light_ai_target("selection");
    // Save foreground window before we open any popup
    save_foreground_window();
    // Get Selected Text
    let text = crate::selection_capture::get_text(None);
    debug!("Got text from selection: {:?}", text);
    if !text.trim().is_empty() {
        let app_handle = APP.get().unwrap();
        // Write into State
        let state: tauri::State<StringWrapper> = app_handle.state();
        state.0.lock().unwrap().replace_range(.., &text);
        debug!("Text saved to state");
    } else {
        debug!("No text selected or text is empty");
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
    let (window, exists) = build_window("light_ai", "AI 编辑器");
    window.set_skip_taskbar(true).unwrap_or_default();
    if exists {
        show_app_window(&window);
        window.set_focus().unwrap_or_default();
        window.emit("new_text", text).unwrap_or_default();
        return;
    }
    let monitor = get_window_monitor(&window);
    let dpi = monitor.scale_factor();
    let monitor_size = monitor.size();
    let monitor_pos = monitor.position();
    let (saved_width, saved_height) = apply_saved_window_size(&window, "light_ai", 460, 540);
    let w_width = saved_width as f64;
    let w_height = saved_height as f64;
    let mut x = mouse_pos.x;
    let mut y = mouse_pos.y;
    if x as f64 + w_width * dpi > (monitor_pos.x + monitor_size.width as i32) as f64 {
        x -= (w_width * dpi) as i32;
    }
    if y as f64 + w_height * dpi > (monitor_pos.y + monitor_size.height as i32) as f64 {
        y -= (w_height * dpi) as i32;
    }
    if x < monitor_pos.x {
        x = monitor_pos.x;
    }
    if y < monitor_pos.y {
        y = monitor_pos.y;
    }
    window
        .set_position(tauri::PhysicalPosition::new(x, y))
        .unwrap_or_default();
    show_app_window(&window);
    window.set_focus().unwrap_or_default();
    window.emit("new_text", text).unwrap_or_default();
}

fn reposition_light_ai_window_near_handle(window: &Window) {
    let Some(anchor) = get_input_ai_handle_bounds() else {
        return;
    };
    let Ok(size) = window.outer_size() else {
        return;
    };

    let monitor = get_current_monitor(anchor.x + anchor.width / 2, anchor.y + anchor.height / 2);
    let monitor_size = monitor.size();
    let monitor_pos = monitor.position();
    let popup_width = size.width as i32;
    let popup_height = size.height as i32;
    let monitor_left = monitor_pos.x + 8;
    let monitor_top = monitor_pos.y + 8;
    let monitor_right = monitor_pos.x + monitor_size.width as i32 - 8;
    let monitor_bottom = monitor_pos.y + monitor_size.height as i32 - 8;

    let mut x = anchor.x + anchor.width - popup_width;
    let mut y = anchor.y - popup_height - 10;

    if y < monitor_top {
        y = anchor.y + anchor.height + 10;
    }
    if x < monitor_left {
        x = monitor_left;
    }
    if x + popup_width > monitor_right {
        x = (monitor_right - popup_width).max(monitor_left);
    }
    if y + popup_height > monitor_bottom {
        y = (monitor_bottom - popup_height).max(monitor_top);
    }

    window
        .set_position(tauri::PhysicalPosition::new(x, y))
        .unwrap_or_default();
}

pub fn light_ai_window_from_input_handle() {
    light_ai_window();

    if let Some(app_handle) = APP.get() {
        if let Some(window) = app_handle.get_window("light_ai") {
            reposition_light_ai_window_near_handle(&window);
            window.set_focus().unwrap_or_default();
        }
    }
}

// ─────────────────────────────
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
    let monitor = get_window_monitor(&window);
    let dpi = monitor.scale_factor();
    let monitor_size = monitor.size();
    let monitor_pos = monitor.position();
    let (saved_width, saved_height) = apply_saved_window_size(&window, "explain", 400, 500);
    let w_width = saved_width as f64;
    let w_height = saved_height as f64;
    let mut x = mouse_pos.x;
    let mut y = mouse_pos.y;
    if x as f64 + w_width * dpi > (monitor_pos.x + monitor_size.width as i32) as f64 {
        x -= (w_width * dpi) as i32;
    }
    if y as f64 + w_height * dpi > (monitor_pos.y + monitor_size.height as i32) as f64 {
        y -= (w_height * dpi) as i32;
    }
    if x < monitor_pos.x {
        x = monitor_pos.x;
    }
    if y < monitor_pos.y {
        y = monitor_pos.y;
    }
    window
        .set_position(tauri::PhysicalPosition::new(x, y))
        .unwrap_or_default();
    window.show().unwrap_or_default();
    window.emit("new_text", text).unwrap_or_default();
}

// ─────────────────────────────
// Tauri commands for frontend to open windows
// ─────────────────────────────────────────────
#[tauri::command]
#[allow(dead_code)]
pub fn open_light_ai_window() {
    set_light_ai_opened_from_input_handle(false);
    set_light_ai_target("selection");
    // Window creation via build() deadlocks on the WebView2 IPC thread.
    // Spawning a separate thread mirrors float_toolbar_window() which works.
    std::thread::spawn(|| {
        light_ai_window();
    });
}
#[tauri::command]
pub fn open_explain_window() {
    std::thread::spawn(|| {
        explain_window();
    });
}
// ─────────────────────────────────────────────
// Chat Window
// ─────────────────────────────────────────────
pub fn chat_window() {
    let app_handle = APP.get().unwrap();
    if let Some(w) = app_handle.get_window("chat") {
        show_app_window(&w);
        w.set_focus().unwrap_or_default();
        return;
    }
    let (window, _) = build_window("chat", "AI 对话");
    window
        .set_min_size(Some(tauri::LogicalSize::new(400, 300)))
        .unwrap_or_default();
    apply_saved_window_size(&window, "chat", 460, 540);
    window.center().unwrap_or_default();
    show_app_window(&window);
}

#[tauri::command]
pub fn open_chat_window() {
    std::thread::spawn(|| {
        chat_window();
    });
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
    if append_to_existing_translate_window_if_excerpt(&text) {
        return;
    }
    // Window creation via build() deadlocks on the WebView2 IPC thread.
    // Read text first (needs AppHandle state lock), then spawn a new thread
    // for window creation — same pattern as float_toolbar_window().
    std::thread::spawn(move || {
        let window = translate_window();
        window.emit("new_text", text).unwrap_or_default();
    });
}

// ─────────────────────────────────────────────
// PhrasesInline Window
// ─────────────────────────────────────────────
pub fn phrases_inline_window() {
    use mouse_position::mouse_position::{Mouse, Position};
    const QUICK_W: f64 = 372.0;
    const QUICK_H: f64 = 96.0;
    let quick_width =
        (get_saved_window_dimension("phrases_inline", "width", QUICK_W as i64) as f64).max(QUICK_W);
    let mouse_pos = match Mouse::get_mouse_position() {
        Mouse::Position { x, y } => Position { x, y },
        Mouse::Error => Position { x: 0, y: 0 },
    };
    let app_handle = APP.get().unwrap();

    if let Some(w) = app_handle.get_window("phrases_inline") {
        let monitor = get_window_monitor(&w);
        let dpi = monitor.scale_factor();
        let w_w = (quick_width * dpi) as i32;
        let w_h = (QUICK_H * dpi) as i32;
        let monitor_size = monitor.size();
        let monitor_pos = monitor.position();
        w.set_size(tauri::PhysicalSize::new(w_w as u32, w_h as u32))
            .unwrap_or_default();
        let mut x = mouse_pos.x - w_w / 2;
        let mut y = mouse_pos.y - w_h - 12;
        if x + w_w > monitor_pos.x + monitor_size.width as i32 {
            x = monitor_pos.x + monitor_size.width as i32 - w_w;
        }
        if x < monitor_pos.x {
            x = monitor_pos.x;
        }
        if y < monitor_pos.y {
            y = mouse_pos.y + 20;
        }
        w.set_position(tauri::PhysicalPosition::new(x, y))
            .unwrap_or_default();
        w.show().unwrap_or_default();
        w.set_focus().unwrap_or_default();
        return;
    }

    let (window, _) = build_window("phrases_inline", "常用语");
    window.set_skip_taskbar(true).unwrap_or_default();
    window.set_always_on_top(true).unwrap_or_default();

    let monitor = get_window_monitor(&window);
    let dpi = monitor.scale_factor();
    let monitor_size = monitor.size();
    let monitor_pos = monitor.position();
    let w_w = quick_width;
    let w_h = QUICK_H;
    window
        .set_size(tauri::LogicalSize::new(w_w, w_h))
        .unwrap_or_default();
    let mut x = mouse_pos.x - (w_w * dpi / 2.0) as i32;
    let mut y = mouse_pos.y - (w_h * dpi + 12.0) as i32;
    if x as f64 + w_w * dpi > (monitor_pos.x + monitor_size.width as i32) as f64 {
        x = (monitor_pos.x + monitor_size.width as i32) as i32 - (w_w * dpi) as i32;
    }
    if x < monitor_pos.x {
        x = monitor_pos.x;
    }
    if y < monitor_pos.y {
        y = mouse_pos.y + 20;
    }
    window
        .set_position(tauri::PhysicalPosition::new(x, y))
        .unwrap_or_default();
    window.show().unwrap_or_default();
}

// ─────────────────────────────────────────────
// Vault Window
// ─────────────────────────────────────────────
pub fn vault_window() {
    let app_handle = APP.get().unwrap();
    if let Some(w) = app_handle.get_window("vault") {
        show_app_window(&w);
        w.set_focus().unwrap_or_default();
        return;
    }

    let mut builder = with_dev_webview_data_directory(tauri::WindowBuilder::new(
        app_handle,
        "vault",
        tauri::WindowUrl::App("index.html".into()),
    ))
    .title("Vault")
    .inner_size(800.0, 600.0)
    .additional_browser_args("--disable-web-security")
    .focused(true)
    .visible(false);

    #[cfg(target_os = "macos")]
    {
        builder = builder
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true);
    }
    #[cfg(not(target_os = "macos"))]
    {
        builder = builder.decorations(false);
    }

    if let Some(icon) = default_window_icon() {
        builder = builder.icon(icon).unwrap();
    }

    let window = builder.build().unwrap();
    apply_default_window_icon(&window);

    #[cfg(not(target_os = "linux"))]
    set_shadow(&window, true).unwrap_or_default();

    window
        .set_min_size(Some(tauri::LogicalSize::new(600, 400)))
        .unwrap_or_default();
    apply_saved_window_size_with_min(&window, "vault", 800, 600, 600, 400);
    window.center().unwrap_or_default();
    show_app_window(&window);
    window.set_focus().unwrap_or_default();
    return;
}

// ─────────────────────────────────────────────
// Login Window
// ─────────────────────────────────────────────
pub fn login_window() {
    let app_handle = APP.get().unwrap();
    debug!("login_window called");
    if let Some(w) = app_handle.get_window("login") {
        apply_default_window_icon(&w);
        show_app_window(&w);
        w.set_focus().unwrap_or_default();
        return;
    }
    // 登录窗口直接用 WindowBuilder 构建，避免 build_window 的鼠标定位逻辑
    let mut builder = with_dev_webview_data_directory(tauri::WindowBuilder::new(
        app_handle,
        "login",
        tauri::WindowUrl::App("index.html".into()),
    ))
    .title("Flow Input")
    .inner_size(500.0, 740.0)
    .resizable(false)
    .center()
    .additional_browser_args("--disable-web-security")
    .focused(true)
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

    if let Some(icon) = default_window_icon() {
        builder = builder.icon(icon).unwrap();
    }

    let window = builder.build().unwrap();
    apply_default_window_icon(&window);

    #[cfg(not(target_os = "linux"))]
    set_shadow(&window, true).unwrap_or_default();

    show_app_window(&window);
    window.set_focus().unwrap_or_default();
}

#[tauri::command(async)]
pub fn open_login_window() {
    login_window();
}

#[tauri::command(async)]
pub fn updater_window() {
    let (window, _exists) = build_window("updater", "Updater");
    window
        .set_min_size(Some(tauri::LogicalSize::new(600, 400)))
        .unwrap();
    apply_saved_window_size(&window, "updater", 600, 400);
    window.center().unwrap();
    show_app_window(&window);
}
