// Prevents a console window appearing alongside the app on Windows release
// builds. Debug builds keep it, which is where panics and logs show up.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running VocabApp");
}
