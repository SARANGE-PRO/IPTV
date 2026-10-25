// Coquille Mac native : une fenêtre WKWebView sur la coquille HTTP, sans
// barre d'adresse ni bandeau « Non sécurisé ». Aucune logique métier ici :
// tout reste dans l'app web. Les flux HTTP passent grâce à l'exception ATS
// de l'Info.plist (voir build.sh).
import AppKit
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!

    private var appURL: URL {
        let raw = UserDefaults.standard.string(forKey: "url")
            ?? Bundle.main.object(forInfoDictionaryKey: "IPTVAppURL") as? String
            ?? "http://zibtv.duckdns.org/"
        return URL(string: raw)!
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default() // IndexedDB/session persistants
        config.mediaTypesRequiringUserActionForPlayback = []
        config.preferences.isElementFullscreenEnabled = true
        config.applicationNameForUserAgent = "Version/26.0 Safari/605.1.15 IPTVMac"

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.allowsMagnification = false
        if #available(macOS 13.3, *) { webView.isInspectable = true }

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 800),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: false)
        window.title = "IPTV"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.backgroundColor = .black
        window.minSize = NSSize(width: 480, height: 360)
        window.collectionBehavior = [.fullScreenPrimary]
        window.contentView = webView
        window.center()
        window.setFrameAutosaveName("IPTVMainWindow")
        window.makeKeyAndOrderFront(nil)

        buildMenu()
        webView.load(URLRequest(url: appURL))
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    // MARK: Navigation : même hôte dans l'app, le reste (VLC, liens) dehors.

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        let isWeb = url.scheme == "http" || url.scheme == "https"
        if isWeb && (url.host == appURL.host || action.targetFrame?.isMainFrame == false) {
            return decisionHandler(.allow)
        }
        if url.scheme == "about" || url.scheme == "blob" || url.scheme == "data" {
            return decisionHandler(.allow)
        }
        NSWorkspace.shared.open(url)
        decisionHandler(.cancel)
    }

    // target="_blank" / window.open : navigateur par défaut.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { NSWorkspace.shared.open(url) }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert(); alert.messageText = message; alert.runModal(); completionHandler()
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert(); alert.messageText = message
        alert.addButton(withTitle: "OK"); alert.addButton(withTitle: "Annuler")
        completionHandler(alert.runModal() == .alertFirstButtonReturn)
    }

    // Serveur injoignable : réessai simple plutôt qu'une fenêtre blanche.
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
                 withError error: Error) {
        let html = """
        <body style="background:#000;color:#ddd;font:15px -apple-system;display:flex;
        flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0">
        <p>Impossible de joindre \(appURL.host ?? "le serveur").</p>
        <button onclick="location.href='\(appURL.absoluteString)'"
        style="font:inherit;padding:10px 20px;border-radius:10px;border:0">Réessayer</button></body>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }

    // MARK: Menus (indispensables pour Cmd+C/V/Q/R dans une app sans storyboard)

    @objc private func reload() { webView.load(URLRequest(url: appURL)) }
    @objc private func goBack() { webView.goBack() }

    private func buildMenu() {
        let main = NSMenu()
        func sub(_ title: String, _ items: [NSMenuItem]) {
            let item = NSMenuItem(); let menu = NSMenu(title: title)
            items.forEach(menu.addItem); item.submenu = menu; main.addItem(item)
        }
        func mi(_ t: String, _ s: Selector?, _ k: String, _ target: AnyObject? = nil) -> NSMenuItem {
            let i = NSMenuItem(title: t, action: s, keyEquivalent: k); i.target = target; return i
        }
        sub("IPTV", [
            mi("Masquer IPTV", #selector(NSApplication.hide(_:)), "h"),
            .separator(),
            mi("Quitter IPTV", #selector(NSApplication.terminate(_:)), "q"),
        ])
        sub("Édition", [
            mi("Annuler", Selector(("undo:")), "z"),
            mi("Rétablir", Selector(("redo:")), "Z"),
            .separator(),
            mi("Couper", #selector(NSText.cut(_:)), "x"),
            mi("Copier", #selector(NSText.copy(_:)), "c"),
            mi("Coller", #selector(NSText.paste(_:)), "v"),
            mi("Tout sélectionner", #selector(NSText.selectAll(_:)), "a"),
        ])
        sub("Présentation", [
            mi("Recharger", #selector(reload), "r", self),
            mi("Retour", #selector(goBack), "[", self),
            mi("Plein écran", #selector(NSWindow.toggleFullScreen(_:)), "f"),
        ])
        sub("Fenêtre", [
            mi("Réduire", #selector(NSWindow.miniaturize(_:)), "m"),
            mi("Fermer", #selector(NSWindow.performClose(_:)), "w"),
        ])
        NSApp.mainMenu = main
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.activate(ignoringOtherApps: true)
app.run()
