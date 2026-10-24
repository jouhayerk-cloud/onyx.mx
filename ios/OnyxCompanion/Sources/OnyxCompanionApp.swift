import SwiftUI

@main
struct OnyxCompanionApp: App {
    @StateObject private var modelStore = ModelStore.shared

    var body: some Scene {
        WindowGroup {
            OnyxMainView(modelStore: modelStore)
        }
    }
}

struct OnyxMainView: View {
    @ObservedObject var modelStore: ModelStore

    var body: some View {
        // True edge-to-edge: the webview ignores every safe area (including the home indicator
        // strip), and the status line floats over it as an overlay that also ignores safe areas, so
        // neither view leaves the system a gap to pad with a bare background. The status line keeps
        // its own bottom padding so its text/dots clear the home indicator without reserving space.
        ZStack(alignment: .bottom) {
            WebContainer(modelStore: modelStore)
                .ignoresSafeArea()

            statusLine
                .ignoresSafeArea(edges: .bottom)
        }
        .onAppear {
            modelStore.refresh()
        }
    }

    @ViewBuilder
    private var statusLine: some View {
        HStack(spacing: 12) {
            HStack(spacing: 6) {
                Circle()
                    .fill(statusIndicatorColor(for: modelStore.state))
                    .frame(width: 8, height: 8)

                Text(embeddingStatusText)
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }

            Divider()
                .frame(height: 12)

            HStack(spacing: 6) {
                Circle()
                    .fill(statusIndicatorColor(for: modelStore.chatState))
                    .frame(width: 8, height: 8)

                Text(chatStatusText)
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }

            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.top, 6)
        // extra bottom padding, not safe-area inset: the background must still reach the true edge
        // (fullscreen), only the text/dots need to clear the home indicator's swipe strip
        .padding(.bottom, 6 + 20)
        .background(Color(UIColor.systemBackground).opacity(0.95))
    }

    private func statusIndicatorColor(for state: ModelStore.State) -> Color {
        switch state {
        case .ready:
            return .green
        case .downloading:
            return .orange
        case .missing:
            return .red
        }
    }

    private var embeddingStatusText: String {
        switch modelStore.state {
        case .ready(let url):
            return "Embed: \(url.lastPathComponent)"
        case .downloading(let progress):
            let pct = Int(progress * 100)
            return "Embed: \(pct)%"
        case .missing:
            return "Embed: Missing"
        }
    }

    private var chatStatusText: String {
        switch modelStore.chatState {
        case .ready(let url):
            return "Chat: \(url.lastPathComponent)"
        case .downloading(let progress):
            let pct = Int(progress * 100)
            return "Chat: \(pct)%"
        case .missing:
            return "Chat: Missing"
        }
    }
}
