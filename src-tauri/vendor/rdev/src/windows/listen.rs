use crate::rdev::{Event, ListenError};
use crate::windows::common::{convert, set_key_hook, set_mouse_hook, HookError};
use std::cell::RefCell;
use std::os::raw::c_int;
use std::ptr::null_mut;
use std::time::SystemTime;
use winapi::shared::minwindef::{LPARAM, LRESULT, WPARAM};
use winapi::um::winuser::{
    CallNextHookEx, DispatchMessageW, GetMessageW, TranslateMessage, HC_ACTION, MSG,
};

thread_local! {
    static GLOBAL_CALLBACK: RefCell<Option<Box<dyn FnMut(Event)>>> = RefCell::new(None);
}

impl From<HookError> for ListenError {
    fn from(error: HookError) -> Self {
        match error {
            HookError::Mouse(code) => ListenError::MouseHookError(code),
            HookError::Key(code) => ListenError::KeyHookError(code),
        }
    }
}

unsafe extern "system" fn raw_callback(code: c_int, param: WPARAM, lpdata: LPARAM) -> LRESULT {
    if code == HC_ACTION {
        let opt = convert(param, lpdata);
        if let Some(event_type) = opt {
            let event = Event {
                event_type,
                time: SystemTime::now(),
                // The application only uses EventType and never consumes the
                // localized key name. Skipping the extra user32-dependent name
                // lookup keeps the low-level hook callback much simpler and
                // avoids fragile foreground-thread keyboard state work.
                name: None,
            };
            GLOBAL_CALLBACK.with(|callback_slot| {
                if let Ok(mut callback_slot) = callback_slot.try_borrow_mut() {
                    if let Some(callback) = callback_slot.as_mut() {
                        callback(event);
                    }
                }
            });
        }
    }
    CallNextHookEx(null_mut(), code, param, lpdata)
}

pub fn listen<T>(callback: T) -> Result<(), ListenError>
where
    T: FnMut(Event) + 'static,
{
    unsafe {
        GLOBAL_CALLBACK.with(|callback_slot| {
            *callback_slot.borrow_mut() = Some(Box::new(callback));
        });
        set_key_hook(raw_callback)?;
        set_mouse_hook(raw_callback)?;
        let mut msg: MSG = std::mem::zeroed();
        loop {
            let result = GetMessageW(&mut msg, null_mut(), 0, 0);
            if result <= 0 {
                break;
            }
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        GLOBAL_CALLBACK.with(|callback_slot| {
            *callback_slot.borrow_mut() = None;
        });
    }
    Ok(())
}
