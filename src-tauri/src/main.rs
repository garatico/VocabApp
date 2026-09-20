// Prevents a console window appearing alongside the app on Windows release
// builds. Debug builds keep it, which is where panics and logs show up.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Deserialize;

/// One SQL statement plus its bind parameters, as sent from
/// src/client/tauri/sql-adapter.ts. `?` placeholders — the same convention
/// every shared query in src/shared/vocab/* already uses.
#[derive(Deserialize)]
struct SqlStatement {
    sql:    String,
    params: Vec<serde_json::Value>,
}

fn json_to_rusqlite(value: &serde_json::Value) -> rusqlite::types::Value {
    match value {
        serde_json::Value::Null => rusqlite::types::Value::Null,
        serde_json::Value::Bool(b) => rusqlite::types::Value::Integer(if *b { 1 } else { 0 }),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                rusqlite::types::Value::Integer(i)
            } else if let Some(f) = n.as_f64() {
                rusqlite::types::Value::Real(f)
            } else {
                rusqlite::types::Value::Null
            }
        }
        serde_json::Value::String(s) => rusqlite::types::Value::Text(s.clone()),
        // Arrays/objects never appear as bind params in this app's queries.
        _ => rusqlite::types::Value::Null,
    }
}

/// Runs a batch of statements atomically against `db_path`, in a single
/// short-lived connection opened just for this call.
///
/// Exists because tauri-plugin-sql's JS API has no transaction() method —
/// each execute()/select() call checks out a (possibly different) connection
/// from its internal pool, so a manual BEGIN/COMMIT sent as separate calls
/// can land on different connections and fail with "cannot start a
/// transaction within a transaction". This command is a generic executor
/// with no knowledge of what the statements mean — all query/write logic
/// stays in src/shared/vocab/write.ts; this only makes "run these atomically"
/// actually atomic.
#[tauri::command]
fn run_sql_transaction(db_path: String, statements: Vec<SqlStatement>) -> Result<(), String> {
    let mut conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for stmt in &statements {
        let bound: Vec<rusqlite::types::Value> = stmt.params.iter().map(json_to_rusqlite).collect();
        tx.execute(&stmt.sql, rusqlite::params_from_iter(bound))
            .map_err(|e| format!("{}: {}", e, stmt.sql))?;
    }

    tx.commit().map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![run_sql_transaction])
        .run(tauri::generate_context!())
        .expect("error while running VocabApp");
}
