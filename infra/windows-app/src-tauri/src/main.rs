// Coquille Windows native : une fenêtre WebView2 sur la coquille HTTP, sans
// barre d'adresse ni « Non sécurisé ». Aucune logique métier ici : tout
// reste dans l'app web. Pendant de infra/mac-app.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Url, WebviewUrl, WebviewWindowBuilder};

const APP_URL: &str = match option_env!("IPTV_APP_URL") {
    Some(url) => url,
    None => "http://zibtv.duckdns.org/",
};

// Défauts Tauri + lecture auto (le zapping enchaîne les flux sans geste).
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection \
     --autoplay-policy=no-user-gesture-required";

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let home: Url = APP_URL.parse().expect("IPTV_APP_URL invalide");
            let host = home.host_str().map(str::to_owned);
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(home))
                .title("IPTV")
                .inner_size(1280.0, 800.0)
                .min_inner_size(480.0, 360.0)
                .additional_browser_args(BROWSER_ARGS)
                // Même hôte dans l'app ; VLC et liens externes → Windows.
                .on_navigation(move |url| {
                    let internal = match url.scheme() {
                        "http" | "https" => url.host_str() == host.as_deref(),
                        "about" | "data" | "blob" => true,
                        _ => false,
                    };
                    if !internal {
                        let _ = tauri_plugin_opener::open_url(url.as_str(), None::<&str>);
                    }
                    internal
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("IPTV n'a pas pu démarrer");
}
