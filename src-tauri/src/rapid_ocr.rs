use base64::{engine::general_purpose, Engine as _};
use dirs::cache_dir;
use std::fs;
#[cfg(not(target_os = "windows"))]
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::process::Command;

fn get_app_cache_file(app_handle: &tauri::AppHandle, file_name: &str) -> Result<PathBuf, String> {
    let mut path = cache_dir().ok_or_else(|| "Get Cache Dir Failed".to_string())?;
    path.push(&app_handle.config().tauri.bundle.identifier);
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    path.push(file_name);
    Ok(path)
}

fn resolve_resource_path(app_handle: &tauri::AppHandle, path: &str) -> Result<PathBuf, String> {
    app_handle
        .path_resolver()
        .resolve_resource(path)
        .ok_or_else(|| format!("Failed to resolve resource: {path}"))
}

fn get_binary_relative_path() -> &'static str {
    #[cfg(all(target_os = "windows", target_arch = "x86"))]
    {
        return "i686-pc-windows-msvc/RapidOcrOnnx.exe";
    }
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        return "x86_64-pc-windows-msvc/RapidOcrOnnx.exe";
    }
    #[cfg(target_os = "macos")]
    {
        return "apple-darwin/RapidOcrOnnx";
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        return "x86_64-unknown-linux-gnu/RapidOcrOnnx";
    }

    #[allow(unreachable_code)]
    "unsupported"
}

fn parse_rapid_output(stdout: &[u8]) -> Result<String, String> {
    let output = String::from_utf8_lossy(stdout).replace("\r\n", "\n");
    let (_, tail) = output
        .split_once("=====End detect=====")
        .ok_or_else(|| "Rapid OCR output missing result marker".to_string())?;

    let text = tail
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with("FullDetectTime("))
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string();

    Ok(text)
}

#[tauri::command(async)]
pub fn rapid_ocr(app_handle: tauri::AppHandle, base64: &str, language: &str) -> Result<String, String> {
    let image_bytes = general_purpose::STANDARD
        .decode(base64)
        .map_err(|error| error.to_string())?;
    let image_path = get_app_cache_file(&app_handle, "immersive_screenshot_cut_rapid.png")?;
    fs::write(&image_path, image_bytes).map_err(|error| error.to_string())?;

    let binary_path = resolve_resource_path(
        &app_handle,
        &format!("resources/rapid/{}", get_binary_relative_path()),
    )?;
    let det_model_path =
        resolve_resource_path(&app_handle, "resources/rapid/PPOCR/models/ch_PP-OCR_det_infer.onnx")?;
    let models_dir = det_model_path
        .parent()
        .ok_or_else(|| "Failed to resolve Rapid OCR models directory".to_string())?
        .to_path_buf();
    let ppocr_dir = models_dir
        .parent()
        .ok_or_else(|| "Failed to resolve Rapid OCR PPOCR directory".to_string())?
        .to_path_buf();

    if !binary_path.exists() {
        return Err(format!("Rapid OCR binary not found: {}", binary_path.display()));
    }
    if !models_dir.exists() {
        return Err(format!("Rapid OCR models not found: {}", models_dir.display()));
    }

    #[cfg(not(target_os = "windows"))]
    {
        let metadata = fs::metadata(&binary_path).map_err(|error| error.to_string())?;
        let mut permissions = metadata.permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&binary_path, permissions).map_err(|error| error.to_string())?;
    }

    let output = Command::new(&binary_path)
        .arg("--models")
        .arg(&models_dir)
        .arg("--det")
        .arg("ch_PP-OCR_det_infer.onnx")
        .arg("--cls")
        .arg("ch_ppocr_mobile_v2.0_cls_infer.onnx")
        .arg("--rec")
        .arg(format!("{language}_PP-OCR_rec_infer.onnx"))
        .arg("--keys")
        .arg(format!("{language}_dict.txt"))
        .arg("--image")
        .arg(&image_path)
        .arg("--numThread")
        .arg("64")
        .arg("--padding")
        .arg("50")
        .arg("--maxSideLen")
        .arg("1024")
        .arg("--boxScoreThresh")
        .arg("0.5")
        .arg("--boxThresh")
        .arg("0.5")
        .arg("--unClipRatio")
        .arg("1.6")
        .arg("--doAngle")
        .arg("1")
        .arg("--mostAngle")
        .arg("1")
        .current_dir(ppocr_dir)
        .output()
        .map_err(|error| error.to_string())?;

    if output.status.success() {
        return parse_rapid_output(&output.stdout);
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !stderr.is_empty() {
        Err(stderr)
    } else if !stdout.is_empty() {
        Err(stdout)
    } else {
        Err("Rapid OCR execution failed".to_string())
    }
}
