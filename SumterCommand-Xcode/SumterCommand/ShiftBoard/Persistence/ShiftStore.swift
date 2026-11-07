// ShiftStore.swift
// Sumter EMS Command — Shift Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

// MARK: - Store (JSON file with file protection, truthful save state)

final class Store: ObservableObject {
    enum SaveState: Equatable { case idle, pending, saving, saved(Date), failed(String) }
    enum ImportOutcome { case imported(UUID), duplicate, invalid(String) }

    @Published var data = AppData()
    @Published var saveState: SaveState = .idle
    @Published var loadProblem: String?

    var boardVisible = false
    private var pendingSave: DispatchWorkItem?
    private var writesBlocked = false
    let directory: URL
    let fileURL: URL

    init() {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        directory = docs.appendingPathComponent("SumterCommand", isDirectory: true)
        fileURL = directory.appendingPathComponent("board-store.json")
        load()
    }

    func now() -> Date { Date() }

    func load() {
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
                                                    attributes: [.protectionKey: FileProtectionType.completeUnlessOpen])
            guard FileManager.default.fileExists(atPath: fileURL.path) else {
                data = AppData(); writesBlocked = false; loadProblem = nil
                return
            }
            let raw = try Data(contentsOf: fileURL)
            let decoded = try JSONDecoder().decode(AppData.self, from: raw)
            guard decoded.schemaVersion <= AppData.currentSchema else {
                writesBlocked = true
                loadProblem = "The saved board was written by a newer version of this app (schema \(decoded.schemaVersion)). It has not been changed."
                return
            }
            // Future schema versions migrate here, step by step, before use.
            data = decoded
            writesBlocked = false
            loadProblem = nil
        } catch {
            writesBlocked = true
            loadProblem = "The saved board file could not be read: \(error.localizedDescription)"
        }
    }

    func setAsideUnreadableFile() {
        let dest = directory.appendingPathComponent("board-store-unreadable-\(Int(Date().timeIntervalSince1970)).json")
        do {
            try FileManager.default.moveItem(at: fileURL, to: dest)
            data = AppData()
            writesBlocked = false
            loadProblem = nil
            saveState = .idle
        } catch {
            loadProblem = "The unreadable file could not be moved aside: \(error.localizedDescription)"
        }
    }

    func shift(_ id: UUID) -> ShiftRecord? { data.shifts.first { $0.id == id } }

    /// Archived shifts are read-only: edits are refused unless explicitly allowed (Reopen).
    func update(_ shiftID: UUID, debounce: Bool = false, allowArchived: Bool = false,
                _ body: (inout ShiftRecord) -> Void) {
        guard let i = data.shifts.firstIndex(where: { $0.id == shiftID }) else { return }
        guard data.shifts[i].state == .active || allowArchived else { return }
        body(&data.shifts[i])
        if debounce { scheduleSave() } else { saveNow() }
    }

    func updateSettings(debounce: Bool = false, _ body: (inout AppSettings) -> Void) {
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

    /// Called on field exit, record navigation, Done, and when the app leaves the foreground.
    func flush() {
        if case .pending = saveState { saveNow() }
    }

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
            // In-memory data is kept; Retry writes it again.
            saveState = .failed(error.localizedDescription)
        }
    }

    func applyIdleTimer() {
        UIApplication.shared.isIdleTimerDisabled = data.settings.keepAwake && boardVisible
    }

    // Shifts

    func createShift(previousID: UUID?, carry: CarryForward, header: ShiftHeader, training: Bool) -> UUID {
        let t = now()
        let initials = data.settings.initials
        let prev = previousID.flatMap { shift($0) }
        var s = ShiftRecord.newShift(previous: prev, carry: carry, header: header,
                                     tzID: data.settings.defaultTimeZoneID, training: training,
                                     initials: initials, now: t)
        if training { s.applyTrainingSeed(now: t) }
        data.shifts.append(s)
        if let prev, let pi = data.shifts.firstIndex(where: { $0.id == prev.id }) {
            for c in s.calls where c.transferredFromShiftID == prev.id {
                data.shifts[pi].log(batch: UUID(), record: c.id, kind: "call", action: "runTransferredOut",
                                    field: "run", before: nil, after: c.runNumber, effective: t, now: t,
                                    initials: initials, note: "Continued in shift of \(s.title)")
            }
        }
        saveNow()
        return s.id
    }

    func archive(_ id: UUID) {
        let t = now()
        let initials = data.settings.initials
        update(id) { s in
            s.state = .archived
            s.archivedAt = t
            s.log(batch: UUID(), record: s.id, kind: "shift", action: "archived", field: "state", before: "Active",
                  after: "Archived", effective: t, now: t, initials: initials)
        }
    }

    func reopen(_ id: UUID) {
        let t = now()
        let initials = data.settings.initials
        update(id, allowArchived: true) { s in
            guard s.state == .archived else { return }
            s.state = .active
            s.log(batch: UUID(), record: s.id, kind: "shift", action: "reopened", field: "state",
                  before: "Archived", after: "Active", effective: t, now: t, initials: initials)
        }
    }

    // Ink

    func ink(_ t: InkTarget) -> InkAttachment? { shift(t.shiftID)?.ink(t.recordID, t.fieldID) }

    func saveInk(_ t: InkTarget, drawing: PKDrawing, pageCount: Int) {
        let stamp = now()
        update(t.shiftID, debounce: true) { s in
            let bytes = drawing.dataRepresentation()
            if let i = s.inks.firstIndex(where: { $0.recordID == t.recordID && $0.fieldID == t.fieldID }) {
                s.inks[i].drawing = bytes
                s.inks[i].pageCount = pageCount
                s.inks[i].updatedAt = stamp
            } else {
                s.inks.append(InkAttachment(id: UUID(), recordID: t.recordID, fieldID: t.fieldID, drawing: bytes,
                                            pageCount: pageCount, canvasWidth: Double(InkLayout.width),
                                            pageHeight: Double(InkLayout.pageHeight), updatedAt: stamp))
            }
        }
    }

    // Import

    func importBackup(_ fileData: Data, allowDuplicate: Bool) -> ImportOutcome {
        let backup: ShiftBackup
        do {
            backup = try Backup.decode(fileData)
        } catch BackupError.newerVersion {
            return .invalid("This backup was made by a newer version of the app. Nothing was changed.")
        } catch {
            return .invalid("This file is not a readable Sumter EMS Command backup. Nothing was changed.")
        }
        let problems = Backup.validate(backup.shift)
        if !problems.isEmpty {
            return .invalid("The backup failed validation. Nothing was changed.\n" + problems.prefix(8).joined(separator: "\n"))
        }
        let isDuplicate = data.shifts.contains {
            $0.sourceShiftID == backup.shift.id && $0.sourceExportedAt == backup.exportedAt
        }
        if isDuplicate && !allowDuplicate { return .duplicate }
        let copy = Backup.restoredCopy(backup, now: now(), initials: data.settings.initials)
        data.shifts.append(copy)
        saveNow()
        return .imported(copy.id)
    }

    // Bindings that save with a short debounce (text) — structured changes save immediately elsewhere.

    func unitText(_ shiftID: UUID, _ unitID: UUID, _ kp: WritableKeyPath<RosterUnit, String>) -> Binding<String> {
        Binding(get: { self.shift(shiftID)?.unit(unitID)?[keyPath: kp] ?? "" },
                set: { v in self.update(shiftID, debounce: true) { s in
                    if let i = s.unitIndex(unitID) { s.units[i][keyPath: kp] = v }
                } })
    }

    func callText(_ shiftID: UUID, _ callID: UUID, _ kp: WritableKeyPath<CallRecord, String>) -> Binding<String> {
        Binding(get: { self.shift(shiftID)?.calls.first { $0.id == callID }?[keyPath: kp] ?? "" },
                set: { v in self.update(shiftID, debounce: true) { s in
                    if let i = s.callIndex(callID) { s.calls[i][keyPath: kp] = v }
                } })
    }

    func pendingText(_ shiftID: UUID, _ id: UUID, _ kp: WritableKeyPath<PendingCall, String>) -> Binding<String> {
        Binding(get: { self.shift(shiftID)?.pending.first { $0.id == id }?[keyPath: kp] ?? "" },
                set: { v in self.update(shiftID, debounce: true) { s in
                    if let i = s.pendingIndex(id) { s.pending[i][keyPath: kp] = v }
                } })
    }

    func shiftText(_ shiftID: UUID, _ kp: WritableKeyPath<ShiftRecord, String>) -> Binding<String> {
        Binding(get: { self.shift(shiftID)?[keyPath: kp] ?? "" },
                set: { v in self.update(shiftID, debounce: true) { s in s[keyPath: kp] = v } })
    }

    func systemText(_ shiftID: UUID, _ kp: WritableKeyPath<SystemStatus, String>,
                    stamp: WritableKeyPath<SystemStatus, Date?>?) -> Binding<String> {
        Binding(get: { self.shift(shiftID)?.system[keyPath: kp] ?? "" },
                set: { v in
                    let t = self.now()
                    self.update(shiftID, debounce: true) { s in
                        s.system[keyPath: kp] = v
                        if let stamp { s.system[keyPath: stamp] = t }
                    }
                })
    }

    func stationText(_ shiftID: UUID, _ stationID: UUID, _ kp: WritableKeyPath<Station, String>) -> Binding<String> {
        Binding(get: { self.shift(shiftID)?.station(stationID)?[keyPath: kp] ?? "" },
                set: { v in self.update(shiftID, debounce: true) { s in
                    if let i = s.stations.firstIndex(where: { $0.id == stationID }) { s.stations[i][keyPath: kp] = v }
                } })
    }
}
