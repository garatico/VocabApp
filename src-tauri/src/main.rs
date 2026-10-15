// Prevents a console window appearing alongside the app on Windows release
// builds. Debug builds keep it, which is where panics and logs show up.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::io::Write;
use std::sync::Mutex;

use rusqlite::types::ValueRef;
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

/// Idle read-only connections per database file, opened on demand and kept for the app's lifetime. A
/// read takes one and puts it back, so reads run side by side: the first page of words must not wait
/// behind a whole-language read that started a moment earlier.
#[derive(Default)]
struct ReadConnections(Mutex<HashMap<String, Vec<rusqlite::Connection>>>);

impl ReadConnections {
    fn take(&self, db_path: &str) -> Result<rusqlite::Connection, String> {
        let idle = self.0.lock().map_err(|e| e.to_string())?.get_mut(db_path).and_then(Vec::pop);
        match idle {
            Some(conn) => Ok(conn),
            None => {
                let flags = rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX;
                rusqlite::Connection::open_with_flags(db_path, flags).map_err(|e| e.to_string())
            }
        }
    }

    fn put_back(&self, db_path: String, conn: rusqlite::Connection) {
        if let Ok(mut map) = self.0.lock() {
            map.entry(db_path).or_default().push(conn);
        }
    }
}

/// Runs one SELECT and returns its rows as JSON bytes: `{"columns":[...],"rows":[[...],...]}`.
///
/// tauri-plugin-sql's select() sends each row as an object, so every column name is repeated on every row:
/// a whole language (45k rows) came to 26 MB and took about three seconds to arrive. Here the names go
/// once, and the JSON is written straight into the IPC response, so it is never built as a value and then
/// serialized again. Generic like run_sql_transaction: what the queries mean stays in src/shared/vocab/*.
/// The connection is read-only, so nothing sent here can change the database. Async, so a long read runs
/// off the main thread and the window keeps responding.
#[tauri::command]
async fn select_rows(
    state: tauri::State<'_, ReadConnections>,
    db_path: String,
    sql: String,
    params: Vec<serde_json::Value>,
) -> Result<tauri::ipc::Response, String> {
    let conn = state.take(&db_path)?;
    let out = rows_as_json(&conn, &sql, &params);
    state.put_back(db_path, conn);
    Ok(tauri::ipc::Response::new(out?))
}

fn rows_as_json(conn: &rusqlite::Connection, sql: &str, params: &[serde_json::Value]) -> Result<Vec<u8>, String> {
    let mut stmt = conn.prepare_cached(sql).map_err(|e| format!("{}: {}", e, sql))?;
    let columns: Vec<String> = stmt.column_names().iter().map(|c| c.to_string()).collect();
    let bound: Vec<rusqlite::types::Value> = params.iter().map(json_to_rusqlite).collect();
    let mut rows = stmt.query(rusqlite::params_from_iter(bound)).map_err(|e| e.to_string())?;

    let mut out: Vec<u8> = Vec::with_capacity(1 << 20);
    out.extend_from_slice(b"{\"columns\":");
    serde_json::to_writer(&mut out, &columns).map_err(|e| e.to_string())?;
    out.extend_from_slice(b",\"rows\":[");
    let mut first = true;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        if !first { out.push(b','); }
        first = false;
        out.push(b'[');
        for i in 0..columns.len() {
            if i > 0 { out.push(b','); }
            match row.get_ref(i).map_err(|e| e.to_string())? {
                ValueRef::Null | ValueRef::Blob(_) => out.extend_from_slice(b"null"),
                ValueRef::Integer(n) => { write!(out, "{}", n).map_err(|e| e.to_string())?; }
                // serde_json writes a non-finite float as null, as JSON.stringify would.
                ValueRef::Real(f) => serde_json::to_writer(&mut out, &f).map_err(|e| e.to_string())?,
                ValueRef::Text(t) => serde_json::to_writer(&mut out, &String::from_utf8_lossy(t)).map_err(|e| e.to_string())?,
            }
        }
        out.push(b']');
    }
    out.extend_from_slice(b"]}");
    Ok(out)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .manage(ReadConnections::default())
        .invoke_handler(tauri::generate_handler![run_sql_transaction, select_rows])
        .run(tauri::generate_context!())
        .expect("error while running VocabApp");
}
