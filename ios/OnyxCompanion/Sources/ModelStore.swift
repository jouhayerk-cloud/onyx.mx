import Foundation
import Combine

/// Manages locating and downloading LiteRT-LM model files for on-device inference.
/// Lookup order:
/// 1. Documents/Models/*.litertlm (preferred: largest file, copied over USB via File Sharing)
/// 2. Bundle.main/*.litertlm (preferred: largest file embedded in app bundle)
/// 3. Download via URLSession if defaultDownloadURLString is configured.
@MainActor
public final class ModelStore: NSObject, ObservableObject, URLSessionDownloadDelegate {
    public static let shared = ModelStore()

    public enum State: Equatable {
        case missing
        case downloading(progress: Double)
        case ready(url: URL)
    }

    /// Base download URL. Empty by default so the app directs users to copy
    /// the model into Documents/Models over USB instead of downloading unlicensed models.
    public static let defaultDownloadURLString: String = ""

    /// Minimum threshold for a valid model file: 1 MB (1,000,000 bytes).
    private static let minimumModelSizeBytes: Int64 = 1_000_000

    @Published public private(set) var state: State = .missing
    @Published public private(set) var chatState: State = .missing

    public var embeddingState: State {
        return state
    }

    private var downloadTask: URLSessionDownloadTask?
    private var resumeData: Data?
    private lazy var urlSession: URLSession = {
        let configuration = URLSessionConfiguration.default
        return URLSession(configuration: configuration, delegate: self, delegateQueue: .main)
    }()

    public override init() {
        super.init()
        refresh()
    }

    /// Scans Documents/Models and Bundle for valid embedding and chat .litertlm files.
    public func refresh() {
        // 1. Resolve Embedding Model
        if let embedURL = locateEmbeddingModelFile() {
            state = .ready(url: embedURL)
        } else if !Self.defaultDownloadURLString.isEmpty {
            startDownloadIfPossible()
        } else {
            state = .missing
        }

        // 2. Resolve Chat / SLM Model
        if let chatURL = locateChatModelFile() {
            chatState = .ready(url: chatURL)
        } else {
            chatState = .missing
        }
    }

    /// Resolves the current embedding model URL if available (backwards-compatible).
    public func currentModelURL() -> URL? {
        return currentEmbeddingModelURL()
    }

    /// Resolves the current embedding model URL if available.
    public func currentEmbeddingModelURL() -> URL? {
        if case .ready(let url) = state {
            return url
        }
        return locateEmbeddingModelFile()
    }

    /// Resolves the current chat / generative SLM model URL if available.
    public func currentChatModelURL() -> URL? {
        if case .ready(let url) = chatState {
            return url
        }
        return locateChatModelFile()
    }

    /// Returns all discovered chat model URLs.
    public func availableChatModels() -> [URL] {
        return findAllChatModelFiles()
    }

    // MARK: - File Discovery

    private func locateEmbeddingModelFile() -> URL? {
        if let docModel = findEmbeddingInDocuments() {
            return docModel
        }
        if let bundleModel = findEmbeddingInBundle() {
            return bundleModel
        }
        return nil
    }

    private func locateChatModelFile() -> URL? {
        if let docModel = findChatInDocuments() {
            return docModel
        }
        if let bundleModel = findChatInBundle() {
            return bundleModel
        }
        return nil
    }

    private func getModelsDirectory() -> URL? {
        guard let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            return nil
        }
        let modelsDir = documentsURL.appendingPathComponent("Models", isDirectory: true)
        if !FileManager.default.fileExists(atPath: modelsDir.path) {
            try? FileManager.default.createDirectory(at: modelsDir, withIntermediateDirectories: true)
        }
        return modelsDir
    }

    private func findEmbeddingInDocuments() -> URL? {
        guard let modelsDir = getModelsDirectory() else { return nil }
        let embedSubdir = modelsDir.appendingPathComponent("embeddings", isDirectory: true)

        var candidates: [URL] = []
        if let urls = try? FileManager.default.contentsOfDirectory(at: embedSubdir, includingPropertiesForKeys: [.fileSizeKey], options: [.skipsHiddenFiles]) {
            candidates.append(contentsOf: urls.filter { $0.pathExtension.lowercased() == "litertlm" })
        }

        if let urls = try? FileManager.default.contentsOfDirectory(at: modelsDir, includingPropertiesForKeys: [.fileSizeKey], options: [.skipsHiddenFiles]) {
            let rootModels = urls.filter { $0.pathExtension.lowercased() == "litertlm" }
            for u in rootModels {
                let name = u.lastPathComponent.lowercased()
                let size = (try? u.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
                // Match explicit embed naming or size threshold (< 800 MB)
                if name.contains("embed") || (size > Self.minimumModelSizeBytes && size < 800_000_000 && !name.contains("qwen") && !name.contains("chat")) {
                    candidates.append(u)
                }
            }
        }
        return pickLargestValidModel(from: candidates)
    }

    private func findChatInDocuments() -> URL? {
        guard let modelsDir = getModelsDirectory() else { return nil }
        let chatSubdir = modelsDir.appendingPathComponent("chat", isDirectory: true)

        var candidates: [URL] = []
        if let urls = try? FileManager.default.contentsOfDirectory(at: chatSubdir, includingPropertiesForKeys: [.fileSizeKey], options: [.skipsHiddenFiles]) {
            candidates.append(contentsOf: urls.filter { $0.pathExtension.lowercased() == "litertlm" })
        }

        if let urls = try? FileManager.default.contentsOfDirectory(at: modelsDir, includingPropertiesForKeys: [.fileSizeKey], options: [.skipsHiddenFiles]) {
            let rootModels = urls.filter { $0.pathExtension.lowercased() == "litertlm" }
            for u in rootModels {
                let name = u.lastPathComponent.lowercased()
                let size = (try? u.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
                // Match chat keywords or size threshold (>= 800 MB)
                if name.contains("qwen") || name.contains("instruct") || name.contains("chat") || (size >= 800_000_000 && !name.contains("embed")) {
                    candidates.append(u)
                }
            }
        }
        return pickLargestValidModel(from: candidates)
    }

    private func findAllChatModelFiles() -> [URL] {
        var all: [URL] = []
        guard let modelsDir = getModelsDirectory() else { return all }
        let chatSubdir = modelsDir.appendingPathComponent("chat", isDirectory: true)

        if let urls = try? FileManager.default.contentsOfDirectory(at: chatSubdir, includingPropertiesForKeys: [.fileSizeKey], options: [.skipsHiddenFiles]) {
            all.append(contentsOf: urls.filter { $0.pathExtension.lowercased() == "litertlm" })
        }

        if let urls = try? FileManager.default.contentsOfDirectory(at: modelsDir, includingPropertiesForKeys: [.fileSizeKey], options: [.skipsHiddenFiles]) {
            let rootModels = urls.filter { $0.pathExtension.lowercased() == "litertlm" }
            for u in rootModels {
                let name = u.lastPathComponent.lowercased()
                let size = (try? u.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
                if name.contains("qwen") || name.contains("instruct") || name.contains("chat") || (size >= 800_000_000 && !name.contains("embed")) {
                    if !all.contains(u) { all.append(u) }
                }
            }
        }
        return all
    }

    private func findEmbeddingInBundle() -> URL? {
        var candidates: [URL] = []
        if let bundleURLs = Bundle.main.urls(forResourcesWithExtension: "litertlm", subdirectory: "embeddings") {
            candidates.append(contentsOf: bundleURLs)
        }
        if let bundleURLs = Bundle.main.urls(forResourcesWithExtension: "litertlm", subdirectory: nil) {
            candidates.append(contentsOf: bundleURLs.filter { $0.lastPathComponent.lowercased().contains("embed") })
        }
        return pickLargestValidModel(from: candidates)
    }

    private func findChatInBundle() -> URL? {
        var candidates: [URL] = []
        if let bundleURLs = Bundle.main.urls(forResourcesWithExtension: "litertlm", subdirectory: "chat") {
            candidates.append(contentsOf: bundleURLs)
        }
        if let bundleURLs = Bundle.main.urls(forResourcesWithExtension: "litertlm", subdirectory: nil) {
            candidates.append(contentsOf: bundleURLs.filter {
                let n = $0.lastPathComponent.lowercased()
                return n.contains("qwen") || n.contains("instruct") || n.contains("chat")
            })
        }
        return pickLargestValidModel(from: candidates)
    }

    private func pickLargestValidModel(from urls: [URL]) -> URL? {
        var largestURL: URL? = nil
        var largestSize: Int64 = -1

        for url in urls {
            guard let values = try? url.resourceValues(forKeys: [.fileSizeKey]),
                  let size = values.fileSize.map({ Int64($0) }),
                  size > Self.minimumModelSizeBytes else {
                continue
            }
            if size > largestSize {
                largestSize = size
                largestURL = url
            }
        }
        return largestURL
    }

    // MARK: - Download Task

    public func startDownloadIfPossible() {
        guard let downloadURL = URL(string: Self.defaultDownloadURLString),
              !Self.defaultDownloadURLString.isEmpty else {
            state = .missing
            return
        }

        if let resumeData = self.resumeData {
            let task = urlSession.downloadTask(withResumeData: resumeData)
            self.downloadTask = task
            self.resumeData = nil
            state = .downloading(progress: 0.0)
            task.resume()
        } else {
            let task = urlSession.downloadTask(with: downloadURL)
            self.downloadTask = task
            state = .downloading(progress: 0.0)
            task.resume()
        }
    }

    public func cancelDownload() {
        downloadTask?.cancel { [weak self] resumeData in
            Task { @MainActor in
                self?.resumeData = resumeData
                self?.state = .missing
            }
        }
    }

    // MARK: - URLSessionDownloadDelegate

    public func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didWriteData bytesWritten: Int64,
        totalBytesWritten: Int64,
        totalBytesExpectedToWrite: Int64
    ) {
        guard totalBytesExpectedToWrite > 0 else { return }
        let progress = Double(totalBytesWritten) / Double(totalBytesExpectedToWrite)
        self.state = .downloading(progress: min(max(progress, 0.0), 1.0))
    }

    public func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didFinishDownloadingTo location: URL
    ) {
        guard let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            self.state = .missing
            return
        }
        let modelsDir = documentsURL.appendingPathComponent("Models", isDirectory: true)
        try? FileManager.default.createDirectory(at: modelsDir, withIntermediateDirectories: true)

        let targetFilename = downloadTask.originalRequest?.url?.lastPathComponent ?? "model.litertlm"
        let destinationURL = modelsDir.appendingPathComponent(targetFilename)

        do {
            if FileManager.default.fileExists(atPath: destinationURL.path) {
                try FileManager.default.removeItem(at: destinationURL)
            }
            try FileManager.default.moveItem(at: location, to: destinationURL)

            // Verify file size exceeds 1 MB threshold
            if let values = try? destinationURL.resourceValues(forKeys: [.fileSizeKey]),
               let size = values.fileSize.map({ Int64($0) }),
               size > Self.minimumModelSizeBytes {
                self.state = .ready(url: destinationURL)
            } else {
                try? FileManager.default.removeItem(at: destinationURL)
                self.state = .missing
            }
        } catch {
            self.state = .missing
        }
    }

    public func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didCompleteWithError error: Error?
    ) {
        if let error = error {
            let nsError = error as NSError
            if let resumeData = nsError.userInfo[NSURLSessionDownloadTaskResumeData] as? Data {
                self.resumeData = resumeData
            }
            self.state = .missing
        }
    }
}
