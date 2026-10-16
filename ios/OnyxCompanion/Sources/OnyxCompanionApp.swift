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
        VStack(spacing: 0) {
            WebContainer(modelStore: modelStore)
                .ignoresSafeArea(edges: .top)

            statusLine
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
        .padding(.vertical, 6)
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
