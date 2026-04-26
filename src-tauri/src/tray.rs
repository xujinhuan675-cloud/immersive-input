use crate::clipboard::*;
use crate::config::{get, set};
use crate::phrases::open_phrases_window;
use crate::window::chat_window;
use crate::window::config_window;
use crate::window::input_translate;
use crate::window::ocr_recognize;
use crate::window::ocr_translate;
use crate::window::selection_light_ai;
use crate::window::updater_window;
use crate::window::vault_window;
use log::{debug, info};
use tauri::CustomMenuItem;
use tauri::GlobalShortcutManager;
use tauri::SystemTrayEvent;
use tauri::SystemTrayMenu;
use tauri::SystemTrayMenuItem;
use tauri::SystemTraySubmenu;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn update_tray(app_handle: tauri::AppHandle, mut language: String, mut copy_mode: String) {
    let tray_handle = app_handle.tray_handle();
    let text_select_behavior = match get("text_select_behavior") {
        Some(v) => v.as_str().unwrap_or("toolbar").to_string(),
        None => {
            set("text_select_behavior", "toolbar");
            "toolbar".to_string()
        }
    };

    if language.is_empty() {
        language = match get("app_language") {
            Some(v) => v.as_str().unwrap().to_string(),
            None => {
                set("app_language", "en");
                "en".to_string()
            }
        };
    }
    if copy_mode.is_empty() {
        copy_mode = match get("translate_auto_copy") {
            Some(v) => v.as_str().unwrap().to_string(),
            None => {
                set("translate_auto_copy", "disable");
                "disable".to_string()
            }
        };
    }

    debug!(
        "Update tray with language: {}, copy mode: {}, text select behavior: {}",
        language, copy_mode, text_select_behavior
    );
    tray_handle
        .set_menu(match language.as_str() {
            "en" => tray_menu_en_refined(),
            "zh_cn" => tray_menu_zh_cn_refined(),
            "zh_tw" => tray_menu_zh_tw_refined(),
            "ja" => tray_menu_ja_refined(),
            "ko" => tray_menu_ko_refined(),
            "fr" => tray_menu_fr_refined(),
            "de" => tray_menu_de_refined(),
            "ru" => tray_menu_ru_refined(),
            "pt_br" => tray_menu_pt_br_refined(),
            "fa" => tray_menu_fa_refined(),
            "uk" => tray_menu_uk_refined(),
            _ => tray_menu_en_refined(),
        })
        .unwrap();
    #[cfg(not(target_os = "linux"))]
    tray_handle
        .set_tooltip(&format!(
            "Flow Input {}",
            app_handle.package_info().version
        ))
        .unwrap();

    let enable_clipboard_monitor = match get("clipboard_monitor") {
        Some(v) => v.as_bool().unwrap(),
        None => {
            set("clipboard_monitor", false);
            false
        }
    };

    tray_handle
        .get_item("clipboard_monitor")
        .set_selected(enable_clipboard_monitor)
        .unwrap();

    match copy_mode.as_str() {
        "source" => tray_handle
            .get_item("copy_source")
            .set_selected(true)
            .unwrap(),
        "target" => tray_handle
            .get_item("copy_target")
            .set_selected(true)
            .unwrap(),
        "source_target" => tray_handle
            .get_item("copy_source_target")
            .set_selected(true)
            .unwrap(),
        "disable" => tray_handle
            .get_item("copy_disable")
            .set_selected(true)
            .unwrap(),
        _ => {}
    }

    match text_select_behavior.as_str() {
        "direct_translate" => tray_handle
            .get_item("text_select_behavior_direct")
            .set_selected(true)
            .unwrap(),
        "disabled" => tray_handle
            .get_item("text_select_behavior_disabled")
            .set_selected(true)
            .unwrap(),
        "toolbar" => tray_handle
            .get_item("text_select_behavior_toolbar")
            .set_selected(true)
            .unwrap(),
        _ => {}
    }
}

pub fn tray_event_handler<'a>(app: &'a AppHandle, event: SystemTrayEvent) {
    match event {
        #[cfg(target_os = "windows")]
        SystemTrayEvent::LeftClick { .. } => on_tray_click(),
        SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
            "input_translate" => on_input_translate_click(),
            "copy_source" => on_auto_copy_click(app, "source"),
            "clipboard_monitor" => on_clipboard_monitor_click(app),
            "copy_target" => on_auto_copy_click(app, "target"),
            "copy_source_target" => on_auto_copy_click(app, "source_target"),
            "copy_disable" => on_auto_copy_click(app, "disable"),
            "text_select_behavior_toolbar" => on_text_select_behavior_click(app, "toolbar"),
            "text_select_behavior_direct" => {
                on_text_select_behavior_click(app, "direct_translate")
            }
            "text_select_behavior_disabled" => on_text_select_behavior_click(app, "disabled"),
            "ocr_recognize" => on_ocr_recognize_click(),
            "ocr_translate" => on_ocr_translate_click(),
            "light_ai" => selection_light_ai(),
            "chat" => chat_window(),
            "vault" => vault_window(),
            "phrases" => open_phrases_window(),
            "config" => on_config_click(),
            "check_update" => on_check_update_click(),
            "restart" => on_restart_click(app),
            "quit" => on_quit_click(app),
            _ => {}
        },
        _ => {}
    }
}

#[cfg(target_os = "windows")]
fn on_tray_click() {
    let event = match get("tray_click_event") {
        Some(v) => v.as_str().unwrap().to_string(),
        None => {
            set("tray_click_event", "config");
            "config".to_string()
        }
    };
    match event.as_str() {
        "config" => config_window(),
        "translate" => input_translate(),
        "ocr_recognize" => ocr_recognize(),
        "ocr_translate" => ocr_translate(),
        "disable" => {}
        _ => config_window(),
    }
}
fn on_input_translate_click() {
    input_translate();
}
fn on_clipboard_monitor_click(app: &AppHandle) {
    let enable_clipboard_monitor = match get("clipboard_monitor") {
        Some(v) => v.as_bool().unwrap(),
        None => {
            set("clipboard_monitor", false);
            false
        }
    };
    let current = !enable_clipboard_monitor;
    // Update Config File
    set("clipboard_monitor", current);
    // Update State and Start Monitor
    let state = app.state::<ClipboardMonitorEnableWrapper>();
    state
        .0
        .lock()
        .unwrap()
        .replace_range(.., &current.to_string());
    if current {
        start_clipboard_monitor(app.app_handle());
    }
    // Update Tray Menu Status
    app.tray_handle()
        .get_item("clipboard_monitor")
        .set_selected(current)
        .unwrap();
}
fn on_auto_copy_click(app: &AppHandle, mode: &str) {
    debug!("Set copy mode to: {}", mode);
    set("translate_auto_copy", mode);
    app.emit_all("translate_auto_copy_changed", mode).unwrap();
    update_tray(app.app_handle(), "".to_string(), mode.to_string());
}
fn on_text_select_behavior_click(app: &AppHandle, mode: &str) {
    debug!("Set text select behavior to: {}", mode);
    set("text_select_behavior", mode);
    app.emit_all("text_select_behavior_changed", mode)
        .unwrap_or_default();
    update_tray(app.app_handle(), "".to_string(), "".to_string());
}
fn on_ocr_recognize_click() {
    ocr_recognize();
}
fn on_ocr_translate_click() {
    ocr_translate();
}

fn on_config_click() {
    config_window();
}

fn on_check_update_click() {
    updater_window();
}
fn on_restart_click(app: &AppHandle) {
    info!("============== Restart App ==============");
    app.restart();
}
fn on_quit_click(app: &AppHandle) {
    app.global_shortcut_manager().unregister_all().unwrap();
    info!("============== Quit App ==============");
    app.exit(0);
}

#[allow(dead_code)]
fn tray_menu_en() -> tauri::SystemTrayMenu {
    tray_menu_en_refined()
}

#[allow(dead_code)]
fn tray_menu_zh_cn() -> tauri::SystemTrayMenu {
    tray_menu_zh_cn_refined()
}

#[allow(dead_code)]
fn tray_menu_zh_tw() -> tauri::SystemTrayMenu {
    tray_menu_zh_tw_refined()
}

#[allow(dead_code)]
fn tray_menu_ja() -> tauri::SystemTrayMenu {
    tray_menu_ja_refined()
}

#[allow(dead_code)]
fn tray_menu_ko() -> tauri::SystemTrayMenu {
    tray_menu_ko_refined()
}

#[allow(dead_code)]
fn tray_menu_fr() -> tauri::SystemTrayMenu {
    tray_menu_fr_refined()
}

#[allow(dead_code)]
fn tray_menu_de() -> tauri::SystemTrayMenu {
    tray_menu_de_refined()
}

#[allow(dead_code)]
fn tray_menu_ru() -> tauri::SystemTrayMenu {
    tray_menu_ru_refined()
}

#[allow(dead_code)]
fn tray_menu_fa() -> tauri::SystemTrayMenu {
    tray_menu_fa_refined()
}

#[allow(dead_code)]
fn tray_menu_pt_br() -> tauri::SystemTrayMenu {
    tray_menu_pt_br_refined()
}

#[allow(dead_code)]
fn tray_menu_uk() -> tauri::SystemTrayMenu {
    tray_menu_uk_refined()
}

struct TrayMenuLabels<'a> {
    input_translate: &'a str,
    light_ai: &'a str,
    chat: &'a str,
    phrases: &'a str,
    vault: &'a str,
    recognition_tools: &'a str,
    ocr_recognize: &'a str,
    ocr_translate: &'a str,
    clipboard: &'a str,
    clipboard_monitor: &'a str,
    auto_copy: &'a str,
    copy_source: &'a str,
    copy_target: &'a str,
    copy_source_target: &'a str,
    copy_disable: &'a str,
    text_selection: &'a str,
    text_selection_toolbar: &'a str,
    text_selection_direct: &'a str,
    text_selection_disabled: &'a str,
    more: &'a str,
    config: &'a str,
    check_update: &'a str,
    restart: &'a str,
    quit: &'a str,
}

fn build_tray_menu(labels: TrayMenuLabels<'_>) -> tauri::SystemTrayMenu {
    let input_translate = CustomMenuItem::new("input_translate", labels.input_translate);
    let light_ai = CustomMenuItem::new("light_ai", labels.light_ai);
    let chat = CustomMenuItem::new("chat", labels.chat);
    let phrases = CustomMenuItem::new("phrases", labels.phrases);
    let vault = CustomMenuItem::new("vault", labels.vault);

    let config = CustomMenuItem::new("config", labels.config);
    let check_update = CustomMenuItem::new("check_update", labels.check_update);
    let restart = CustomMenuItem::new("restart", labels.restart);
    let quit = CustomMenuItem::new("quit", labels.quit);

    let clipboard_monitor = CustomMenuItem::new("clipboard_monitor", labels.clipboard_monitor);
    let copy_source = CustomMenuItem::new("copy_source", labels.copy_source);
    let copy_target = CustomMenuItem::new("copy_target", labels.copy_target);
    let copy_source_target = CustomMenuItem::new("copy_source_target", labels.copy_source_target);
    let copy_disable = CustomMenuItem::new("copy_disable", labels.copy_disable);
    let text_select_behavior_toolbar =
        CustomMenuItem::new("text_select_behavior_toolbar", labels.text_selection_toolbar);
    let text_select_behavior_direct =
        CustomMenuItem::new("text_select_behavior_direct", labels.text_selection_direct);
    let text_select_behavior_disabled =
        CustomMenuItem::new("text_select_behavior_disabled", labels.text_selection_disabled);

    let ocr_recognize = CustomMenuItem::new("ocr_recognize", labels.ocr_recognize);
    let ocr_translate = CustomMenuItem::new("ocr_translate", labels.ocr_translate);

    SystemTrayMenu::new()
        .add_item(input_translate)
        .add_item(light_ai)
        .add_item(chat)
        .add_item(phrases)
        .add_item(vault)
        .add_submenu(SystemTraySubmenu::new(
            labels.text_selection,
            SystemTrayMenu::new()
                .add_item(text_select_behavior_toolbar)
                .add_item(text_select_behavior_direct)
                .add_item(text_select_behavior_disabled),
        ))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_submenu(SystemTraySubmenu::new(
            labels.recognition_tools,
            SystemTrayMenu::new()
                .add_item(ocr_recognize)
                .add_item(ocr_translate),
        ))
        .add_submenu(SystemTraySubmenu::new(
            labels.clipboard,
            SystemTrayMenu::new()
                .add_item(clipboard_monitor)
                .add_submenu(SystemTraySubmenu::new(
                    labels.auto_copy,
                    SystemTrayMenu::new()
                        .add_item(copy_source)
                        .add_item(copy_target)
                        .add_item(copy_source_target)
                        .add_native_item(SystemTrayMenuItem::Separator)
                        .add_item(copy_disable),
                )),
        ))
        .add_item(config)
        .add_submenu(SystemTraySubmenu::new(
            labels.more,
            SystemTrayMenu::new()
                .add_item(check_update)
                .add_item(restart),
        ))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(quit)
}

fn tray_menu_en_refined() -> tauri::SystemTrayMenu {
    build_tray_menu(TrayMenuLabels {
        input_translate: "Input Translate",
        light_ai: "AI Polish",
        chat: "AI Chat",
        phrases: "Phrases",
        vault: "Vault",
        recognition_tools: "Recognition Tools",
        ocr_recognize: "OCR Recognize",
        ocr_translate: "OCR Translate",
        clipboard: "Clipboard",
        clipboard_monitor: "Clipboard Monitor",
        auto_copy: "Auto Copy",
        copy_source: "Source",
        copy_target: "Target",
        copy_source_target: "Source+Target",
        copy_disable: "Disable",
        text_selection: "Text Selection Behavior",
        text_selection_toolbar: "Show Toolbar",
        text_selection_direct: "Direct Translate",
        text_selection_disabled: "Disabled",
        more: "More",
        config: "Config",
        check_update: "Check Update",
        restart: "Restart",
        quit: "Quit",
    })
}

fn tray_menu_zh_cn_refined() -> tauri::SystemTrayMenu {
    build_tray_menu(TrayMenuLabels {
        input_translate: "\u{8F93}\u{5165}\u{7FFB}\u{8BD1}",
        light_ai: "AI \u{6DA6}\u{8272}",
        chat: "AI \u{5BF9}\u{8BDD}",
        phrases: "\u{5E38}\u{7528}\u{8BED}",
        vault: "\u{5BC6}\u{7801}\u{672C}",
        recognition_tools: "\u{8BC6}\u{522B}\u{5DE5}\u{5177}",
        ocr_recognize: "\u{6587}\u{5B57}\u{8BC6}\u{522B}",
        ocr_translate: "\u{622A}\u{56FE}\u{7FFB}\u{8BD1}",
        clipboard: "\u{526A}\u{8D34}\u{677F}",
        clipboard_monitor: "\u{76D1}\u{542C}\u{526A}\u{5207}\u{677F}",
        auto_copy: "\u{81EA}\u{52A8}\u{590D}\u{5236}",
        copy_source: "\u{539F}\u{6587}",
        copy_target: "\u{8BD1}\u{6587}",
        copy_source_target: "\u{539F}\u{6587}+\u{8BD1}\u{6587}",
        copy_disable: "\u{5173}\u{95ED}",
        text_selection: "\u{5212}\u{8BCD}\u{884C}\u{4E3A}",
        text_selection_toolbar: "\u{663E}\u{793A}\u{5DE5}\u{5177}\u{680F}",
        text_selection_direct: "\u{76F4}\u{63A5}\u{7FFB}\u{8BD1}",
        text_selection_disabled: "\u{7981}\u{7528}",
        more: "\u{66F4}\u{591A}",
        config: "\u{504F}\u{597D}\u{8BBE}\u{7F6E}",
        check_update: "\u{68C0}\u{67E5}\u{66F4}\u{65B0}",
        restart: "\u{91CD}\u{542F}\u{5E94}\u{7528}",
        quit: "\u{9000}\u{51FA}",
    })
}

fn tray_menu_zh_tw_refined() -> tauri::SystemTrayMenu {
    build_tray_menu(TrayMenuLabels {
        input_translate: "\u{8F38}\u{5165}\u{7FFB}\u{8B6F}",
        light_ai: "AI \u{6F64}\u{8272}",
        chat: "AI \u{5C0D}\u{8A71}",
        phrases: "\u{5E38}\u{7528}\u{8A9E}",
        vault: "\u{5BC6}\u{78BC}\u{672C}",
        recognition_tools: "\u{8B58}\u{5225}\u{5DE5}\u{5177}",
        ocr_recognize: "\u{6587}\u{5B57}\u{8B58}\u{5225}",
        ocr_translate: "\u{622A}\u{5716}\u{7FFB}\u{8B6F}",
        clipboard: "\u{526A}\u{8CBC}\u{7C3F}",
        clipboard_monitor: "\u{76E3}\u{807D}\u{526A}\u{8CBC}\u{7C3F}",
        auto_copy: "\u{81EA}\u{52D5}\u{8907}\u{88FD}",
        copy_source: "\u{539F}\u{6587}",
        copy_target: "\u{8B6F}\u{6587}",
        copy_source_target: "\u{539F}\u{6587}+\u{8B6F}\u{6587}",
        copy_disable: "\u{95DC}\u{9589}",
        text_selection: "\u{5283}\u{8A5E}\u{884C}\u{70BA}",
        text_selection_toolbar: "\u{986F}\u{793A}\u{5DE5}\u{5177}\u{5217}",
        text_selection_direct: "\u{76F4}\u{63A5}\u{7FFB}\u{8B6F}",
        text_selection_disabled: "\u{7981}\u{7528}",
        more: "\u{66F4}\u{591A}",
        config: "\u{504F}\u{597D}\u{8A2D}\u{5B9A}",
        check_update: "\u{6AA2}\u{67E5}\u{66F4}\u{65B0}",
        restart: "\u{91CD}\u{555F}\u{61C9}\u{7528}",
        quit: "\u{9000}\u{51FA}",
    })
}

fn tray_menu_ja_refined() -> tauri::SystemTrayMenu {
    tray_menu_en_refined()
}

fn tray_menu_ko_refined() -> tauri::SystemTrayMenu {
    tray_menu_en_refined()
}

fn tray_menu_fr_refined() -> tauri::SystemTrayMenu {
    tray_menu_en_refined()
}

fn tray_menu_de_refined() -> tauri::SystemTrayMenu {
    tray_menu_en_refined()
}

fn tray_menu_ru_refined() -> tauri::SystemTrayMenu {
    tray_menu_en_refined()
}

fn tray_menu_fa_refined() -> tauri::SystemTrayMenu {
    tray_menu_en_refined()
}

fn tray_menu_pt_br_refined() -> tauri::SystemTrayMenu {
    tray_menu_en_refined()
}

fn tray_menu_uk_refined() -> tauri::SystemTrayMenu {
    tray_menu_en_refined()
}
