// ShiftRules.swift
// Sumter EMS Command — Shift Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

// MARK: - Shift rules (pure, testable)

struct CarryForward {
    var roster = true
    var crew = false
    var systemNotes = false
    var transferCallIDs: Set<UUID> = []
}

struct ShiftHeader {
    var date: Date
    var label: String
    var supervisor: String
    var sheet: String
}

enum AssignResult: Equatable {
    case assigned(UUID)
    case alreadyAssigned
    case requiresActiveRunResolution
    case requiresOverrideNote
    case cancelled
    case notFound

    var message: String {
        switch self {
        case .assigned: return "Assigned."
        case .alreadyAssigned: return "That unit is already assigned to this call. Nothing was duplicated."
        case .requiresActiveRunResolution: return "Close the unit's active run first. It stays in history."
        case .requiresOverrideNote: return "Enter a reason for this override."
        case .cancelled: return "This call is cancelled."
        case .notFound: return "The call or unit was not found."
        }
    }
}

extension ShiftRecord {
    static func defaultRoster() -> ([Station], [RosterUnit]) {
        let s1 = Station(id: UUID(), number: "1", name: "HQ", sortOrder: 0)
        let s2 = Station(id: UUID(), number: "2", name: "DALZELL", sortOrder: 1)
        let s4 = Station(id: UUID(), number: "4", name: "DABBS XRDS", sortOrder: 2)
        var units: [RosterUnit] = []
        for (i, n) in ["101", "102", "103", "104", "105", "106"].enumerated() {
            units.append(.fresh(stationID: s1.id, name: n, sortOrder: i))
        }
        for (i, n) in ["201", "202"].enumerated() {
            units.append(.fresh(stationID: s2.id, name: n, sortOrder: i))
        }
        units.append(.fresh(stationID: s4.id, name: "401", sortOrder: 0))
        return ([s1, s2, s4], units)
    }

    static func blank(now: Date, tzID: String, training: Bool) -> ShiftRecord {
        let tz = TimeZone(identifier: tzID) ?? .current
        let (stations, units) = defaultRoster()
        return ShiftRecord(id: UUID(), operationalDate: TimeFormat.noonOfDay(containing: now, tz: tz),
                           shiftLabel: "", supervisor: "", sheetRef: "", timeZoneID: tz.identifier,
                           createdAt: now, state: .active, archivedAt: nil, isTraining: training,
                           provenance: nil, sourceShiftID: nil, sourceExportedAt: nil, system: SystemStatus(),
                           stations: stations, units: units, calls: [], pending: [], events: [], inks: [])
    }

    /// Never carries statuses, call times, pending calls or clinical notes unless a run is explicitly transferred.
    static func newShift(previous: ShiftRecord?, carry: CarryForward, header: ShiftHeader, tzID: String,
                         training: Bool, initials: String, now: Date) -> ShiftRecord {
        var s = ShiftRecord.blank(now: now, tzID: tzID, training: training)
        s.operationalDate = header.date
        s.shiftLabel = header.label
        s.supervisor = header.supervisor
        s.sheetRef = header.sheet
        guard let prev = previous else { return s }
        let mark = InheritedMark(fromShiftID: prev.id, fromDate: prev.operationalDate, reviewed: false)
        if carry.roster {
            s.stations = prev.stations
            s.units = prev.units.filter { !$0.retired }.map { u in
                var n = RosterUnit.fresh(id: u.id, stationID: u.stationID, name: u.name, sortOrder: u.sortOrder)
                if carry.crew && !u.crew.trimmed.isEmpty {
                    n.crew = u.crew
                    n.crewInherited = mark
                }
                return n
            }
            for cid in carry.transferCallIDs.sorted(by: { $0.uuidString < $1.uuidString }) {
                guard var call = prev.calls.first(where: { $0.id == cid && $0.isOpen }),
                      let ui = s.unitIndex(call.unitID) else { continue }
                call.transferredFromShiftID = prev.id
                call.sharedCallID = nil   // the holding call stays with the earlier shift
                s.calls.append(call)
                s.units[ui].activeCallID = call.id
                s.events.append(contentsOf: prev.events.filter { $0.recordID == call.id })
                s.inks.append(contentsOf: prev.inks.filter { $0.recordID == call.id })
                s.log(batch: UUID(), record: call.id, kind: "call", action: "runTransferredIn", field: "run",
                      before: nil, after: call.runNumber, effective: now, now: now, initials: initials,
                      note: "From shift of \(TimeFormat.day(prev.operationalDate, tz: prev.timeZone)); original times kept")
            }
        }
        if carry.systemNotes && !prev.system.onDutyNotes.trimmed.isEmpty {
            s.system.onDutyNotes = prev.system.onDutyNotes
            s.system.onDutyNotesInherited = mark
        }
        return s
    }

    mutating func applyTrainingSeed(now: Date) {
        for i in units.indices where units[i].crew.trimmed.isEmpty {
            units[i].crew = "TRAINING Medic \(units[i].name) / TRAINING EMT (fictitious)"
        }
        if pending.isEmpty {
            pending.append(PendingCall(id: UUID(), timeIn: now, runNumber: "TRN-0001", priority: .p3,
                                       determinant: .alpha, nature: "TRAINING — fictitious lift assist",
                                       location: "100 Example Training Rd (fictitious)",
                                       statusNotes: "Demo record for practice only.", state: .pending,
                                       assignedCallIDs: [], createdAt: now))
        }
    }

    // Lookups

    func unitIndex(_ id: UUID) -> Int? { units.firstIndex { $0.id == id } }
    func callIndex(_ id: UUID) -> Int? { calls.firstIndex { $0.id == id } }
    func pendingIndex(_ id: UUID) -> Int? { pending.firstIndex { $0.id == id } }
    func unit(_ id: UUID) -> RosterUnit? { units.first { $0.id == id } }
    func station(_ id: UUID) -> Station? { stations.first { $0.id == id } }

    var orderedStations: [Station] { stations.sorted { $0.sortOrder < $1.sortOrder } }

    func stationUnits(_ stationID: UUID, includeRetired: Bool = false) -> [RosterUnit] {
        units.filter { $0.stationID == stationID && (includeRetired || !$0.retired) }
            .sorted { $0.sortOrder < $1.sortOrder }
    }

    var orderedUnits: [RosterUnit] { orderedStations.flatMap { stationUnits($0.id) } }

    func activeCall(for unitID: UUID) -> CallRecord? {
        guard let cid = unit(unitID)?.activeCallID else { return nil }
        return calls.first { $0.id == cid }
    }

    func runs(for unitID: UUID) -> [CallRecord] {
        calls.filter { $0.unitID == unitID }.sorted { $0.openedAt < $1.openedAt }
    }

    func ink(_ recordID: UUID, _ fieldID: String) -> InkAttachment? {
        inks.first { $0.recordID == recordID && $0.fieldID == fieldID }
    }

    // History

    mutating func log(batch: UUID, record: UUID, kind: String, action: String, field: String, before: String?,
                      after: String?, effective: Date, now: Date, initials: String, compensates: UUID? = nil,
                      note: String = "") {
        events.append(TimelineEvent(id: UUID(), batchID: batch, recordID: record, recordKind: kind, action: action,
                                    field: field, before: before, after: after, effectiveAt: effective,
                                    recordedAt: now, initials: initials, compensatesEventID: compensates,
                                    note: note))
    }

    // Status and times

    /// Changes status and, for ENR/SCN/TRN/HOS/CLR, stamps the matching empty time on the active run.
    /// Returns a batch ID for Undo, or nil when nothing changed (a repeated tap).
    @discardableResult
    mutating func setStatus(unitID: UUID, to new: UnitStatus, now: Date, initials: String) -> UUID? {
        guard let ui = unitIndex(unitID), units[ui].status != new else { return nil }
        let batch = UUID()
        let old = units[ui].status
        units[ui].status = new
        units[ui].statusChangedAt = now
        log(batch: batch, record: unitID, kind: "unit", action: "status", field: "status", before: old.rawValue,
            after: new.rawValue, effective: now, now: now, initials: initials)
        if let m = new.milestone, let cid = units[ui].activeCallID, let ci = callIndex(cid),
           calls[ci].isOpen, calls[ci].times[m.rawValue] == nil {
            calls[ci].times[m.rawValue] = now
            log(batch: batch, record: cid, kind: "call", action: "timeStamped", field: m.rawValue, before: nil,
                after: iso(now), effective: now, now: now, initials: initials)
        }
        return batch
    }

    func isUndone(_ batch: UUID) -> Bool {
        let ids = Set(events.filter { $0.batchID == batch }.map(\.id))
        return events.contains { e in e.compensatesEventID.map { ids.contains($0) } ?? false }
    }

    /// Undo adds compensating entries; it never erases history.
    @discardableResult
    mutating func undo(batch: UUID, now: Date, initials: String) -> Bool {
        let originals = events.filter { $0.batchID == batch }
        guard !originals.isEmpty, !isUndone(batch) else { return false }
        let undoBatch = UUID()
        for e in originals.reversed() {
            switch e.action {
            case "status":
                if let ui = unitIndex(e.recordID), let b = e.before.flatMap(UnitStatus.init(rawValue:)) {
                    let cur = units[ui].status
                    units[ui].status = b
                    units[ui].statusChangedAt = now
                    log(batch: undoBatch, record: e.recordID, kind: "unit", action: "status", field: "status",
                        before: cur.rawValue, after: b.rawValue, effective: now, now: now, initials: initials,
                        compensates: e.id, note: "Undo")
                }
            case "timeStamped":
                if let ci = callIndex(e.recordID), let cur = calls[ci].times[e.field], iso(cur) == e.after {
                    calls[ci].times[e.field] = nil
                    log(batch: undoBatch, record: e.recordID, kind: "call", action: "timeCleared", field: e.field,
                        before: iso(cur), after: nil, effective: now, now: now, initials: initials,
                        compensates: e.id, note: "Undo")
                } else {
                    log(batch: undoBatch, record: e.recordID, kind: "call", action: "note", field: e.field,
                        before: nil, after: nil, effective: now, now: now, initials: initials, compensates: e.id,
                        note: "Undo skipped: this time was changed after it was stamped")
                }
            default:
                break
            }
        }
        return true
    }

    /// Sets a time only if it is empty. Used by "Now" so a repeated tap cannot overwrite.
    @discardableResult
    mutating func stampIfEmpty(callID: UUID, milestone: Milestone, now: Date, initials: String) -> Bool {
        guard let ci = callIndex(callID), calls[ci].times[milestone.rawValue] == nil else { return false }
        calls[ci].times[milestone.rawValue] = now
        log(batch: UUID(), record: callID, kind: "call", action: "timeEntered", field: milestone.rawValue,
            before: nil, after: iso(now), effective: now, now: now, initials: initials, note: "Now")
        return true
    }

    /// Enter, correct or clear a time. The previous value stays in history.
    @discardableResult
    mutating func setTime(callID: UUID, milestone: Milestone, to value: Date?, now: Date, initials: String,
                          reason: String) -> Bool {
        guard let ci = callIndex(callID) else { return false }
        let old = calls[ci].times[milestone.rawValue]
        if old == value { return false }
        calls[ci].times[milestone.rawValue] = value
        let action = old == nil ? "timeEntered" : (value == nil ? "timeCleared" : "timeCorrected")
        log(batch: UUID(), record: callID, kind: "call", action: action, field: milestone.rawValue,
            before: old.map(iso), after: value.map(iso), effective: value ?? now, now: now, initials: initials,
            note: reason)
        return true
    }

    /// Warnings about out-of-order or future times. These are shown, never auto-fixed.
    func timeWarnings(_ call: CallRecord, now: Date) -> [String] {
        var out: [String] = []
        var latest: (Milestone, Date)? = nil
        for m in Milestone.allCases {
            guard let t = call.time(m) else { continue }
            if let prev = latest, t < prev.1 {
                out.append("\(m.label) (\(TimeFormat.clock(t, tz: timeZone, ref: operationalDate))) is earlier than \(prev.0.label) (\(TimeFormat.clock(prev.1, tz: timeZone, ref: operationalDate))).")
            }
            if t > now.addingTimeInterval(300) {
                out.append("\(m.label) is in the future.")
            }
            if let prev = latest, t <= prev.1 { continue }
            latest = (m, t)
        }
        return out
    }

    // Runs

    /// Starts a new run with blank times. The previous run is closed and kept.
    /// `replacing` must match the unit's current active run, so a double tap cannot create two runs.
    @discardableResult
    mutating func startNewRun(unitID: UUID, replacing expected: UUID?, now: Date, initials: String) -> UUID? {
        guard let ui = unitIndex(unitID), units[ui].activeCallID == expected else { return nil }
        let batch = UUID()
        if let old = units[ui].activeCallID, let ci = callIndex(old), calls[ci].isOpen {
            calls[ci].closedAt = now
            log(batch: batch, record: old, kind: "call", action: "runClosed", field: "run",
                before: calls[ci].runNumber, after: nil, effective: now, now: now, initials: initials)
        }
        let call = CallRecord.blank(unitID: unitID, now: now)
        calls.append(call)
        units[ui].activeCallID = call.id
        log(batch: batch, record: call.id, kind: "call", action: "runStarted", field: "run", before: nil,
            after: units[ui].name, effective: now, now: now, initials: initials)
        return call.id
    }

    @discardableResult
    mutating func closeRun(unitID: UUID, expected: UUID, now: Date, initials: String) -> Bool {
        guard let ui = unitIndex(unitID), units[ui].activeCallID == expected, let ci = callIndex(expected) else {
            return false
        }
        if calls[ci].isOpen { calls[ci].closedAt = now }
        units[ui].activeCallID = nil
        log(batch: UUID(), record: expected, kind: "call", action: "runClosed", field: "run",
            before: calls[ci].runNumber, after: nil, effective: now, now: now, initials: initials)
        return true
    }

    mutating func setPriority(callID: UUID, _ v: ResponsePriority, now: Date, initials: String) {
        guard let i = callIndex(callID), calls[i].priority != v else { return }
        let old = calls[i].priority
        calls[i].priority = v
        log(batch: UUID(), record: callID, kind: "call", action: "edit", field: "Response Priority",
            before: old.label, after: v.label, effective: now, now: now, initials: initials)
    }

    mutating func setDeterminant(callID: UUID, _ v: Determinant, now: Date, initials: String) {
        guard let i = callIndex(callID), calls[i].determinant != v else { return }
        let old = calls[i].determinant
        calls[i].determinant = v
        log(batch: UUID(), record: callID, kind: "call", action: "edit", field: "Determinant",
            before: old.label, after: v.label, effective: now, now: now, initials: initials)
    }

    mutating func setOnDuty(unitID: UUID, _ v: Bool, now: Date, initials: String) {
        guard let i = unitIndex(unitID), units[i].onDuty != v else { return }
        units[i].onDuty = v
        log(batch: UUID(), record: unitID, kind: "unit", action: "edit", field: "On Duty",
            before: v ? "No" : "Yes", after: v ? "Yes" : "No", effective: now, now: now, initials: initials)
    }

    // Holding / pending calls

    @discardableResult
    mutating func addPending(now: Date, initials: String) -> UUID {
        let p = PendingCall(id: UUID(), timeIn: nil, runNumber: "", priority: .notRecorded,
                            determinant: .notRecorded, nature: "", location: "", statusNotes: "",
                            state: .pending, assignedCallIDs: [], createdAt: now)
        pending.append(p)
        log(batch: UUID(), record: p.id, kind: "pending", action: "pendingCreated", field: "call", before: nil,
            after: nil, effective: now, now: now, initials: initials)
        return p.id
    }

    mutating func setPendingPriority(_ id: UUID, _ v: ResponsePriority, now: Date, initials: String) {
        guard let i = pendingIndex(id), pending[i].priority != v else { return }
        let old = pending[i].priority
        pending[i].priority = v
        log(batch: UUID(), record: id, kind: "pending", action: "edit", field: "Response Priority",
            before: old.label, after: v.label, effective: now, now: now, initials: initials)
    }

    mutating func setPendingDeterminant(_ id: UUID, _ v: Determinant, now: Date, initials: String) {
        guard let i = pendingIndex(id), pending[i].determinant != v else { return }
        let old = pending[i].determinant
        pending[i].determinant = v
        log(batch: UUID(), record: id, kind: "pending", action: "edit", field: "Determinant",
            before: old.label, after: v.label, effective: now, now: now, initials: initials)
    }

    @discardableResult
    mutating func setPendingTimeIn(_ id: UUID, to value: Date?, onlyIfEmpty: Bool, now: Date, initials: String,
                                   reason: String) -> Bool {
        guard let i = pendingIndex(id) else { return false }
        let old = pending[i].timeIn
        if onlyIfEmpty && old != nil { return false }
        if old == value { return false }
        pending[i].timeIn = value
        let action = old == nil ? "timeEntered" : (value == nil ? "timeCleared" : "timeCorrected")
        log(batch: UUID(), record: id, kind: "pending", action: action, field: "Time In", before: old.map(iso),
            after: value.map(iso), effective: value ?? now, now: now, initials: initials, note: reason)
        return true
    }

    @discardableResult
    mutating func cancelPending(_ id: UUID, reason: String, now: Date, initials: String) -> Bool {
        guard let i = pendingIndex(id), pending[i].state != .cancelled else { return false }
        let old = pending[i].state
        pending[i].state = .cancelled
        log(batch: UUID(), record: id, kind: "pending", action: "cancelled", field: "state", before: old.label,
            after: PendingState.cancelled.label, effective: now, now: now, initials: initials, note: reason)
        return true
    }

    func assignNeedsOverride(_ u: RosterUnit) -> Bool {
        !u.onDuty || u.status.isBusy || u.status == .oos
    }

    /// Creates a run linked to the holding call. Never silently reassigns or duplicates.
    mutating func assign(pendingID: UUID, unitID: UUID, overrideNote: String, closeExistingRun: Bool,
                         now: Date, initials: String) -> AssignResult {
        guard let pi = pendingIndex(pendingID), let ui = unitIndex(unitID) else { return .notFound }
        let p = pending[pi]
        if p.state == .cancelled { return .cancelled }
        if p.assignedCallIDs.contains(where: { cid in calls.first { $0.id == cid }?.unitID == unitID }) {
            return .alreadyAssigned
        }
        let existing = units[ui].activeCallID.flatMap { cid in calls.first { $0.id == cid } }
        if let existing, existing.isOpen, !closeExistingRun { return .requiresActiveRunResolution }
        if assignNeedsOverride(units[ui]) && overrideNote.trimmed.isEmpty { return .requiresOverrideNote }

        let batch = UUID()
        if let existing, let ci = callIndex(existing.id), calls[ci].isOpen {
            calls[ci].closedAt = now
            log(batch: batch, record: existing.id, kind: "call", action: "runClosed", field: "run",
                before: existing.runNumber, after: nil, effective: now, now: now, initials: initials,
                note: "Closed to take a holding call")
        }
        var call = CallRecord.blank(unitID: unitID, now: now)
        call.sharedCallID = p.id
        call.runNumber = p.runNumber
        call.priority = p.priority
        call.determinant = p.determinant
        call.nature = p.nature
        call.location = p.location
        calls.append(call)
        units[ui].activeCallID = call.id
        let oldState = pending[pi].state
        pending[pi].state = .assigned
        pending[pi].assignedCallIDs.append(call.id)
        log(batch: batch, record: p.id, kind: "pending", action: "assigned", field: "Assign Unit",
            before: oldState.label, after: units[ui].name, effective: now, now: now, initials: initials,
            note: overrideNote.trimmed.isEmpty ? "" : "Override: \(overrideNote.trimmed)")
        log(batch: batch, record: call.id, kind: "call", action: "runStarted", field: "run", before: nil,
            after: units[ui].name, effective: now, now: now, initials: initials, note: "From holding call")
        return .assigned(call.id)
    }

    // Roster configuration (IDs never change, so ink and history stay attached)

    mutating func addStation(number: String, name: String) {
        let order = (stations.map(\.sortOrder).max() ?? -1) + 1
        stations.append(Station(id: UUID(), number: number, name: name, sortOrder: order))
    }

    mutating func addUnit(stationID: UUID, name: String) {
        let order = (stationUnits(stationID, includeRetired: true).map(\.sortOrder).max() ?? -1) + 1
        units.append(.fresh(stationID: stationID, name: name, sortOrder: order))
    }

    mutating func moveUnit(_ id: UUID, by delta: Int) {
        guard let u = unit(id) else { return }
        var list = stationUnits(u.stationID, includeRetired: true).map(\.id)
        guard let i = list.firstIndex(of: id), list.indices.contains(i + delta) else { return }
        list.swapAt(i, i + delta)
        for (n, uid) in list.enumerated() {
            if let k = unitIndex(uid) { units[k].sortOrder = n }
        }
    }

    mutating func moveStation(_ id: UUID, by delta: Int) {
        var list = orderedStations.map(\.id)
        guard let i = list.firstIndex(of: id), list.indices.contains(i + delta) else { return }
        list.swapAt(i, i + delta)
        for (n, sid) in list.enumerated() {
            if let k = stations.firstIndex(where: { $0.id == sid }) { stations[k].sortOrder = n }
        }
    }

    // Readable history

    func recordLabel(_ id: UUID) -> String {
        if id == self.id { return "Shift" }
        if let u = unit(id) { return "Unit \(u.name)" }
        if let c = calls.first(where: { $0.id == id }) {
            return "Unit \(unit(c.unitID)?.name ?? "?") run \(c.runNumber.orDash)"
        }
        if let p = pending.first(where: { $0.id == id }) { return "Holding call \(p.runNumber.orDash)" }
        if let s = station(id) { return "Station \(s.number)" }
        return "Record"
    }

    func describe(_ e: TimelineEvent) -> String {
        let tz = timeZone
        let ref = operationalDate
        func t(_ s: String?) -> String {
            guard let s, let d = parseISO(s) else { return s ?? "—" }
            return TimeFormat.clock(d, tz: tz, ref: ref)
        }
        func st(_ s: String?) -> String { s.flatMap(UnitStatus.init(rawValue:))?.abbr ?? (s ?? "—") }
        let field = Milestone(rawValue: e.field)?.label ?? e.field
        let names: [String: String] = ["runStarted": "Run started", "runClosed": "Run closed", "assigned": "Assigned",
                     "pendingCreated": "Holding call added", "cancelled": "Call cancelled",
                     "archived": "Shift archived", "reopened": "Shift reopened",
                     "restored": "Restored copy created", "runTransferredIn": "Run transferred in",
                     "runTransferredOut": "Run transferred to a new shift", "reviewed": "Marked reviewed",
                     "note": "Note"]
        var text: String
        switch e.action {
        case "status": text = "Status \(st(e.before)) → \(st(e.after))"
        case "timeStamped": text = "\(field) stamped \(t(e.after))"
        case "timeEntered": text = "\(field) entered \(t(e.after))"
        case "timeCorrected": text = "\(field) corrected \(t(e.before)) → \(t(e.after))"
        case "timeCleared": text = "\(field) cleared (was \(t(e.before)))"
        case "edit": text = "\(field): \(e.before ?? "—") → \(e.after ?? "—")"
        default:
            text = names[e.action] ?? e.action
            if let a = e.after, !a.isEmpty { text += " (\(a))" }
        }
        if !e.note.isEmpty { text += " — \(e.note)" }
        if e.compensatesEventID != nil { text += " [compensating entry]" }
        return text
    }
}
