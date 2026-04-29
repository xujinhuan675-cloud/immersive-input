use std::fs::{create_dir_all, metadata, rename, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Once;
use std::time::{SystemTime, UNIX_EPOCH};

const APP_ID: &str = "com.immersive-input.desktop";
const MAX_LOG_BYTES: u64 = 512 * 1024;

static PANIC_HOOK: Once = Once::new();

fn log_path() -> Option<PathBuf> {
    dirs::config_dir().map(|path| path.join(APP_ID).join("logs").join("crash-breadcrumb.log"))
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn sanitize(value: &str) -> String {
    value.replace('\r', " ").replace('\n', " ")
}

fn rotate_if_needed(path: &PathBuf) {
    let Ok(info) = metadata(path) else {
        return;
    };
    if info.len() <= MAX_LOG_BYTES {
        return;
    }

    let previous = path.with_file_name("crash-breadcrumb.prev.log");
    let _ = rename(path, previous);
}

pub fn record(tag: &str, message: impl AsRef<str>) {
    let Some(path) = log_path() else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = create_dir_all(parent);
    }
    rotate_if_needed(&path);

    let thread = std::thread::current();
    let thread_name = thread.name().unwrap_or("unnamed");
    let pid = std::process::id();
    let line = format!(
        "[{}][pid:{}][thread:{}][{}] {}\n",
        now_ms(),
        pid,
        sanitize(thread_name),
        sanitize(tag),
        sanitize(message.as_ref())
    );

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = file.write_all(line.as_bytes());
        let _ = file.flush();
    }
}

pub fn install_panic_hook() {
    PANIC_HOOK.call_once(|| {
        let default_hook = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |info| {
            let location = info
                .location()
                .map(|location| {
                    format!(
                        "{}:{}:{}",
                        location.file(),
                        location.line(),
                        location.column()
                    )
                })
                .unwrap_or_else(|| "unknown".to_string());
            let payload = info
                .payload()
                .downcast_ref::<&str>()
                .map(|value| (*value).to_string())
                .or_else(|| info.payload().downcast_ref::<String>().cloned())
                .unwrap_or_else(|| "non-string panic payload".to_string());

            record(
                "panic",
                format!("location={} payload={}", location, payload),
            );
            default_hook(info);
        }));
    });
}
