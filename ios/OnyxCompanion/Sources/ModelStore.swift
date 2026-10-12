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

    /// Scans Documents/Models and Bundle for a valid .litertlm file.
    public func refresh() {
        if let modelURL = locateModelFile() {
            state = .ready(url: modelURL)
        } else if !Self.defaultDownloadURLString.isEmpty {
            startDownloadIfPossible()
        } else {
            state = .missing
        }
    }

    /// Resolves the current model URL if available.
    public func currentModelURL() -> URL? {
        if case .ready(let url) = state {
            return url
        }
        return locateModelFile()
    }

    // MARK: - File Discovery

    private func locateModelFile() -> URL? {
        if let docModel = findInDocuments() {
            return docModel
        }
        if let bundleModel = findInBundle() {
            return bundleModel
        }
        return nil
    }

    private func findInDocuments() -> URL? {
        guard let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            return nil
        }
        let modelsDir = documentsURL.appendingPathComponent("Models", isDirectory: true)

        // Ensure Models directory exists for iTunes File Sharing discovery
        if !FileManager.default.fileExists(atPath: modelsDir.path) {
            try? FileManager.default.createDirectory(at: modelsDir, withIntermediateDirectories: true)
        }

        guard let urls = try? FileManager.default.contentsOfDirectory(
            at: modelsDir,
            includingPropertiesForKeys: [.fileSizeKey],
            options: [.skipsHiddenFiles]
        ) else {
            return nil
        }

        let candidates = urls.filter { $0.pathExtension.lowercased() == "litertlm" }
        return pickLargestValidModel(from: candidates)
    }

    private func findInBundle() -> URL? {
        var candidates: [URL] = []
        if let bundleURLs = Bundle.main.urls(forResourcesWithExtension: "litertlm", subdirectory: nil) {
            candidates.append(contentsOf: bundleURLs)
        }
        if let modelsSubdir = Bundle.main.urls(forResourcesWithExtension: "litertlm", subdirectory: "Models") {
            candidates.append(contentsOf: modelsSubdir)
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
