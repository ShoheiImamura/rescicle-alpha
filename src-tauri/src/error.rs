use std::fmt;

// Every failure the renderer can see becomes a plain string, because the old IPC
// layer rejected with `new Error(message)` and src/renderer/app.js only ever reads
// `.message`. Keeping that shape means the frontend needs no changes.
#[derive(Debug)]
pub struct Error(pub String);

pub type Result<T> = std::result::Result<T, Error>;

pub fn err<T>(message: impl Into<String>) -> Result<T> {
    Err(Error(message.into()))
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for Error {}

impl serde::Serialize for Error {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.0)
    }
}

macro_rules! from_error {
    ($ty:ty) => {
        impl From<$ty> for Error {
            fn from(e: $ty) -> Self {
                Error(e.to_string())
            }
        }
    };
}

from_error!(rusqlite::Error);
from_error!(std::io::Error);
from_error!(serde_json::Error);
from_error!(tauri::Error);
from_error!(tauri_plugin_clipboard_manager::Error);
