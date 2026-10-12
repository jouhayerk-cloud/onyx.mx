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
        HStack(spacing: 8) {
            Circle()
                .fill(statusIndicatorColor)
                .frame(width: 8, height: 8)

            Text(statusMessage)
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundColor(.secondary)
                .lineLimit(1)

            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(Color(UIColor.systemBackground).opacity(0.95))
    }

    private var statusIndicatorColor: Color {
        switch modelStore.state {
        case .ready:
            return .green
        case .downloading:
            return .orange
        case .missing:
            return .red
        }
    }

    private var statusMessage: String {
        switch modelStore.state {
        case .ready(let url):
            return "LiteRT Model: \(url.lastPathComponent)"
        case .downloading(let progress):
            let pct = Int(progress * 100)
            return "Downloading model... \(pct)%"
        case .missing:
            return "Model missing: copy .litertlm to Documents/Models via USB"
        }
    }
}
