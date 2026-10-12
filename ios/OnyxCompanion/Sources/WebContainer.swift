import SwiftUI
import WebKit

/// Wraps WKWebView to host the Onyx PWA with the native LiteRT-LM embedding bridge.
public struct WebContainer: UIViewRepresentable {
    /// Canonical web application URL.
    public static let appURL = URL(string: "https://jouhayerk-cloud.github.io/onyx.mx/")!

    private let modelStore: ModelStore

    public init(modelStore: ModelStore = .shared) {
        self.modelStore = modelStore
    }

    public func makeCoordinator() -> Coordinator {
        Coordinator(modelStore: modelStore)
    }

    public func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()

        // Persist localStorage, cookies, and indexedDB across app sessions
        configuration.websiteDataStore = .default()

        // Register script message handler with reply for asynchronous Promise resolution
        configuration.userContentController.addScriptMessageHandler(
            context.coordinator.bridge,
            contentWorld: .page,
            name: "onyxEmbed"
        )

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator

        #if DEBUG
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
        #endif

        let request = URLRequest(url: Self.appURL)
        webView.load(request)

        return webView
    }

    public func updateUIView(_ uiView: WKWebView, context: Context) {
        // No dynamic view updates required
    }

    public final class Coordinator: NSObject, WKNavigationDelegate {
        let bridge: OnyxEmbedBridge

        init(modelStore: ModelStore) {
            self.bridge = OnyxEmbedBridge(modelStore: modelStore)
            super.init()
        }
    }
}
