use crate::config::set;
use crate::window::*;
use crate::PendingChatHttpTextWrapper;
use crate::PendingTtsTextWrapper;
use crate::StringWrapper;
use crate::APP;
use log::{debug, info, warn};
use std::thread;
use tauri::api::notification;
use tauri::Manager;
use tiny_http::{Method, Request, Response, Server, StatusCode};

const DEFAULT_SERVER_PORT: u16 = 60828;
const FIRST_NON_SYSTEM_PORT: u16 = 1024;

pub fn start_server() {
    let (port, server) = match bind_server() {
        Ok(value) => value,
        Err(e) => {
            let _ = notification::Notification::new("com.immersive-input.desktop")
                .title("Server start failed")
                .body(&e)
                .show();
            warn!("Server start failed: {}", e);
            return;
        }
    };

    set("server_port", port);
    if port == DEFAULT_SERVER_PORT {
        info!("HTTP server listening on 127.0.0.1:{port}");
    } else {
        warn!(
            "Default server port {} is unavailable, switched to 127.0.0.1:{}",
            DEFAULT_SERVER_PORT, port
        );
    }

    thread::spawn(move || {
        for request in server.incoming_requests() {
            http_handle(request);
        }
    });
}

fn bind_server() -> Result<(u16, Server), String> {
    for port in DEFAULT_SERVER_PORT..=u16::MAX {
        if let Ok(server) = Server::http(format!("127.0.0.1:{port}")) {
            return Ok((port, server));
        }
    }
    for port in FIRST_NON_SYSTEM_PORT..DEFAULT_SERVER_PORT {
        if let Ok(server) = Server::http(format!("127.0.0.1:{port}")) {
            return Ok((port, server));
        }
    }
    Err("No available local port could be bound".to_string())
}

fn http_handle(request: Request) {
    debug!("Handle {} request", request.url());
    match request.url() {
        "/" => handle_translate(request),
        "/config" => handle_config(request),
        "/translate" => handle_translate(request),
        "/selection_translate" => handle_selection_translate(request),
        "/input_translate" => handle_input_translate(request),
        "/ocr_recognize" => handle_ocr_recognize(request),
        "/ocr_translate" => handle_ocr_translate(request),
        "/ocr_recognize?screenshot=false" => handle_ocr_recognize(request),
        "/ocr_translate?screenshot=false" => handle_ocr_translate(request),
        "/ocr_recognize?screenshot=true" => handle_ocr_recognize(request),
        "/ocr_translate?screenshot=true" => handle_ocr_translate(request),
        "/light_ai" => handle_light_ai(request),
        "/explain" => handle_explain(request),
        "/chat" => handle_chat(request),
        "/tts" => handle_tts(request),
        _ => {
            warn!("Unknown request url: {}", request.url());
            response_with_status(request, StatusCode(404), "not found");
        }
    }
}

fn handle_config(request: Request) {
    config_window();
    response_ok(request);
}

fn handle_translate(mut request: Request) {
    let content = read_request_body(&mut request);
    text_translate(content);
    response_ok(request);
}

fn handle_selection_translate(request: Request) {
    selection_translate();
    response_ok(request);
}

fn handle_input_translate(request: Request) {
    input_translate();
    response_ok(request);
}

fn handle_ocr_recognize(request: Request) {
    if request.url().ends_with("false") {
        recognize_window();
    } else {
        ocr_recognize();
    }
    response_ok(request);
}

fn handle_ocr_translate(request: Request) {
    if request.url().ends_with("false") {
        image_translate();
    } else {
        ocr_translate();
    }
    response_ok(request);
}

fn handle_light_ai(mut request: Request) {
    let content = read_request_body(&mut request);
    set_shared_text(&content);
    set_light_ai_target("http");
    light_ai_window();
    response_ok(request);
}

fn handle_explain(mut request: Request) {
    let content = read_request_body(&mut request);
    set_shared_text(&content);
    explain_window();
    response_ok(request);
}

fn handle_chat(mut request: Request) {
    let maybe_text = if request.method() == &Method::Post {
        Some(read_request_body(&mut request))
    } else {
        None
    };

    if let Some(content) = maybe_text {
        if !content.trim().is_empty() {
            let app_handle = APP.get().unwrap();
            let had_window = app_handle.get_window("chat").is_some();
            let state: tauri::State<PendingChatHttpTextWrapper> = app_handle.state();
            *state.0.lock().unwrap() = content.clone();
            chat_window();
            if had_window {
                if let Some(window) = app_handle.get_window("chat") {
                    window.emit("http_chat_text", content).unwrap_or_default();
                }
            }
            response_ok(request);
            return;
        }
    }

    chat_window();
    response_ok(request);
}

fn handle_tts(mut request: Request) {
    let content = read_request_body(&mut request);
    if content.trim().is_empty() {
        response_ok(request);
        return;
    }

    let app_handle = APP.get().unwrap();
    let had_window = app_handle.get_window("tts_player").is_some();
    let state: tauri::State<PendingTtsTextWrapper> = app_handle.state();
    *state.0.lock().unwrap() = content.clone();
    tts_player_window();
    if had_window {
        if let Some(window) = app_handle.get_window("tts_player") {
            window.emit("http_tts_text", content).unwrap_or_default();
        }
    }
    response_ok(request);
}

fn read_request_body(request: &mut Request) -> String {
    let mut content = String::new();
    request.as_reader().read_to_string(&mut content).unwrap_or_default();
    content
}

fn set_shared_text(text: &str) {
    let app_handle = APP.get().unwrap();
    let state: tauri::State<StringWrapper> = app_handle.state();
    state.0.lock().unwrap().replace_range(.., text);
}

fn response_ok(request: Request) {
    response_with_status(request, StatusCode(200), "ok");
}

fn response_with_status(request: Request, status: StatusCode, body: &str) {
    let response = Response::from_string(body).with_status_code(status);
    request.respond(response).unwrap();
}
