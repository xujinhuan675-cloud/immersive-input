use crate::config::{get, set};
use crate::window::updater_window;
use log::{info, warn};

pub fn check_update(app_handle: tauri::AppHandle) {
    let enable = match get("check_update") {
        Some(v) => v.as_bool().unwrap(),
        None => {
            set("check_update", true);
            true
        }
    };
    if enable {
        tauri::async_runtime::spawn(async move {
            match tauri::updater::builder(app_handle.clone()).check().await {
                Ok(update) => {
                    if update.is_update_available() {
                        let latest_version = update.latest_version().to_string();
                        set("pending_update_available", true);
                        set("pending_update_version", latest_version.clone());
                        info!("New version available, start background download & install");
                        if let Err(e) = update.download_and_install().await {
                            warn!("Failed to download/install update: {}", e);
                            return;
                        }
                        info!("Update installed, waiting for user restart confirmation");
                        set("pending_update_restart", true);
                        set("pending_update_version", latest_version);
                        updater_window();
                    }
                }
                Err(e) => {
                    warn!("Failed to check update: {}", e);
                }
            }
        });
    }
}
