mod db;

use db::PersistedState;
use rusqlite::Connection;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Manager, State};

struct DbState {
    conn: Mutex<Connection>,
    db_path: PathBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DbInfo {
    backend: String,
    path: String,
}

#[tauri::command]
fn load_state(db: State<'_, DbState>) -> Result<Option<PersistedState>, String> {
    let conn = db
        .conn
        .lock()
        .map_err(|_| "Database mutex was poisoned".to_string())?;
    db::load_state(&conn)
}

#[tauri::command]
fn save_state(state: PersistedState, db: State<'_, DbState>) -> Result<(), String> {
    let mut conn = db
        .conn
        .lock()
        .map_err(|_| "Database mutex was poisoned".to_string())?;
    db::save_state(&mut conn, &state)
}

#[tauri::command]
fn get_db_info(db: State<'_, DbState>) -> Result<DbInfo, String> {
    Ok(DbInfo {
        backend: "sqlite".to_string(),
        path: db.db_path.to_string_lossy().into_owned(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_dir = app.path().app_data_dir()?;
            let db_path = app_dir.join("personal-os.db");
            let conn = db::open_database(&db_path).map_err(std::io::Error::other)?;
            app.manage(DbState {
                conn: Mutex::new(conn),
                db_path,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_state,
            save_state,
            get_db_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running Personal OS");
}
