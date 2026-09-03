use tauri::Manager;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // 1. Cria a opção "Sair" para o menu do relógio
            let quit_i = MenuItem::with_id(app, "quit", "Sair do ChatPC", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit_i])?;

            // 2. Constrói o ícone na Bandeja do Sistema (System Tray)
            let tray = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .icon(app.default_window_icon().unwrap().clone())
                .build(app)?;

            // 3. Define o que acontece ao clicar nas opções do menu
            tray.on_menu_event(move |app, event| {
                if event.id.as_ref() == "quit" {
                    std::process::exit(0);
                }
            });

            // 4. Define o que acontece ao clicar com o botão esquerdo no ícone (restaurar tela)
            tray.on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event {
                    let app = tray.app_handle();
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            });

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .on_window_event(|window, event| match event {
            // 5. Intercepta o clique no "X" da janela para apenas escondê-la em vez de fechar
            tauri::WindowEvent::CloseRequested { api, .. } => {
                window.hide().unwrap();
                api.prevent_close();
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
