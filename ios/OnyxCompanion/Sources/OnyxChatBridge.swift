import Foundation
import WebKit
import LiteRTLM

/// Actor managing the LiteRT-LM generative chat engine and conversation session on iOS.
/// All inference is serialised and executed asynchronously off the main thread.
actor ChatWorker {
    private let modelStore: ModelStore
    private var engine: Engine?
    private var activeModelURL: URL?
    private var initTask: Task<Engine, Error>?
    private var activeStreamTask: Task<Void, Never>?
    private weak var webView: WKWebView?

    init(modelStore: ModelStore) {
        self.modelStore = modelStore
    }

    func setWebView(_ webView: WKWebView) {
        self.webView = webView
    }

    /// Lazily initializes ONE LiteRT-LM generative Engine for chat.
    private func getOrInitializeEngine() async throws -> Engine {
        if let existing = engine {
            return existing
        }
        if let inFlight = initTask {
            return try await inFlight.value
        }

        let store = self.modelStore
        let task = Task<Engine, Error> {
            guard let modelURL = await store.currentChatModelURL() else {
                throw BridgeError.modelMissing("Chat model missing: copy Qwen/Gemma .litertlm to Documents/Models/chat over USB")
            }

            // Initialize LiteRT-LM generative engine
            let config = EngineConfig(modelPath: modelURL.path)
            let initialEngine = Engine(config: config)
            do {
                try await initialEngine.initialize()
                return initialEngine
            } catch {
                throw BridgeError.engineFailed("Failed to initialize chat engine: \(error.localizedDescription)")
            }
        }

        self.initTask = task
        do {
            let resolved = try await task.value
            self.activeModelURL = await store.currentChatModelURL()
            self.engine = resolved
            return resolved
        } catch {
            self.initTask = nil
            throw error
        }
    }

    // MARK: - Public Operations

    func info() async throws -> [String: Any] {
        let store = self.modelStore
        let isReady: Bool
        let modelURL = await store.currentChatModelURL()
        if case .ready = await store.chatState {
            isReady = true
        } else {
            isReady = modelURL != nil
        }

        return [
            "ready": isReady,
            "model": modelURL?.lastPathComponent ?? "None",
            "path": modelURL?.path ?? "",
            "backend": "GPU (Metal) / CPU",
            "contextWindow": 4096,
            "version": "0.18.0"
        ]
    }

    func listModels() async -> [String] {
        let urls = await modelStore.availableChatModels()
        return urls.map { $0.lastPathComponent }
    }

    func generate(
        system: String?,
        turns: [[String: Any]],
        tools: [[String: Any]]?,
        temperature: Double?,
        maxTokens: Int?
    ) async throws -> [String: Any] {
        let activeEngine = try await getOrInitializeEngine()
        let prompt = buildPrompt(system: system, turns: turns, tools: tools)

        let conversation = try await activeEngine.createConversation()
        let responseMessage = try await conversation.sendMessage(Message(prompt))
        let rawText = responseMessage.text

        let (cleanText, toolCalls) = parseToolCalls(rawText)
        let modelName = activeModelURL?.lastPathComponent ?? "qwen2.5-1.5b-instruct"

        return [
            "text": cleanText,
            "toolCalls": toolCalls,
            "model": modelName
        ]
    }

    func startStream(
        streamId: String,
        system: String?,
        turns: [[String: Any]],
        tools: [[String: Any]]?,
        temperature: Double?,
        maxTokens: Int?
    ) async throws -> [String: Any] {
        // Enforce single active stream: abort preceding run if still active
        activeStreamTask?.cancel()

        let activeEngine = try await getOrInitializeEngine()
        let prompt = buildPrompt(system: system, turns: turns, tools: tools)
        let modelName = activeModelURL?.lastPathComponent ?? "qwen2.5-1.5b-instruct"

        let conversation = try await activeEngine.createConversation()

        activeStreamTask = Task {
            do {
                let stream = try await conversation.sendMessageStream(Message(prompt))
                var accumulatedText = ""

                for try await chunk in stream {
                    if Task.isCancelled { break }
                    let token = chunk.text
                    accumulatedText += token

                    await self.dispatchToJS(event: [
                        "streamId": streamId,
                        "type": "token",
                        "text": token
                    ])
                }

                if !Task.isCancelled {
                    let (cleanText, toolCalls) = self.parseToolCalls(accumulatedText)
                    await self.dispatchToJS(event: [
                        "streamId": streamId,
                        "type": "done",
                        "result": [
                            "text": cleanText,
                            "toolCalls": toolCalls,
                            "model": modelName
                        ]
                    ])
                }
            } catch {
                if !Task.isCancelled {
                    await self.dispatchToJS(event: [
                        "streamId": streamId,
                        "type": "error",
                        "error": error.localizedDescription
                    ])
                }
            }
        }

        return ["started": true, "streamId": streamId]
    }

    func abortStream(streamId: String) {
        activeStreamTask?.cancel()
        activeStreamTask = nil
        Task { @MainActor in
            guard let webView = self.webView else { return }
            let js = "window.__onyxStreamDispatcher && window.__onyxStreamDispatcher({ streamId: '\(streamId)', type: 'error', error: 'Inference aborted' });"
            webView.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    // MARK: - Prompt & Tool Call Formatting

    private func buildPrompt(
        system: String?,
        turns: [[String: Any]],
        tools: [[String: Any]]?
    ) -> String {
        var sb = ""

        // System prompt with Qwen / tool-calling instructions
        var systemInstruction = system ?? "You are Onyx Intelligence, a sentient warehouse asset discovery assistant."
        if let tools = tools, !tools.isEmpty {
            systemInstruction += "\n\nYou have access to the following tools. To call a tool, respond with a tool call formatted as:\n<tool_call>\n{\"name\": \"tool_name\", \"arguments\": {\"arg1\": \"value\"}}\n</tool_call>\n\nAvailable tools:\n"
            if let toolsData = try? JSONSerialization.data(withJSONObject: tools, options: [.prettyPrinted]),
               let toolsStr = String(data: toolsData, encoding: .utf8) {
                systemInstruction += toolsStr
            }
        }

        sb += "<|im_start|>system\n\(systemInstruction)<|im_end|>\n"

        for turn in turns {
            let role = (turn["role"] as? String) ?? "user"
            let text = (turn["text"] as? String) ?? ""

            if role == "tool" {
                let callId = (turn["callId"] as? String) ?? ""
                let result = turn["result"] ?? ""
                let resultStr: String
                if let data = try? JSONSerialization.data(withJSONObject: result),
                   let str = String(data: data, encoding: .utf8) {
                    resultStr = str
                } else {
                    resultStr = String(describing: result)
                }
                sb += "<|im_start|>user\n<tool_response id=\"\(callId)\">\n\(resultStr)\n</tool_response><|im_end|>\n"
            } else if role == "assistant" {
                var assistantText = text
                if let toolCalls = turn["toolCalls"] as? [[String: Any]] {
                    for tc in toolCalls {
                        let name = (tc["name"] as? String) ?? ""
                        let args = tc["args"] ?? [:]
                        let argsStr: String
                        if let d = try? JSONSerialization.data(withJSONObject: args),
                           let s = String(data: d, encoding: .utf8) {
                            argsStr = s
                        } else {
                            argsStr = "{}"
                        }
                        assistantText += "\n<tool_call>\n{\"name\": \"\(name)\", \"arguments\": \(argsStr)}\n</tool_call>"
                    }
                }
                sb += "<|im_start|>assistant\n\(assistantText)<|im_end|>\n"
            } else {
                sb += "<|im_start|>user\n\(text)<|im_end|>\n"
            }
        }

        sb += "<|im_start|>assistant\n"
        return sb
    }

    private func parseToolCalls(_ text: String) -> (String, [[String: Any]]) {
        var cleanText = text
        var toolCalls: [[String: Any]] = []

        let pattern = "<tool_call>\\s*([\\s\\S]*?)\\s*</tool_call>"
        guard let regex = try? NSRegularExpression(pattern: pattern, options: []) else {
            return (cleanText, toolCalls)
        }

        let nsString = text as NSString
        let matches = regex.matches(in: text, options: [], range: NSRange(location: 0, length: nsString.length))

        var ordinal = 1
        for match in matches {
            if match.numberOfRanges > 1 {
                let jsonRange = match.range(at: 1)
                let jsonStr = nsString.substring(with: jsonRange).trimmingCharacters(in: .whitespacesAndNewlines)
                if let data = jsonStr.data(using: .utf8),
                   let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    let name = (json["name"] as? String) ?? ""
                    let args = (json["arguments"] as? [String: Any]) ?? [:]
                    let id = (json["id"] as? String) ?? "call_\(ordinal)"
                    ordinal += 1
                    toolCalls.append([
                        "id": id,
                        "name": name,
                        "args": args
                    ])
                }
            }
        }

        if !toolCalls.isEmpty {
            cleanText = regex.stringByReplacingMatches(in: cleanText, options: [], range: NSRange(location: 0, length: nsString.length), withTemplate: "").trimmingCharacters(in: .whitespacesAndNewlines)
        }

        return (cleanText, toolCalls)
    }

    @MainActor
    private func dispatchToJS(event: [String: Any]) {
        guard let webView = self.webView,
              let data = try? JSONSerialization.data(withJSONObject: event),
              let jsonStr = String(data: data, encoding: .utf8) else {
            return
        }

        let js = "window.__onyxStreamDispatcher && window.__onyxStreamDispatcher(\(jsonStr));"
        webView.evaluateJavaScript(js) { _, error in
            if let error = error {
                print("[OnyxChatBridge] JS eval error: \(error.localizedDescription)")
            }
        }
    }
}

/// Script message handler registered under "onyxChat" conforming to WKScriptMessageHandlerWithReply.
/// Bridges JavaScript Promise calls: window.webkit.messageHandlers.onyxChat.postMessage(msg).
public final class OnyxChatBridge: NSObject, WKScriptMessageHandlerWithReply {
    /// Handler registration name
    public static let handlerName = "onyxChat"

    private let worker: ChatWorker

    public init(modelStore: ModelStore = .shared) {
        self.worker = ChatWorker(modelStore: modelStore)
        super.init()
    }

    public func setWebView(_ webView: WKWebView) {
        Task {
            await worker.setWebView(webView)
        }
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

                switch op {
                case "info":
                    result = try await worker.info()

                case "models_list":
                    let list = await worker.listModels()
                    result = ["models": list]

                case "chat_generate":
                    let system = dict["system"] as? String
                    let turns = (dict["turns"] as? [[String: Any]]) ?? []
                    let tools = dict["tools"] as? [[String: Any]]
                    let temperature = dict["temperature"] as? Double
                    let maxTokens = dict["maxTokens"] as? Int
                    result = try await worker.generate(
                        system: system,
                        turns: turns,
                        tools: tools,
                        temperature: temperature,
                        maxTokens: maxTokens
                    )

                case "chat_stream":
                    guard let streamId = dict["streamId"] as? String else {
                        throw BridgeError.invalidPayload("Expected 'streamId' string for 'chat_stream'")
                    }
                    let system = dict["system"] as? String
                    let turns = (dict["turns"] as? [[String: Any]]) ?? []
                    let tools = dict["tools"] as? [[String: Any]]
                    let temperature = dict["temperature"] as? Double
                    let maxTokens = dict["maxTokens"] as? Int
                    result = try await worker.startStream(
                        streamId: streamId,
                        system: system,
                        turns: turns,
                        tools: tools,
                        temperature: temperature,
                        maxTokens: maxTokens
                    )

                case "chat_abort":
                    guard let streamId = dict["streamId"] as? String else {
                        throw BridgeError.invalidPayload("Expected 'streamId' string for 'chat_abort'")
                    }
                    await worker.abortStream(streamId: streamId)
                    result = ["aborted": true, "streamId": streamId]

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
