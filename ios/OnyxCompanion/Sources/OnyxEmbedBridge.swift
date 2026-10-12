import Foundation
import WebKit
import LiteRTLM

/// Error types with human-readable error messages for the web side.
enum BridgeError: LocalizedError {
    case modelMissing(String)
    case modelNotDownloaded(String)
    case engineFailed(String)
    case invalidPayload(String)
    case unknownOp(String)

    var errorDescription: String? {
        switch self {
        case .modelMissing(let msg): return msg
        case .modelNotDownloaded(let msg): return msg
        case .engineFailed(let msg): return msg
        case .invalidPayload(let msg): return msg
        case .unknownOp(let msg): return msg
        }
    }
}

/// Actor managing the single LiteRT-LM EmbeddingEngine instance.
/// Running inside an actor guarantees all inferences are serialised
/// and executed asynchronously on background threads.
actor EmbeddingWorker {
    private let modelStore: ModelStore
    private var engine: EmbeddingEngine?
    private var activeModelURL: URL?
    private var dimensions: Int = 0
    private var initTask: Task<EmbeddingEngine, Error>?

    init(modelStore: ModelStore) {
        self.modelStore = modelStore
    }

    /// Lazily resolves the model file from ModelStore and initializes ONE EmbeddingEngine.
    /// Uses single-flight Task caching to prevent actor reentrancy loading models concurrently.
    private func getOrInitializeEngine() async throws -> EmbeddingEngine {
        if let existing = engine {
            return existing
        }
        if let inFlight = initTask {
            return try await inFlight.value
        }

        let store = self.modelStore
        let task = Task<EmbeddingEngine, Error> {
            let state = await store.state
            let modelURL: URL
            switch state {
            case .ready(let url):
                modelURL = url
            case .downloading:
                throw BridgeError.modelNotDownloaded("model not downloaded: download in progress")
            case .missing:
                if let found = await store.currentModelURL() {
                    modelURL = found
                } else {
                    throw BridgeError.modelMissing("model missing: copy .litertlm to Documents/Models over USB")
                }
            }

            let multimodalConfig = EmbeddingEngineConfig(
                modelPath: modelURL.path,
                backend: .cpu(),
                visionBackend: .cpu(),
                audioBackend: .cpu()
            )

            let initialEngine = EmbeddingEngine(config: multimodalConfig)
            let resolvedEngine: EmbeddingEngine
            do {
                try await initialEngine.initialize()
                resolvedEngine = initialEngine
            } catch {
                let textOnlyConfig = EmbeddingEngineConfig(
                    modelPath: modelURL.path,
                    backend: .cpu()
                )
                let fallbackEngine = EmbeddingEngine(config: textOnlyConfig)
                do {
                    try await fallbackEngine.initialize()
                    resolvedEngine = fallbackEngine
                } catch {
                    throw BridgeError.engineFailed("engine failed: initialization failed - \(error.localizedDescription)")
                }
            }
            return resolvedEngine
        }

        self.initTask = task
        do {
            let resolved = try await task.value
            if self.dimensions == 0 {
                let probe = try await resolved.computeEmbedding(
                    contents: [.text("probe")],
                    options: EmbeddingOptions(normalize: true)
                )
                self.dimensions = probe.embedding.count
            }
            self.activeModelURL = await store.currentModelURL()
            self.engine = resolved
            return resolved
        } catch {
            self.initTask = nil
            throw error
        }
    }

    func info() async throws -> [String: Any] {
        _ = try await getOrInitializeEngine()
        let modelName = activeModelURL?.lastPathComponent ?? "EmbeddingGemma 2"
        return [
            "model": modelName,
            "dims": dimensions,
            "version": "0.18.0",
            "modalities": ["text", "image", "audio"]
        ]
    }

    func embed(texts: [String], outputSize: Int? = nil) async throws -> [String: Any] {
        guard !texts.isEmpty else {
            return ["vectors": [] as [[Double]]]
        }
        let activeEngine = try await getOrInitializeEngine()
        let batch: [[Content]] = texts.map { [.text($0)] }
        do {
            let responses = try await activeEngine.computeEmbeddingBatch(
                contentsBatch: batch,
                options: EmbeddingOptions(normalize: true, outputSize: outputSize)
            )
            let vectors: [[Double]] = responses.map { resp in
                resp.embedding.map { Double($0) }
            }
            return ["vectors": vectors]
        } catch {
            throw BridgeError.engineFailed("engine failed: \(error.localizedDescription)")
        }
    }

    func embedImage(base64: String, outputSize: Int? = nil) async throws -> [String: Any] {
        let activeEngine = try await getOrInitializeEngine()
        guard let data = decodeBase64(base64) else {
            throw BridgeError.invalidPayload("Invalid base64 payload for image")
        }
        do {
            let response = try await activeEngine.computeEmbedding(
                contents: [.imageData(data)],
                options: EmbeddingOptions(normalize: true, outputSize: outputSize)
            )
            let vector: [Double] = response.embedding.map { Double($0) }
            return ["vector": vector]
        } catch {
            throw BridgeError.engineFailed("engine failed: \(error.localizedDescription)")
        }
    }

    func embedAudio(base64: String, outputSize: Int? = nil) async throws -> [String: Any] {
        let activeEngine = try await getOrInitializeEngine()
        guard let data = decodeBase64(base64) else {
            throw BridgeError.invalidPayload("Invalid base64 payload for audio")
        }
        do {
            let response = try await activeEngine.computeEmbedding(
                contents: [.audioData(data)],
                options: EmbeddingOptions(normalize: true, outputSize: outputSize)
            )
            let vector: [Double] = response.embedding.map { Double($0) }
            return ["vector": vector]
        } catch {
            throw BridgeError.engineFailed("engine failed: \(error.localizedDescription)")
        }
    }

    private func decodeBase64(_ string: String) -> Data? {
        var clean = string
        if let commaIndex = clean.firstIndex(of: ",") {
            clean = String(clean[clean.index(after: commaIndex)...])
        }
        return Data(base64Encoded: clean, options: [.ignoreUnknownCharacters])
    }
}

/// Script message handler registered under "onyxEmbed" conforming to WKScriptMessageHandlerWithReply.
/// Bridges JavaScript Promise calls: window.webkit.messageHandlers.onyxEmbed.postMessage(msg).
public final class OnyxEmbedBridge: NSObject, WKScriptMessageHandlerWithReply {
    /// Handler registration name
    public static let handlerName = "onyxEmbed"

    private let worker: EmbeddingWorker

    public init(modelStore: ModelStore = .shared) {
        self.worker = EmbeddingWorker(modelStore: modelStore)
        super.init()
    }

    public func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping @Sendable (Any?, String?) -> Void
    ) {
        guard let dict = message.body as? [String: Any],
              let op = dict["op"] as? String else {
            replyHandler(nil, "Invalid message format: expected JSON dictionary with 'op'")
            return
        }

        Task {
            do {
                let result: [String: Any]
                let outputSize = dict["outputSize"] as? Int ?? dict["dims"] as? Int

                switch op {
                case "info":
                    result = try await worker.info()

                case "embed":
                    guard let texts = dict["texts"] as? [String] else {
                        throw BridgeError.invalidPayload("Expected 'texts' array of strings for 'embed'")
                    }
                    result = try await worker.embed(texts: texts, outputSize: outputSize)

                case "embed_image":
                    guard let base64 = dict["base64"] as? String else {
                        throw BridgeError.invalidPayload("Expected 'base64' string for 'embed_image'")
                    }
                    result = try await worker.embedImage(base64: base64, outputSize: outputSize)

                case "embed_audio":
                    guard let base64 = dict["base64"] as? String else {
                        throw BridgeError.invalidPayload("Expected 'base64' string for 'embed_audio'")
                    }
                    result = try await worker.embedAudio(base64: base64, outputSize: outputSize)

                default:
                    throw BridgeError.unknownOp("Unsupported op '\(op)'")
                }

                replyHandler(result, nil)
            } catch {
                let message: String
                if let bridgeErr = error as? BridgeError {
                    message = bridgeErr.errorDescription ?? error.localizedDescription
                } else {
                    message = "engine failed: \(error.localizedDescription)"
                }
                replyHandler(nil, message)
            }
        }
    }
}
