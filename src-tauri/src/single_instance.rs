use std::fmt;

#[derive(Debug)]
pub enum SingleInstanceError {
    AlreadyRunning,
    Unavailable(String),
}

impl fmt::Display for SingleInstanceError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::AlreadyRunning => write!(f, "another instance is already running"),
            Self::Unavailable(message) => write!(f, "single-instance guard unavailable: {message}"),
        }
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use super::SingleInstanceError;
    use std::io::Write;
    use std::net::{SocketAddr, TcpStream};
    use std::time::Duration;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS, HANDLE};
    use windows::Win32::System::Threading::CreateMutexW;

    pub struct SingleInstanceGuard {
        handle: HANDLE,
    }

    impl Drop for SingleInstanceGuard {
        fn drop(&mut self) {
            unsafe {
                let _ = CloseHandle(self.handle);
            }
        }
    }

    pub fn acquire(app_id: &str) -> Result<SingleInstanceGuard, SingleInstanceError> {
        let name = mutex_name(app_id);
        let handle = unsafe { CreateMutexW(None, false, PCWSTR(name.as_ptr())) }
            .map_err(|e| SingleInstanceError::Unavailable(e.to_string()))?;

        let last_error = unsafe { GetLastError() };
        if last_error == ERROR_ALREADY_EXISTS {
            unsafe {
                let _ = CloseHandle(handle);
            }
            return Err(SingleInstanceError::AlreadyRunning);
        }

        Ok(SingleInstanceGuard { handle })
    }

    pub fn notify_existing_instance(port: u16) {
        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        if let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(150)) {
            let _ = stream.set_write_timeout(Some(Duration::from_millis(150)));
            let _ = stream.write_all(
                b"GET /config HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
            );
        }
    }

    fn mutex_name(app_id: &str) -> Vec<u16> {
        let sanitized = sanitize_name(app_id);
        let channel = if cfg!(debug_assertions) { ".dev" } else { "" };
        format!("Local\\{sanitized}{channel}.single-instance")
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect()
    }

    fn sanitize_name(value: &str) -> String {
        let value = value.trim();
        if value.is_empty() {
            return "flow-input".to_string();
        }

        value
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_') {
                    c
                } else {
                    '_'
                }
            })
            .collect()
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    use super::SingleInstanceError;

    pub struct SingleInstanceGuard;

    pub fn acquire(_app_id: &str) -> Result<SingleInstanceGuard, SingleInstanceError> {
        Ok(SingleInstanceGuard)
    }

    pub fn notify_existing_instance(_port: u16) {}
}

pub use platform::{acquire, notify_existing_instance};
