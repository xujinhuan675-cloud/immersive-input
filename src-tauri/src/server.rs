use crate::config::set;
use crate::window::*;
use log::{info, warn};
use std::thread;
use tauri::api::notification;
use tiny_http::{Request, Response, Server};

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
    info!("Handle {} request", request.url());
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
        _ => warn!("Unknown request url: {}", request.url()),
    }
}

fn handle_config(request: Request) {
    config_window();
    response_ok(request);
}

fn handle_translate(mut request: Request) {
    let mut content = String::new();
    request.as_reader().read_to_string(&mut content).unwrap();
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

fn response_ok(request: Request) {
    let response = Response::from_string("ok");
    request.respond(response).unwrap();
}
