use crate::error::Error;
use dirs::config_dir;
use log::info;
use reqwest_dav::{Auth, ClientBuilder, Depth};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;
use zip::read::ZipArchive;
use zip::write::SimpleFileOptions;

fn app_backup_dir() -> Result<PathBuf, Error> {
    match config_dir() {
        Some(v) => Ok(v.join("com.immersive-input.desktop")),
        None => Err(Error::Error("Backup Get Config Dir Error".into())),
    }
}

fn zip_options() -> SimpleFileOptions {
    SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored)
}

fn add_file_to_zip<W: Write + std::io::Seek>(
    zip: &mut zip::ZipWriter<W>,
    source_path: &Path,
    archive_name: &str,
) -> Result<(), Error> {
    zip.start_file(archive_name, zip_options())?;
    zip.write(&fs::read(source_path)?)?;
    Ok(())
}

fn write_backup_bundle<W: Write + std::io::Seek>(
    zip: &mut zip::ZipWriter<W>,
    config_dir_path: &Path,
) -> Result<(), Error> {
    let config_path = config_dir_path.join("config.json");
    let plugin_path = config_dir_path.join("plugins");

    if config_path.exists() {
        add_file_to_zip(zip, &config_path, "config.json")?;
    }

    for entry in fs::read_dir(config_dir_path)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        if path.extension().and_then(|ext| ext.to_str()) != Some("db") {
            continue;
        }

        let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
            return Err(Error::Error("Backup File Name Error".into()));
        };

        info!("adding file {path:?} as {file_name:?} ...");
        add_file_to_zip(zip, &path, file_name)?;
    }

    if plugin_path.exists() {
        for entry in WalkDir::new(&plugin_path) {
            let entry = entry?;
            let path = entry.path();
            let file_name = match path.strip_prefix(config_dir_path)?.to_str() {
                Some(v) => v,
                None => return Err(Error::Error("Backup Strip Prefix Error".into())),
            };

            if path.is_file() {
                info!("adding file {path:?} as {file_name:?} ...");
                add_file_to_zip(zip, path, file_name)?;
            }
        }
    }

    Ok(())
}

#[tauri::command(async)]
pub async fn webdav(
    operate: &str,
    url: String,
    username: String,
    password: String,
    name: Option<String>,
) -> Result<String, Error> {
    // build a client
    let client = ClientBuilder::new()
        .set_host(url.clone())
        .set_auth(Auth::Basic(username.clone(), password.clone()))
        .build()?;
    client.mkcol("/immersive-input").await.unwrap_or_default();
    let client = ClientBuilder::new()
        .set_host(format!("{}/immersive-input", url.trim_end_matches("/")))
        .set_auth(Auth::Basic(username, password))
        .build()?;
    match operate {
        "list" => {
            let res = client.list("/", Depth::Number(1)).await?;
            let result = serde_json::to_string(&res)?;
            Ok(result)
        }
        "get" => {
            let res = client.get(&format!("/{}", name.unwrap())).await?;
            let data = res.bytes().await?;
            let config_dir_path = app_backup_dir()?;
            let zip_path = config_dir_path.join("archive.zip");

            let mut zip_file = std::fs::File::create(&zip_path)?;
            zip_file.write_all(&data)?;
            let mut zip_file = std::fs::File::open(&zip_path)?;
            let mut zip = ZipArchive::new(&mut zip_file)?;
            zip.extract(config_dir_path)?;
            Ok("".to_string())
        }
        "put" => {
            let config_dir_path = app_backup_dir()?;
            let zip_path = config_dir_path.join("archive.zip");

            let zip_file = std::fs::File::create(&zip_path)?;
            let mut zip = zip::ZipWriter::new(zip_file);
            write_backup_bundle(&mut zip, &config_dir_path)?;
            zip.finish()?;
            match client
                .put(&format!("/{}", name.unwrap()), std::fs::read(&zip_path)?)
                .await
            {
                Ok(()) => return Ok("".to_string()),
                Err(e) => {
                    return Err(Error::Error(format!("WebDav Put Error: {}", e).into()));
                }
            }
        }

        "delete" => match client.delete(&format!("/{}", name.unwrap())).await {
            Ok(()) => return Ok("".to_string()),
            Err(e) => {
                return Err(Error::Error(format!("WebDav Delete Error: {}", e).into()));
            }
        },
        _ => {
            return Err(Error::Error(
                format!("WebDav Operate Error: {}", operate).into(),
            ));
        }
    }
}

#[tauri::command(async)]
pub async fn local(operate: &str, path: String) -> Result<String, Error> {
    match operate {
        "put" => {
            let config_dir_path = app_backup_dir()?;

            let zip_file = std::fs::File::create(&path)?;
            let mut zip = zip::ZipWriter::new(zip_file);
            write_backup_bundle(&mut zip, &config_dir_path)?;
            zip.finish()?;
            Ok("".to_string())
        }
        "get" => {
            let config_dir_path = app_backup_dir()?;

            let mut zip_file = std::fs::File::open(&path)?;
            let mut zip = ZipArchive::new(&mut zip_file)?;
            zip.extract(config_dir_path)?;
            Ok("".to_string())
        }
        _ => {
            return Err(Error::Error(
                format!("Local Operate Error: {}", operate).into(),
            ));
        }
    }
}

#[tauri::command(async)]
pub async fn aliyun(operate: &str, path: String, url: String) -> Result<String, Error> {
    match operate {
        "put" => {
            let _ = reqwest::Client::new()
                .put(&url)
                .body(std::fs::read(&path)?)
                .send()
                .await?;
            Ok("".to_string())
        }
        "get" => {
            let res = reqwest::Client::new().get(&url).send().await?;
            let data = res.bytes().await?;
            let config_dir_path = app_backup_dir()?;
            let zip_path = config_dir_path.join("archive.zip");

            let mut zip_file = std::fs::File::create(&zip_path)?;
            zip_file.write_all(&data)?;
            let mut zip_file = std::fs::File::open(&zip_path)?;
            let mut zip = ZipArchive::new(&mut zip_file)?;
            zip.extract(config_dir_path)?;
            Ok("".to_string())
        }
        _ => {
            return Err(Error::Error(
                format!("Local Operate Error: {}", operate).into(),
            ));
        }
    }
}
