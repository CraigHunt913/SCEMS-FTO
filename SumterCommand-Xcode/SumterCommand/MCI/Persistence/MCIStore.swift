// MCIStore.swift
// Sumter EMS Command — MCI Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

// MARK: - Store (JSON file with file protection; truthful save state)

final class MCIStore: ObservableObject {
    enum SaveState: Equatable { case idle, pending, saving, saved(Date), failed(String) }
    enum ImportOutcome { case imported(UUID), duplicate, invalid(String) }

    @Published var data = MCIAppData()
    @Published var saveState: SaveState = .idle
    @Published var loadProblem: String?

    var boardVisible = false
    private var pendingSave: DispatchWorkItem?
    private var writesBlocked = false
    let directory: URL
    let fileURL: URL

    init() {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        directory = docs.appendingPathComponent("MCIBoard", isDirectory: true)
        fileURL = directory.appendingPathComponent("mci-store.json")
        load()
    }

    func now() -> Date { Date() }
    var initials: String { data.settings.initials }

    func load() {
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
                                                    attributes: [.protectionKey: FileProtectionType.completeUnlessOpen])
            guard FileManager.default.fileExists(atPath: fileURL.path) else {
                data = MCIAppData(); writesBlocked = false; loadProblem = nil
                return
            }
            let raw = try Data(contentsOf: fileURL)
            let decoded = try JSONDecoder().decode(MCIAppData.self, from: raw)
            guard decoded.schemaVersion <= MCIAppData.currentSchema else {
                writesBlocked = true
                loadProblem = "The saved incidents were written by a newer version of this app (schema \(decoded.schemaVersion)). Nothing has been changed."
                return
            }
            // Later schema versions migrate here, step by step, before use.
            data = decoded
            writesBlocked = false
            loadProblem = nil
        } catch {
            writesBlocked = true
            loadProblem = "The saved incident file could not be read: \(error.localizedDescription)"
        }
    }

    func setAsideUnreadableFile() {
        let dest = directory.appendingPathComponent("mci-store-unreadable-\(Int(Date().timeIntervalSince1970)).json")
        do {
            try FileManager.default.moveItem(at: fileURL, to: dest)
            data = MCIAppData(); writesBlocked = false; loadProblem = nil; saveState = .idle
        } catch {
            loadProblem = "The unreadable file could not be moved aside: \(error.localizedDescription)"
        }
    }

    func incident(_ id: UUID) -> MCIIncident? { data.incidents.first { $0.id == id } }

    /// Closed incidents are read-only unless the change is the explicit Reopen.
    func update(_ id: UUID, debounce: Bool = false, allowClosed: Bool = false, _ body: (inout MCIIncident) -> Void) {
        guard let i = data.incidents.firstIndex(where: { $0.id == id }) else { return }
        guard data.incidents[i].state == .open || allowClosed else { return }
        body(&data.incidents[i])
        if debounce { scheduleSave() } else { saveNow() }
    }

    func updateSettings(debounce: Bool = false, _ body: (inout MCISettings) -> Void) {
        body(&data.settings)
        if debounce { scheduleSave() } else { saveNow() }
        applyIdleTimer()
    }

    func scheduleSave() {
        saveState = .pending
        pendingSave?.cancel()
        let item = DispatchWorkItem { [weak self] in self?.saveNow() }
        pendingSave = item
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4, execute: item)
    }

    func flush() { if case .pending = saveState { saveNow() } }

    func saveNow() {
        pendingSave?.cancel()
        pendingSave = nil
        guard !writesBlocked else {
            saveState = .failed("Saving is paused until the unreadable saved file is resolved.")
            return
        }
        saveState = .saving
        do {
            let bytes = try JSONEncoder().encode(data)
            try bytes.write(to: fileURL, options: [.atomic, .completeFileProtectionUnlessOpen])
            saveState = .saved(Date())
        } catch {
            saveState = .failed(error.localizedDescription)   // in-memory data is kept; Retry writes again
        }
    }

    func applyIdleTimer() {
        UIApplication.shared.isIdleTimerDisabled = data.settings.keepAwake && boardVisible
    }

    // Incidents

    func newIncident(training: Bool) -> UUID {
        let t = now()
        var i = MCIIncident.new(now: t, settings: data.settings, training: training)
        let iid = i.id
        let number = i.localNumber
        i.log(iid, "incident", "created", after: number, now: t, initials: initials)
        data.incidents.append(i)
        saveNow()
        return iid
    }

    // Ink

    func ink(_ t: MCIInkTarget) -> MCIInk? {
        incident(t.incidentID)?.inks.first { $0.recordID == t.recordID && $0.fieldID == t.fieldID }
    }

    func saveInk(_ t: MCIInkTarget, drawing: PKDrawing, pageCount: Int) {
        let stamp = now()
        update(t.incidentID, debounce: true) { inc in
            let bytes = drawing.dataRepresentation()
            if let i = inc.inks.firstIndex(where: { $0.recordID == t.recordID && $0.fieldID == t.fieldID }) {
                inc.inks[i].drawing = bytes
                inc.inks[i].pageCount = pageCount
                inc.inks[i].updatedAt = stamp
            } else {
                inc.inks.append(MCIInk(id: UUID(), recordID: t.recordID, fieldID: t.fieldID, drawing: bytes,
                                       pageCount: pageCount, width: Double(t.width), pageHeight: Double(t.pageHeight),
                                       updatedAt: stamp))
            }
            if let si = inc.sketches.firstIndex(where: { $0.id == t.recordID }) { inc.sketches[si].updatedAt = stamp }
        }
    }

    // Files the operator supplies (sketch cards PDF, approved references)

    /// The operator's replacement sketch cards if one was added, otherwise the cards bundled with the app.
    var sketchPDFURL: URL? {
        if let name = data.settings.sketchPDFName {
            let u = directory.appendingPathComponent(name)
            if FileManager.default.fileExists(atPath: u.path) { return u }
        }
        return MCIBundled.sketchCards
    }

    func referenceURL(_ r: MCIReferenceDoc) -> URL { directory.appendingPathComponent("references").appendingPathComponent(r.fileName) }

    func copyIn(_ source: URL, to dest: URL) throws {
        let scoped = source.startAccessingSecurityScopedResource()
        defer { if scoped { source.stopAccessingSecurityScopedResource() } }
        try FileManager.default.createDirectory(at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
        let bytes = try Data(contentsOf: source)
        guard PDFDocument(data: bytes) != nil else { throw CocoaError(.fileReadCorruptFile) }
        try bytes.write(to: dest, options: [.atomic, .completeFileProtectionUnlessOpen])
    }

    func importSketchPDF(_ url: URL) -> String? {
        do {
            try copyIn(url, to: directory.appendingPathComponent("sketch-cards.pdf"))
            updateSettings { $0.sketchPDFName = "sketch-cards.pdf" }
            return nil
        } catch {
            return "That file could not be used as the sketch card PDF: \(error.localizedDescription)"
        }
    }

    func importReference(_ url: URL, meta: MCIReferenceDoc) -> String? {
        var r = meta
        r.fileName = "\(r.id.uuidString).pdf"
        do {
            try copyIn(url, to: referenceURL(r))
            updateSettings { $0.references.append(r) }
            return nil
        } catch {
            return "That file could not be added: \(error.localizedDescription)"
        }
    }

    // Import

    func importBackup(_ fileData: Data, allowDuplicate: Bool) -> ImportOutcome {
        let b: MCIBackup
        do {
            b = try MCIBackupCodec.decode(fileData)
        } catch MCIBackupError.newerVersion {
            return .invalid("This backup was made by a newer version of the app. Nothing was changed.")
        } catch {
            return .invalid("This file is not a readable MCI incident backup. Nothing was changed.")
        }
        let problems = MCIBackupCodec.validate(b.incident)
        if !problems.isEmpty {
            let list = problems.prefix(8).joined(separator: "\n")
            return .invalid("The backup failed validation. Nothing was changed.\n\(list)")
        }
        if !allowDuplicate && data.incidents.contains(where: { $0.sourceID == b.incident.id && $0.sourceExportedAt == b.exportedAt }) {
            return .duplicate
        }
        let copy = MCIBackupCodec.restoredCopy(b, now: now(), initials: initials)
        data.incidents.append(copy)
        saveNow()
        return .imported(copy.id)
    }

    // Bindings: text saves with a short debounce; structured changes save immediately.

    func text(_ id: UUID, _ kp: WritableKeyPath<MCIIncident, String>) -> Binding<String> {
        Binding(get: { self.incident(id)?[keyPath: kp] ?? "" },
                set: { v in self.update(id, debounce: true) { $0[keyPath: kp] = v } })
    }

    func record<R: Identifiable, V>(_ id: UUID, _ list: WritableKeyPath<MCIIncident, [R]>, _ recordID: UUID,
                                    _ kp: WritableKeyPath<R, V>, fallback: V, debounce: Bool = true) -> Binding<V> where R.ID == UUID {
        Binding(get: { self.incident(id)?[keyPath: list].first { $0.id == recordID }?[keyPath: kp] ?? fallback },
                set: { v in
                    self.update(id, debounce: debounce) { inc in
                        if let i = inc[keyPath: list].firstIndex(where: { $0.id == recordID }) { inc[keyPath: list][i][keyPath: kp] = v }
                    }
                })
    }
}
