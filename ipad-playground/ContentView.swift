// Sumter EMS Command — Shift Board (Swift Playgrounds edition)
//
// Paste this whole file over ContentView.swift in a new Swift Playgrounds "App"
// project on iPad. The template's MyApp.swift already shows ContentView().
//
// Local-only working board. No network, no accounts, no cloud. Data is stored as
// a JSON file in this app's Documents/SumterCommand folder with iOS file protection.
// This is an operational board, not an ePCR or dispatch system.

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

// MARK: - Theme

enum Theme {
    static var navy: Color { Color(red: 22 / 255, green: 50 / 255, blue: 75 / 255) }
    static var brick: Color { Color(red: 181 / 255, green: 48 / 255, blue: 31 / 255) }
    static var slate: Color { Color(red: 44 / 255, green: 61 / 255, blue: 79 / 255) }
    static var rowFill: Color {
        Color(uiColor: UIColor { t in
            t.userInterfaceStyle == .dark
                ? UIColor(white: 0.15, alpha: 1)
                : UIColor(red: 246 / 255, green: 243 / 255, blue: 236 / 255, alpha: 1)
        })
    }
    static var uiNavy: UIColor { UIColor(red: 22 / 255, green: 50 / 255, blue: 75 / 255, alpha: 1) }
    static var uiBrick: UIColor { UIColor(red: 181 / 255, green: 48 / 255, blue: 31 / 255, alpha: 1) }
    static var uiRow: UIColor { UIColor(red: 246 / 255, green: 243 / 255, blue: 236 / 255, alpha: 1) }
}

extension Font {
    /// Condensed bold is for headings only.
    static func heading(_ style: Font.TextStyle) -> Font {
        .system(style, design: .default, weight: .bold).width(.condensed)
    }
}

extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
    var orDash: String { trimmed.isEmpty ? "—" : self }
    var orNotRecorded: String { trimmed.isEmpty ? "Not recorded" : self }
}

// MARK: - Time

func iso(_ d: Date) -> String {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f.string(from: d)
}

func parseISO(_ s: String) -> Date? {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = f.date(from: s) { return d }
    f.formatOptions = [.withInternetDateTime]
    return f.date(from: s)
}

enum TimeFormat {
    static func formatter(_ pattern: String, _ tz: TimeZone) -> DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = tz
        f.dateFormat = pattern
        return f
    }

    static func calendar(_ tz: TimeZone) -> Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = tz
        return c
    }

    /// 24-hour HH:mm; adds the date when it is not the shift's operational day.
    static func clock(_ d: Date?, tz: TimeZone, ref: Date?) -> String {
        guard let d else { return "—" }
        if let ref, calendar(tz).isDate(d, inSameDayAs: ref) {
            return formatter("HH:mm", tz).string(from: d)
        }
        return formatter("MM/dd HH:mm", tz).string(from: d)
    }

    static func full(_ d: Date?, tz: TimeZone) -> String {
        guard let d else { return "—" }
        return formatter("yyyy-MM-dd HH:mm zzz", tz).string(from: d)
    }

    static func day(_ d: Date, tz: TimeZone) -> String {
        formatter("EEE MM/dd/yyyy", tz).string(from: d)
    }

    static func fileDay(_ d: Date, tz: TimeZone) -> String {
        formatter("yyyy-MM-dd", tz).string(from: d)
    }

    static func deviceClock(_ d: Date) -> String {
        formatter("HH:mm:ss", .current).string(from: d)
    }

    /// The operational day is stored as noon in the shift's zone, so it never slips a day.
    static func noonOfDay(containing d: Date, tz: TimeZone) -> Date {
        let c = calendar(tz)
        var dc = c.dateComponents([.year, .month, .day], from: d)
        dc.hour = 12
        return c.date(from: dc) ?? d
    }

    /// A DatePicker works in the device calendar; convert its day to noon in the shift zone.
    static func noon(ofPicked picked: Date, in tz: TimeZone) -> Date {
        let comps = Calendar.current.dateComponents([.year, .month, .day], from: picked)
        var dc = DateComponents()
        dc.year = comps.year; dc.month = comps.month; dc.day = comps.day; dc.hour = 12
        return calendar(tz).date(from: dc) ?? picked
    }

    static func pickerDate(fromNoon d: Date, in tz: TimeZone) -> Date {
        let comps = calendar(tz).dateComponents([.year, .month, .day], from: d)
        var dc = DateComponents()
        dc.year = comps.year; dc.month = comps.month; dc.day = comps.day; dc.hour = 12
        return Calendar.current.date(from: dc) ?? d
    }

    static func elapsed(from: Date, to: Date) -> String {
        let minutes = Int(to.timeIntervalSince(from) / 60)
        if minutes < 0 { return "Time In is later than now" }
        if minutes >= 60 { return "\(minutes / 60) h \(minutes % 60) min" }
        return "\(minutes) min"
    }
}

// MARK: - Choices

enum UnitStatus: String, Codable, CaseIterable, Identifiable {
    case unknown, avl, enr, scn, trn, hos, clr, oos
    var id: String { rawValue }

    var abbr: String {
        switch self {
        case .unknown: return "UNK"
        case .avl: return "AVL"
        case .enr: return "ENR"
        case .scn: return "SCN"
        case .trn: return "TRN"
        case .hos: return "HOS"
        case .clr: return "CLR"
        case .oos: return "OOS"
        }
    }

    var fullName: String {
        switch self {
        case .unknown: return "Unknown / Not recorded"
        case .avl: return "In service / Available"
        case .enr: return "En route"
        case .scn: return "On scene"
        case .trn: return "Transporting"
        case .hos: return "At hospital"
        case .clr: return "Clearing"
        case .oos: return "Out of service"
        }
    }

    var milestone: Milestone? {
        switch self {
        case .enr: return .enRoute
        case .scn: return .onScene
        case .trn: return .transporting
        case .hos: return .atHospital
        case .clr: return .clear
        default: return nil
        }
    }

    var isBusy: Bool { [.enr, .scn, .trn, .hos].contains(self) }

    var color: Color {
        switch self {
        case .unknown: return Color(white: 0.38)
        case .avl: return Color(red: 0.0, green: 0.43, blue: 0.2)
        case .enr: return Color(red: 0.1, green: 0.3, blue: 0.72)
        case .scn: return Color(red: 0.42, green: 0.2, blue: 0.6)
        case .trn: return Color(red: 0.62, green: 0.33, blue: 0.0)
        case .hos: return Color(red: 0.0, green: 0.4, blue: 0.46)
        case .clr: return Color(red: 0.27, green: 0.35, blue: 0.45)
        case .oos: return Theme.brick
        }
    }
}

enum Milestone: String, Codable, CaseIterable, Identifiable {
    case dispatched, enRoute, onScene, transporting, atHospital, clear
    var id: String { rawValue }

    var label: String {
        switch self {
        case .dispatched: return "Dispatched"
        case .enRoute: return "En Route"
        case .onScene: return "On Scene"
        case .transporting: return "Transporting"
        case .atHospital: return "At Hospital"
        case .clear: return "Clear"
        }
    }

    var short: String {
        switch self {
        case .dispatched: return "Disp"
        case .enRoute: return "EnR"
        case .onScene: return "OnS"
        case .transporting: return "Trn"
        case .atHospital: return "Hos"
        case .clear: return "Clr"
        }
    }
}

enum ResponsePriority: String, Codable, CaseIterable, Identifiable {
    case notRecorded, p1, p2, p3
    var id: String { rawValue }
    var label: String {
        switch self {
        case .notRecorded: return "Not recorded"
        case .p1: return "P1"
        case .p2: return "P2"
        case .p3: return "P3"
        }
    }
    var short: String { self == .notRecorded ? "—" : label }
}

enum Determinant: String, Codable, CaseIterable, Identifiable {
    case notRecorded, omega, alpha, bravo, charlie, delta, echo
    var id: String { rawValue }
    var label: String {
        switch self {
        case .notRecorded: return "Not recorded"
        case .omega: return "O Omega"
        case .alpha: return "A Alpha"
        case .bravo: return "B Bravo"
        case .charlie: return "C Charlie"
        case .delta: return "D Delta"
        case .echo: return "E Echo"
        }
    }
    var short: String { self == .notRecorded ? "—" : label }
}

enum PendingState: String, Codable, CaseIterable {
    case pending, assigned, cancelled
    var label: String {
        switch self {
        case .pending: return "Pending"
        case .assigned: return "Assigned"
        case .cancelled: return "Cancelled"
        }
    }
}

enum ShiftState: String, Codable { case active, archived }

// MARK: - Records

struct InheritedMark: Codable, Hashable {
    var fromShiftID: UUID
    var fromDate: Date
    var reviewed: Bool
}

struct Station: Codable, Identifiable, Hashable {
    var id: UUID
    var number: String
    var name: String
    var sortOrder: Int
}

struct RosterUnit: Codable, Identifiable, Hashable {
    var id: UUID
    var stationID: UUID
    var name: String
    var sortOrder: Int
    var retired: Bool
    var onDuty: Bool
    var status: UnitStatus
    var statusChangedAt: Date?
    var crew: String
    var crewInherited: InheritedMark?
    var notes: String
    var activeCallID: UUID?

    static func fresh(id: UUID = UUID(), stationID: UUID, name: String, sortOrder: Int) -> RosterUnit {
        RosterUnit(id: id, stationID: stationID, name: name, sortOrder: sortOrder, retired: false,
                   onDuty: false, status: .unknown, statusChangedAt: nil, crew: "", crewInherited: nil,
                   notes: "", activeCallID: nil)
    }
}

/// One run for one unit. A new run never overwrites an earlier one.
struct CallRecord: Codable, Identifiable, Hashable {
    var id: UUID
    var unitID: UUID
    var sharedCallID: UUID?          // the holding call this run came from, shared by every unit assigned to it
    var runNumber: String
    var priority: ResponsePriority
    var determinant: Determinant
    var nature: String
    var location: String
    var destination: String
    var times: [String: Date]        // keyed by Milestone.rawValue; full Date values, never HH:mm strings
    var notes: String
    var openedAt: Date
    var closedAt: Date?
    var transferredFromShiftID: UUID?

    var isOpen: Bool { closedAt == nil }
    func time(_ m: Milestone) -> Date? { times[m.rawValue] }

    static func blank(unitID: UUID, now: Date) -> CallRecord {
        CallRecord(id: UUID(), unitID: unitID, sharedCallID: nil, runNumber: "", priority: .notRecorded,
                   determinant: .notRecorded, nature: "", location: "", destination: "", times: [:],
                   notes: "", openedAt: now, closedAt: nil, transferredFromShiftID: nil)
    }
}

struct PendingCall: Codable, Identifiable, Hashable {
    var id: UUID
    var timeIn: Date?
    var runNumber: String
    var priority: ResponsePriority
    var determinant: Determinant
    var nature: String
    var location: String
    var statusNotes: String
    var state: PendingState
    var assignedCallIDs: [UUID]
    var createdAt: Date
}

struct TimelineEvent: Codable, Identifiable, Hashable {
    var id: UUID
    var batchID: UUID
    var recordID: UUID
    var recordKind: String
    var action: String
    var field: String
    var before: String?
    var after: String?
    var effectiveAt: Date
    var recordedAt: Date
    var initials: String
    var compensatesEventID: UUID?
    var note: String
}

/// Handwriting is an attachment keyed by record ID + field ID, never by row position.
struct InkAttachment: Codable, Identifiable, Hashable {
    var id: UUID
    var recordID: UUID
    var fieldID: String
    var drawing: Data
    var pageCount: Int
    var canvasWidth: Double
    var pageHeight: Double
    var updatedAt: Date
}

struct SystemStatus: Codable, Hashable {
    var statusLevel: String = ""
    var statusLevelUpdatedAt: Date? = nil
    var weather: String = ""
    var weatherUpdatedAt: Date? = nil
    var hospitalDivert: String = ""
    var hospitalDivertUpdatedAt: Date? = nil
    var onDutyNotes: String = ""
    var onDutyNotesInherited: InheritedMark? = nil
}

struct ShiftRecord: Codable, Identifiable, Hashable {
    var id: UUID
    var operationalDate: Date
    var shiftLabel: String
    var supervisor: String
    var sheetRef: String
    var timeZoneID: String
    var createdAt: Date
    var state: ShiftState
    var archivedAt: Date?
    var isTraining: Bool
    var provenance: String?
    var sourceShiftID: UUID?
    var sourceExportedAt: Date?
    var system: SystemStatus
    var stations: [Station]
    var units: [RosterUnit]
    var calls: [CallRecord]
    var pending: [PendingCall]
    var events: [TimelineEvent]
    var inks: [InkAttachment]

    var timeZone: TimeZone { TimeZone(identifier: timeZoneID) ?? TimeZone(identifier: "America/New_York") ?? .current }
    var isReadOnly: Bool { state == .archived }
    var title: String {
        let label = shiftLabel.trimmed.isEmpty ? "" : " · Shift \(shiftLabel)"
        return TimeFormat.day(operationalDate, tz: timeZone) + label
    }
}

struct AppSettings: Codable {
    var defaultTimeZoneID = "America/New_York"
    var keepAwake = false
    var initials = ""
}

struct AppData: Codable {
    static let currentSchema = 1
    var schemaVersion = AppData.currentSchema
    var shifts: [ShiftRecord] = []
    var settings = AppSettings()
}

// MARK: - Counting

struct BoardCounts: Equatable {
    var onDuty = 0
    var inService = 0
    var available = 0
    var unknown = 0
    var oos = 0
    var offDuty = 0

    static let definition = """
    Trucks in Service = on-duty units whose recorded status is anything other than OOS or Unknown. \
    Busy units (ENR, SCN, TRN, HOS, CLR) still count as in service. \
    Available Now = on-duty units recorded AVL. CLR does not count as available. \
    Unknown = on-duty units with no recorded status. \
    Units not marked on duty, and units removed from the board, are not counted.
    """

    static func of(_ units: [RosterUnit]) -> BoardCounts {
        var c = BoardCounts()
        for u in units where !u.retired {
            guard u.onDuty else { c.offDuty += 1; continue }
            c.onDuty += 1
            switch u.status {
            case .unknown: c.unknown += 1
            case .oos: c.oos += 1
            case .avl: c.available += 1; c.inService += 1
            default: c.inService += 1
            }
        }
        return c
    }
}

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

// MARK: - Backup (versioned, editable JSON; not the live store)

struct ShiftBackup: Codable {
    var format: String
    var formatVersion: Int
    var exportedAt: Date
    var appSchemaVersion: Int
    var shift: ShiftRecord
}

enum BackupError: Error { case wrongFormat, newerVersion }

enum Backup {
    static let format = "SumterCommand.ShiftBackup"
    static let version = 1

    static func encoder() -> JSONEncoder {
        let e = JSONEncoder()
        e.outputFormatting = [.prettyPrinted, .sortedKeys]
        e.dateEncodingStrategy = .custom { date, enc in
            var c = enc.singleValueContainer()
            try c.encode(iso(date))
        }
        return e   // PencilKit drawings are base64 Data inside the JSON
    }

    static func decoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { dec in
            let c = try dec.singleValueContainer()
            let s = try c.decode(String.self)
            guard let date = parseISO(s) else {
                throw DecodingError.dataCorruptedError(in: c, debugDescription: "Unreadable date")
            }
            return date
        }
        return d
    }

    static func encode(_ s: ShiftRecord, exportedAt: Date) throws -> Data {
        try encoder().encode(ShiftBackup(format: format, formatVersion: version, exportedAt: exportedAt,
                                         appSchemaVersion: AppData.currentSchema, shift: s))
    }

    static func decode(_ data: Data) throws -> ShiftBackup {
        let b = try decoder().decode(ShiftBackup.self, from: data)
        guard b.format == format else { throw BackupError.wrongFormat }
        guard b.formatVersion <= version else { throw BackupError.newerVersion }
        return b
    }

    static func validate(_ s: ShiftRecord) -> [String] {
        var p: [String] = []
        if TimeZone(identifier: s.timeZoneID) == nil { p.append("Unknown time zone identifier.") }
        let stationIDs = Set(s.stations.map(\.id))
        let unitIDs = Set(s.units.map(\.id))
        let callIDs = Set(s.calls.map(\.id))
        let pendingIDs = Set(s.pending.map(\.id))
        var all: [UUID] = [s.id]
        all.append(contentsOf: s.stations.map(\.id))
        all.append(contentsOf: s.units.map(\.id))
        all.append(contentsOf: s.calls.map(\.id))
        all.append(contentsOf: s.pending.map(\.id))
        all.append(contentsOf: s.events.map(\.id))
        all.append(contentsOf: s.inks.map(\.id))
        if Set(all).count != all.count { p.append("Duplicate record identifiers.") }
        for u in s.units where !stationIDs.contains(u.stationID) { p.append("Unit \(u.name) refers to a missing station.") }
        for u in s.units {
            if let a = u.activeCallID, !callIDs.contains(a) { p.append("Unit \(u.name) refers to a missing run.") }
        }
        for c in s.calls where !unitIDs.contains(c.unitID) { p.append("A run refers to a missing unit.") }
        for c in s.calls {
            if let sc = c.sharedCallID, !pendingIDs.contains(sc) { p.append("A run refers to a missing holding call.") }
        }
        for pc in s.pending {
            for a in pc.assignedCallIDs where !callIDs.contains(a) { p.append("A holding call refers to a missing run.") }
        }
        let known = Set([s.id]).union(stationIDs).union(unitIDs).union(callIDs).union(pendingIDs)
        for e in s.events where !known.contains(e.recordID) { p.append("A history entry refers to a missing record.") }
        for i in s.inks {
            if !known.contains(i.recordID) { p.append("Handwriting refers to a missing record.") }
            if i.pageCount < 1 || i.pageCount > 500 || i.canvasWidth <= 0 || i.pageHeight <= 0 {
                p.append("Handwriting has invalid page dimensions.")
            }
            do { _ = try PKDrawing(data: i.drawing) } catch { p.append("A handwriting attachment could not be read.") }
        }
        return Array(Set(p)).sorted()
    }

    /// Every internal ID is replaced, so a restored copy can never collide with or overwrite live records.
    static func remapIDs(_ src: ShiftRecord) -> ShiftRecord {
        var idMap: [UUID: UUID] = [:]
        func m(_ id: UUID) -> UUID {
            if let n = idMap[id] { return n }
            let n = UUID()
            idMap[id] = n
            return n
        }
        var s = src
        s.id = m(src.id)
        s.stations = src.stations.map { st in var x = st; x.id = m(st.id); return x }
        s.units = src.units.map { u in
            var x = u
            x.id = m(u.id); x.stationID = m(u.stationID)
            x.activeCallID = u.activeCallID.map { m($0) }
            return x
        }
        s.calls = src.calls.map { c in
            var x = c
            x.id = m(c.id); x.unitID = m(c.unitID)
            x.sharedCallID = c.sharedCallID.map { m($0) }
            return x
        }
        s.pending = src.pending.map { pc in
            var x = pc
            x.id = m(pc.id)
            x.assignedCallIDs = pc.assignedCallIDs.map { m($0) }
            return x
        }
        s.events = src.events.map { e in
            var x = e
            x.id = m(e.id); x.batchID = m(e.batchID); x.recordID = m(e.recordID)
            x.compensatesEventID = e.compensatesEventID.map { m($0) }
            return x
        }
        s.inks = src.inks.map { i in var x = i; x.id = m(i.id); x.recordID = m(i.recordID); return x }
        return s
    }

    static func restoredCopy(_ b: ShiftBackup, now: Date, initials: String) -> ShiftRecord {
        var s = remapIDs(b.shift)
        s.sourceShiftID = b.shift.id
        s.sourceExportedAt = b.exportedAt
        s.provenance = "Restored copy of \(b.shift.title) from a backup exported \(TimeFormat.full(b.exportedAt, tz: b.shift.timeZone))"
        s.state = .archived
        s.archivedAt = now
        s.log(batch: UUID(), record: s.id, kind: "shift", action: "restored", field: "shift", before: nil,
              after: nil, effective: now, now: now, initials: initials, note: "Read-only until reopened")
        return s
    }
}

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

// MARK: - Root

struct IDBox: Identifiable, Hashable { let id: UUID }

struct ContentView: View {
    @StateObject private var store = Store()
    @Environment(\.scenePhase) private var scenePhase
    @State private var path: [UUID] = []

    var body: some View {
        ZStack {
            NavigationStack(path: $path) {
                if let problem = store.loadProblem {
                    RecoveryView(problem: problem)
                } else {
                    HomeView(path: $path)
                }
            }
            if scenePhase != .active {
                PrivacyCover()   // hides board content in the app switcher
            }
        }
        .environmentObject(store)
        .onChange(of: scenePhase) { phase in
            if phase == .active {
                store.applyIdleTimer()
            } else {
                store.flush()
                UIApplication.shared.isIdleTimerDisabled = false
            }
        }
    }
}

struct PrivacyCover: View {
    var body: some View {
        ZStack {
            Theme.navy.ignoresSafeArea()
            VStack(spacing: 8) {
                Text("SUMTER EMS COMMAND").font(.heading(.largeTitle)).foregroundStyle(.white)
                Text("Board hidden while the app is not active").foregroundStyle(.white.opacity(0.85))
            }
        }
    }
}

struct RecoveryView: View {
    @EnvironmentObject var store: Store
    let problem: String
    @State private var confirmSetAside = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Saved Board Could Not Be Opened").font(.heading(.largeTitle))
                Text(problem).font(.body)
                Text("Nothing has been deleted or replaced, and saving is paused so the file cannot be overwritten. You can try again (for example after freeing storage). Or move the unreadable file aside and start with an empty board; the moved file stays in this app's Documents/SumterCommand folder.")
                Button { store.load() } label: {
                    Text("Try Loading Again").frame(maxWidth: .infinity, minHeight: 56)
                }
                .buttonStyle(.borderedProminent).tint(Theme.navy)
                Button(role: .destructive) { confirmSetAside = true } label: {
                    Text("Move Unreadable File Aside…").frame(maxWidth: .infinity, minHeight: 56)
                }
                .buttonStyle(.bordered)
            }
            .padding(24)
            .frame(maxWidth: 760)
        }
        .confirmationDialog("Move the unreadable file aside and start an empty board?",
                            isPresented: $confirmSetAside, titleVisibility: .visible) {
            Button("Move Aside and Start Empty", role: .destructive) { store.setAsideUnreadableFile() }
        }
    }
}

// MARK: - Shared UI

struct SectionBox<Content: View>: View {
    let title: String
    var accent: Color = Theme.navy
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title.uppercased())
                .font(.heading(.headline))
                .foregroundStyle(.white)
                .padding(.horizontal, 12).padding(.vertical, 8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(accent)
                .accessibilityAddTraits(.isHeader)
            VStack(alignment: .leading, spacing: 12) { content }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Color(uiColor: .systemBackground))
        .overlay(Rectangle().stroke(Theme.navy.opacity(0.35), lineWidth: 1))
    }
}

struct StatusBadge: View {
    let status: UnitStatus
    var body: some View {
        Text(status.abbr)
            .font(.heading(.title3))
            .foregroundStyle(.white)
            .padding(.horizontal, 10).padding(.vertical, 4)
            .frame(minWidth: 64)
            .background(status.color)
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .accessibilityLabel("Status \(status.fullName)")
    }
}

struct TagText: View {
    let text: String
    var color: Color = Theme.brick
    var body: some View {
        Text(text).font(.caption.bold()).foregroundStyle(.white)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(color).clipShape(Capsule())
    }
}

struct BigButtonLabel: View {
    let title: String
    let systemImage: String
    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.headline)
            .frame(maxWidth: .infinity, minHeight: 56)
    }
}

struct SaveStatusView: View {
    @EnvironmentObject var store: Store
    var body: some View {
        switch store.saveState {
        case .idle:
            Label("No unsaved changes", systemImage: "checkmark.circle").foregroundStyle(.secondary)
        case .pending, .saving:
            Label("Saving…", systemImage: "clock")
        case .saved(let d):
            Label("Saved \(TimeFormat.deviceClock(d))", systemImage: "checkmark.circle.fill").foregroundStyle(.secondary)
        case .failed(let msg):
            HStack(spacing: 10) {
                Label("Save Failed", systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(Theme.brick).font(.headline)
                    .accessibilityHint(msg)
                Button("Retry") { store.saveNow() }.buttonStyle(.borderedProminent).tint(Theme.brick)
            }
        }
    }
}

struct SaveFailureBanner: View {
    @EnvironmentObject var store: Store
    var body: some View {
        if case .failed(let msg) = store.saveState {
            VStack(alignment: .leading, spacing: 6) {
                Text("SAVE FAILED — your changes are still on screen but are not yet stored.").font(.headline)
                Text(msg).font(.footnote)
                Button("Retry Save") { store.saveNow() }.buttonStyle(.borderedProminent).tint(.white)
                    .foregroundStyle(Theme.brick)
            }
            .foregroundStyle(.white)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.brick)
        }
    }
}

struct OptionGrid<Option: Hashable & Identifiable>: View {
    let options: [Option]
    let selected: Option
    let title: (Option) -> String
    var minWidth: CGFloat = 110
    var disabled = false
    let onPick: (Option) -> Void

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: minWidth), spacing: 10)], spacing: 10) {
            ForEach(options) { o in
                let isOn = o == selected
                Button { onPick(o) } label: {
                    Text(title(o))
                        .font(.headline)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 6)
                        .frame(maxWidth: .infinity, minHeight: 52)
                        .foregroundStyle(isOn ? Color.white : Color.primary)
                        .background(isOn ? Theme.navy : Theme.rowFill)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8)
                            .stroke(isOn ? Theme.navy : Color.secondary.opacity(0.4), lineWidth: isOn ? 3 : 1))
                }
                .buttonStyle(.plain)
                .disabled(disabled)
                .accessibilityLabel(title(o))
                .accessibilityAddTraits(isOn ? .isSelected : [])
            }
        }
    }
}

struct LabeledTextField: View {
    @EnvironmentObject var store: Store
    let label: String
    @Binding var text: String
    var readOnly = false
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.headline)
            TextField(label, text: $text)
                .font(.title3)
                .padding(.horizontal, 12)
                .frame(minHeight: 56)
                .background(Theme.rowFill)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.secondary.opacity(0.5)))
                .focused($focused)
                .disabled(readOnly)
                .submitLabel(.done)
        }
        .onChange(of: focused) { f in if !f { store.flush() } }
    }
}

struct InkTarget: Identifiable, Hashable {
    var shiftID: UUID
    var recordID: UUID
    var fieldID: String
    var title: String
    var id: String { "\(recordID.uuidString)|\(fieldID)" }
}

/// Typed editor (Scribble works here) with an optional Handwriting attachment beside it.
struct LongTextEditor: View {
    @EnvironmentObject var store: Store
    let label: String
    @Binding var text: String
    var minHeight: CGFloat = 120
    var readOnly = false
    var ink: InkTarget? = nil
    @FocusState private var focused: Bool
    @State private var expanded = false
    @State private var showInk: InkTarget?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Text(label).font(.heading(.title3))
                Spacer()
                Button { expanded = true } label: {
                    Label("Expand", systemImage: "arrow.up.left.and.arrow.down.right").frame(minHeight: 40)
                }
                .buttonStyle(.bordered)
                .accessibilityLabel("Expand \(label) editor")
                if let ink {
                    Button { store.flush(); showInk = ink } label: {
                        Label("Handwriting", systemImage: "pencil.tip").frame(minHeight: 40)
                    }
                    .buttonStyle(.bordered)
                    .accessibilityLabel("Open handwriting for \(label)")
                }
            }
            TextEditor(text: $text)
                .font(.body)
                .frame(minHeight: minHeight)
                .padding(6)
                .scrollContentBackground(.hidden)
                .background(Theme.rowFill)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.secondary.opacity(0.5)))
                .focused($focused)
                .disabled(readOnly)
                .accessibilityLabel(label)
            if let ink, let att = store.ink(ink) {
                Text("Handwriting attached: \(att.pageCount) page\(att.pageCount == 1 ? "" : "s"), kept separate from the typed text.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .onChange(of: focused) { f in if !f { store.flush() } }
        .fullScreenCover(isPresented: $expanded) {
            ExpandedTextEditor(label: label, text: $text, readOnly: readOnly).environmentObject(store)
        }
        .fullScreenCover(item: $showInk) { t in
            HandwritingEditor(target: t, readOnly: readOnly).environmentObject(store)
        }
    }
}

struct ExpandedTextEditor: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    let label: String
    @Binding var text: String
    let readOnly: Bool

    var body: some View {
        NavigationStack {
            TextEditor(text: $text)
                .font(.title3)
                .padding()
                .disabled(readOnly)
                .accessibilityLabel(label)
                .navigationTitle(label)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { store.flush(); dismiss() }.accessibilityLabel("Done editing \(label)")
                    }
                    ToolbarItem(placement: .status) { SaveStatusView() }
                }
        }
    }
}

struct TimeEditSheet: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    let original: Date?
    let tz: TimeZone
    let onSave: (Date?, String) -> Void
    @State private var value: Date
    @State private var reason = ""

    init(title: String, original: Date?, tz: TimeZone, onSave: @escaping (Date?, String) -> Void) {
        self.title = title
        self.original = original
        self.tz = tz
        self.onSave = onSave
        _value = State(initialValue: original ?? Date())
    }

    var needsReason: Bool { original != nil }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Current: \(TimeFormat.full(original, tz: tz))")
                    Text("Earlier values are kept in history. Out-of-order or retrospective times are allowed and will be flagged, not changed.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Section("New date and time (\(tz.identifier), 24-hour)") {
                    DatePicker("Time", selection: $value, displayedComponents: [.date, .hourAndMinute])
                        .datePickerStyle(.graphical)
                        .environment(\.timeZone, tz)
                        .environment(\.locale, Locale(identifier: "en_GB"))
                    Text("Selected: \(TimeFormat.full(value, tz: tz))").font(.headline)
                    if value > Date().addingTimeInterval(300) {
                        Text("This time is in the future.").foregroundStyle(Theme.brick)
                    }
                }
                Section(needsReason ? "Reason for correction (required)" : "Note (optional)") {
                    TextField("Reason", text: $reason).frame(minHeight: 44)
                }
                if needsReason {
                    Section {
                        Button("Clear This Time", role: .destructive) {
                            onSave(nil, reason.trimmed)
                            dismiss()
                        }
                        .disabled(reason.trimmed.isEmpty)
                    }
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave(value, reason.trimmed.isEmpty ? (needsReason ? "" : "Entered") : reason.trimmed)
                        dismiss()
                    }
                    .disabled(needsReason && reason.trimmed.isEmpty)
                }
            }
        }
    }
}

struct TimeRow: View {
    let label: String
    let value: Date?
    let tz: TimeZone
    let ref: Date
    let readOnly: Bool
    let onNow: () -> Void
    let onSet: (Date?, String) -> Void
    @State private var editing = false

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.headline)
                Text(value == nil ? "Not recorded" : TimeFormat.clock(value, tz: tz, ref: ref))
                    .font(.title3.monospacedDigit())
                    .foregroundStyle(value == nil ? .secondary : .primary)
            }
            Spacer()
            if !readOnly {
                if value == nil {
                    Button("Now", action: onNow)
                        .buttonStyle(.borderedProminent).tint(Theme.navy)
                        .frame(minWidth: 72, minHeight: 48)
                        .accessibilityLabel("Set \(label) to now")
                }
                Button(value == nil ? "Enter…" : "Correct…") { editing = true }
                    .buttonStyle(.bordered)
                    .frame(minHeight: 48)
                    .accessibilityLabel(value == nil ? "Enter \(label) time" : "Correct \(label) time")
            }
        }
        .frame(minHeight: 56)
        .sheet(isPresented: $editing) {
            TimeEditSheet(title: label, original: value, tz: tz, onSave: onSet)
        }
    }
}

// MARK: - Home

struct HomeView: View {
    @EnvironmentObject var store: Store
    @Binding var path: [UUID]
    @State private var newShiftKind: NewShiftKind?
    @State private var showSettings = false
    @State private var showImporter = false
    @State private var importMessage: String?
    @State private var duplicateData: Data?
    @State private var archiveTarget: ShiftRecord?

    enum NewShiftKind: String, Identifiable { case operational, training; var id: String { rawValue } }

    var active: [ShiftRecord] {
        store.data.shifts.filter { $0.state == .active }.sorted { $0.createdAt > $1.createdAt }
    }
    var archived: [ShiftRecord] {
        store.data.shifts.filter { $0.state == .archived }
            .sorted { ($0.archivedAt ?? $0.createdAt) > ($1.archivedAt ?? $1.createdAt) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                BrandHeader(subtitle: "Shift Command Board")
                SaveFailureBanner()
                if !active.isEmpty {
                    SectionBox(title: "Resume Active Shift") {
                        ForEach(active) { s in activeRow(s, primary: s.id == active.first?.id) }
                    }
                }
                SectionBox(title: "Start") {
                    Button { newShiftKind = .operational } label: { BigButtonLabel(title: "New Shift", systemImage: "plus.rectangle") }
                        .buttonStyle(.borderedProminent).tint(active.isEmpty ? Theme.navy : Theme.slate)
                    Button { newShiftKind = .training } label: { BigButtonLabel(title: "New Training Shift (fictitious demo data)", systemImage: "graduationcap") }
                        .buttonStyle(.bordered)
                    Text("Starting a new shift never deletes or changes earlier shifts.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                SectionBox(title: "Archive") {
                    if archived.isEmpty {
                        Text("No archived shifts.").foregroundStyle(.secondary)
                    }
                    ForEach(archived) { s in
                        Button { path.append(s.id) } label: {
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(s.title).font(.headline)
                                    if let p = s.provenance { Text(p).font(.footnote).foregroundStyle(.secondary) }
                                }
                                Spacer()
                                if s.isTraining { TagText(text: "TRAINING", color: Theme.slate) }
                                Text("Open (read-only)").foregroundStyle(Theme.navy)
                            }
                            .frame(minHeight: 56)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                SectionBox(title: "Backups and Settings") {
                    Button { showImporter = true } label: { BigButtonLabel(title: "Import Backup as a Separate Copy…", systemImage: "square.and.arrow.down") }
                        .buttonStyle(.bordered)
                    Button { showSettings = true } label: { BigButtonLabel(title: "Settings and Built-in Checks", systemImage: "gearshape") }
                        .buttonStyle(.bordered)
                }
                SaveStatusView()
            }
            .padding()
            .frame(maxWidth: 900)
            .frame(maxWidth: .infinity)
        }
        .navigationTitle("Home")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: UUID.self) { id in BoardView(shiftID: id) }
        .sheet(item: $newShiftKind) { kind in
            NewShiftSheet(training: kind == .training, path: $path).environmentObject(store)
        }
        .sheet(isPresented: $showSettings) { SettingsView().environmentObject(store) }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [.json]) { result in
            handleImport(result)
        }
        .alert("Import", isPresented: Binding(get: { importMessage != nil }, set: { if !$0 { importMessage = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(importMessage ?? "") }
        .confirmationDialog("This backup has already been imported. Import another separate copy?",
                            isPresented: Binding(get: { duplicateData != nil }, set: { if !$0 { duplicateData = nil } }),
                            titleVisibility: .visible) {
            Button("Import Another Copy") {
                if let d = duplicateData { report(store.importBackup(d, allowDuplicate: true)) }
                duplicateData = nil
            }
        }
        .confirmationDialog("Archive this shift? It becomes read-only and stays in Archive. Nothing is deleted.",
                            isPresented: Binding(get: { archiveTarget != nil }, set: { if !$0 { archiveTarget = nil } }),
                            titleVisibility: .visible) {
            Button("Archive Shift") {
                if let s = archiveTarget { store.archive(s.id) }
                archiveTarget = nil
            }
        }
    }

    func activeRow(_ s: ShiftRecord, primary: Bool) -> some View {
        HStack(spacing: 12) {
            Button { path.append(s.id) } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Resume: \(s.title)").font(.title3.bold())
                    Text("Supervisor \(s.supervisor.orNotRecorded) · \(s.timeZoneID)").font(.subheadline)
                }
                .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
                .padding(.horizontal, 8)
            }
            .buttonStyle(.borderedProminent)
            .tint(primary ? Theme.navy : Theme.slate)
            if s.isTraining { TagText(text: "TRAINING", color: Theme.slate) }
            Button("Archive…") { archiveTarget = s }
                .buttonStyle(.bordered)
                .frame(minHeight: 48)
                .accessibilityLabel("Archive shift \(s.title)")
        }
    }

    func handleImport(_ result: Result<URL, Error>) {
        switch result {
        case .failure(let e):
            importMessage = "The file could not be opened: \(e.localizedDescription)"
        case .success(let url):
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            do {
                let d = try Data(contentsOf: url)
                let outcome = store.importBackup(d, allowDuplicate: false)
                if case .duplicate = outcome { duplicateData = d } else { report(outcome) }
            } catch {
                importMessage = "The file could not be read: \(error.localizedDescription)"
            }
        }
    }

    func report(_ outcome: Store.ImportOutcome) {
        switch outcome {
        case .imported: importMessage = "Imported as a separate, read-only restored copy. Find it under Archive; use Reopen to edit it."
        case .duplicate: importMessage = "Already imported."
        case .invalid(let msg): importMessage = msg
        }
    }
}

struct BrandHeader: View {
    let subtitle: String
    var body: some View {
        HStack(spacing: 14) {
            // Add the original shield as an image named "SumterShield" (Playgrounds: + > Insert From… > Photo/File)
            // and it appears here unaltered. Without it the layout simply omits it.
            if let shield = UIImage(named: "SumterShield") {
                Image(uiImage: shield).resizable().scaledToFit().frame(height: 72)
                    .accessibilityLabel("Sumter County EMS shield")
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("SUMTER COUNTY EMS").font(.heading(.largeTitle)).foregroundStyle(.white)
                Text(subtitle.uppercased()).font(.heading(.title3)).foregroundStyle(.white.opacity(0.9))
            }
            Spacer()
        }
        .padding(16)
        .background(Theme.navy)
        .accessibilityElement(children: .combine)
    }
}

struct NewShiftSheet: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    let training: Bool
    @Binding var path: [UUID]
    @State private var date = Date()
    @State private var label = ""
    @State private var supervisor = ""
    @State private var sheet = ""
    @State private var sourceID: UUID?
    @State private var carry = CarryForward()
    @State private var creating = false

    var candidates: [ShiftRecord] {
        store.data.shifts.filter { $0.isTraining == training }.sorted { $0.createdAt > $1.createdAt }
    }
    var source: ShiftRecord? { sourceID.flatMap { store.shift($0) } }

    var body: some View {
        NavigationStack {
            Form {
                if training {
                    Section { Text("TRAINING shift: clearly labeled fictitious data, kept separate from operational shifts and their carry-forward.").foregroundStyle(Theme.brick) }
                }
                Section("Shift") {
                    DatePicker("Date", selection: $date, displayedComponents: .date)
                    TextField("Shift (your label, e.g. A, B, Days)", text: $label)
                    TextField("Supervisor", text: $supervisor)
                    TextField("Sheet (reference)", text: $sheet)
                    Text("Operational time zone: \(store.data.settings.defaultTimeZoneID) (change in Settings)")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Section("Carry forward from") {
                    Picker("Previous shift", selection: $sourceID) {
                        Text("Nothing — use the seeded roster").tag(UUID?.none)
                        ForEach(candidates) { s in Text(s.title).tag(UUID?.some(s.id)) }
                    }
                    if let source {
                        Toggle("Roster (stations and units)", isOn: $carry.roster)
                        Toggle("Crew names (marked inherited until reviewed)", isOn: $carry.crew).disabled(!carry.roster)
                        Toggle("On-Duty Notes (marked inherited until reviewed)", isOn: $carry.systemNotes)
                        let open = source.calls.filter { $0.isOpen && source.unit($0.unitID)?.activeCallID == $0.id }
                        if carry.roster && !open.isEmpty {
                            Text("Still-active runs. Transfer keeps the same run, its history and original times:")
                                .font(.footnote)
                            ForEach(open) { c in
                                Toggle("Transfer Unit \(source.unit(c.unitID)?.name ?? "?") run \(c.runNumber.orDash) — \(c.nature.orNotRecorded)",
                                       isOn: Binding(get: { carry.transferCallIDs.contains(c.id) },
                                                     set: { on in
                                                         if on { carry.transferCallIDs.insert(c.id) } else { carry.transferCallIDs.remove(c.id) }
                                                     }))
                            }
                        }
                    }
                }
                Section {
                    Text("Never carried: unit statuses, on-duty marks, call times, holding calls, unit notes and run notes. Every unit starts Unknown and not on duty.")
                        .font(.footnote)
                }
            }
            .navigationTitle(training ? "New Training Shift" : "New Shift")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") { create() }.disabled(creating)
                }
            }
        }
    }

    func create() {
        guard !creating else { return }
        creating = true
        let tz = TimeZone(identifier: store.data.settings.defaultTimeZoneID) ?? .current
        var c = carry
        if sourceID == nil { c = CarryForward(roster: false, crew: false, systemNotes: false, transferCallIDs: []) }
        if !c.roster { c.crew = false; c.transferCallIDs = [] }
        let header = ShiftHeader(date: TimeFormat.noon(ofPicked: date, in: tz), label: label.trimmed,
                                 supervisor: supervisor.trimmed, sheet: sheet.trimmed)
        let id = store.createShift(previousID: sourceID, carry: c, header: header, training: training)
        path.append(id)
        dismiss()
    }
}

// MARK: - Board

struct BoardView: View {
    @EnvironmentObject var store: Store
    let shiftID: UUID
    @State private var editingUnit: IDBox?
    @State private var sheet: BoardSheet?
    @State private var confirmArchive = false
    @State private var confirmReopen = false
    @State private var addingCall = false

    enum BoardSheet: Identifiable {
        case header, system, roster, export, pending(UUID)
        var id: String {
            switch self {
            case .header: return "header"
            case .system: return "system"
            case .roster: return "roster"
            case .export: return "export"
            case .pending(let id): return "pending-\(id.uuidString)"
            }
        }
    }

    var body: some View {
        Group {
            if let shift = store.shift(shiftID) {
                board(shift)
            } else {
                Text("This shift is no longer available.")
            }
        }
        .onAppear { store.boardVisible = true; store.applyIdleTimer() }
        .onDisappear { store.flush(); store.boardVisible = false; store.applyIdleTimer() }
    }

    func board(_ shift: ShiftRecord) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
                SaveFailureBanner()
                banners(shift)
                HeaderStrip(shift: shift) { sheet = .header }
                SystemStrip(shift: shift) { sheet = .system }
                    .padding(.vertical, 12)
                PendingSection(shift: shift, adding: addingCall, onAdd: addCall) { id in sheet = .pending(id) }
                    .padding(.bottom, 12)
                ForEach(shift.orderedStations) { st in
                    Section {
                        let list = shift.stationUnits(st.id)
                        if list.isEmpty {
                            Text("No units at this station.").foregroundStyle(.secondary).padding()
                        }
                        ForEach(Array(list.enumerated()), id: \.element.id) { idx, u in
                            Button { store.flush(); editingUnit = IDBox(id: u.id) } label: {
                                UnitRow(shift: shift, unit: u, striped: idx % 2 == 1)
                            }
                            .buttonStyle(.plain)
                            .accessibilityHint("Opens the editor for unit \(u.name)")
                            Divider()
                        }
                    } header: {
                        StationHeader(station: st, count: shift.stationUnits(st.id).count)
                    }
                }
                Text("Handwriting on this board is an attachment only; it never changes statuses, times or counts.")
                    .font(.footnote).foregroundStyle(.secondary).padding()
            }
        }
        .navigationTitle(shift.isTraining ? "TRAINING Shift Board" : "Shift Board")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .status) { SaveStatusView() }
            ToolbarItemGroup(placement: .primaryAction) {
                Button { store.flush(); sheet = .export } label: { Label("Export", systemImage: "square.and.arrow.up") }
                Menu {
                    Button { sheet = .roster } label: { Label("Roster and Stations", systemImage: "list.bullet") }
                        .disabled(shift.isReadOnly)
                    Toggle(isOn: Binding(get: { store.data.settings.keepAwake },
                                         set: { v in store.updateSettings { $0.keepAwake = v } })) {
                        Label("Keep Screen Awake on Board", systemImage: "sun.max")
                    }
                    if shift.isReadOnly {
                        Button { confirmReopen = true } label: { Label("Reopen Shift…", systemImage: "lock.open") }
                    } else {
                        Button { confirmArchive = true } label: { Label("Archive Shift…", systemImage: "archivebox") }
                    }
                } label: {
                    Label("More", systemImage: "ellipsis.circle")
                }
            }
        }
        .fullScreenCover(item: $editingUnit) { box in
            UnitEditorView(shiftID: shiftID, unitID: box.id).environmentObject(store)
        }
        .sheet(item: $sheet, onDismiss: { store.flush(); addingCall = false }) { which in
            sheetContent(which, shift).environmentObject(store)
        }
        .confirmationDialog("Archive this shift? It becomes read-only and stays in Archive. Nothing is deleted.",
                            isPresented: $confirmArchive, titleVisibility: .visible) {
            Button("Archive Shift") { store.archive(shiftID) }
        }
        .confirmationDialog("Reopen this shift for editing? The reopen is recorded in its history.",
                            isPresented: $confirmReopen, titleVisibility: .visible) {
            Button("Reopen Shift") { store.reopen(shiftID) }
        }
    }

    @ViewBuilder
    func sheetContent(_ which: BoardSheet, _ shift: ShiftRecord) -> some View {
        switch which {
        case .header: HeaderEditor(shiftID: shiftID)
        case .system: SystemEditor(shiftID: shiftID)
        case .roster: RosterEditor(shiftID: shiftID)
        case .export: ExportSheet(snapshot: shift)
        case .pending(let id): PendingEditorView(shiftID: shiftID, pendingID: id)
        }
    }

    @ViewBuilder
    func banners(_ shift: ShiftRecord) -> some View {
        if shift.isTraining {
            Text("TRAINING — FICTITIOUS DATA — NOT AN OPERATIONAL RECORD")
                .font(.heading(.headline)).foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 36).background(Theme.slate)
        }
        if shift.isReadOnly {
            HStack {
                Text("ARCHIVED — read-only. \(shift.provenance ?? "")").font(.headline)
                Spacer()
                Button("Reopen…") { confirmReopen = true }.buttonStyle(.borderedProminent).tint(Theme.navy)
            }
            .padding(12)
            .background(Color.yellow.opacity(0.25))
        }
    }

    func addCall() {
        guard !addingCall else { return }
        addingCall = true
        var newID: UUID?
        let t = store.now()
        let initials = store.data.settings.initials
        store.update(shiftID) { s in newID = s.addPending(now: t, initials: initials) }
        if let newID { sheet = .pending(newID) } else { addingCall = false }
    }
}

struct StationHeader: View {
    let station: Station
    let count: Int
    var body: some View {
        HStack {
            Text("STATION \(station.number) / \(station.name)").font(.heading(.title3)).foregroundStyle(.white)
            Spacer()
            Text("\(count) unit\(count == 1 ? "" : "s")").font(.subheadline).foregroundStyle(.white.opacity(0.85))
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
        .background(Theme.navy)
        .accessibilityAddTraits(.isHeader)
    }
}

struct HeaderStrip: View {
    let shift: ShiftRecord
    let onEdit: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("SHIFT COMMAND BOARD").font(.heading(.title2)).foregroundStyle(.white)
                Spacer()
                if !shift.isReadOnly {
                    Button("Edit Header", action: onEdit)
                        .buttonStyle(.bordered).tint(.white)
                        .frame(minHeight: 48)
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 8)
            .background(Theme.navy)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 190), alignment: .topLeading)], alignment: .leading, spacing: 10) {
                FieldValue(label: "Date", value: TimeFormat.day(shift.operationalDate, tz: shift.timeZone))
                FieldValue(label: "Shift", value: shift.shiftLabel.orNotRecorded)
                FieldValue(label: "Supervisor", value: shift.supervisor.orNotRecorded)
                FieldValue(label: "Sheet", value: shift.sheetRef.orNotRecorded)
                FieldValue(label: "Time zone", value: shift.timeZoneID)
            }
            .padding(14)
        }
    }
}

struct FieldValue: View {
    let label: String
    let value: String
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased()).font(.caption.bold()).foregroundStyle(.secondary)
            Text(value).font(.body).foregroundStyle(value == "Not recorded" ? .secondary : .primary)
        }
        .accessibilityElement(children: .combine)
    }
}

struct SystemStrip: View {
    let shift: ShiftRecord
    let onEdit: () -> Void
    @State private var showDefinition = false

    var body: some View {
        let c = BoardCounts.of(shift.units)
        let tz = shift.timeZone
        let ref = shift.operationalDate
        SectionBox(title: "System Status") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 10)], spacing: 10) {
                CountTile(label: "Trucks in Service", value: c.inService, emphasis: true)
                CountTile(label: "Available Now (AVL)", value: c.available)
                CountTile(label: "Status Unknown", value: c.unknown)
                CountTile(label: "Out of Service", value: c.oos)
                CountTile(label: "On Duty", value: c.onDuty)
                CountTile(label: "Not on Duty", value: c.offDuty)
            }
            Button(showDefinition ? "Hide counting rules" : "How these are counted") { showDefinition.toggle() }
                .frame(minHeight: 44)
            if showDefinition { Text(BoardCounts.definition).font(.callout) }
            Divider()
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 240), alignment: .topLeading)], alignment: .leading, spacing: 10) {
                FieldValue(label: "Status Level (manual)", value: observed(shift.system.statusLevel, shift.system.statusLevelUpdatedAt, tz, ref))
                FieldValue(label: "Weather (manual)", value: observed(shift.system.weather, shift.system.weatherUpdatedAt, tz, ref))
                FieldValue(label: "Hospital Divert (manual)", value: observed(shift.system.hospitalDivert, shift.system.hospitalDivertUpdatedAt, tz, ref))
            }
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("ON-DUTY NOTES").font(.caption.bold()).foregroundStyle(.secondary)
                    if let m = shift.system.onDutyNotesInherited, !m.reviewed {
                        TagText(text: "INHERITED — REVIEW")
                    }
                }
                Text(shift.system.onDutyNotes.orNotRecorded).lineLimit(3)
                    .foregroundStyle(shift.system.onDutyNotes.trimmed.isEmpty ? .secondary : .primary)
            }
            if !shift.isReadOnly {
                Button(action: onEdit) { BigButtonLabel(title: "Edit System Status and Notes", systemImage: "square.and.pencil") }
                    .buttonStyle(.bordered)
            } else {
                Button(action: onEdit) { BigButtonLabel(title: "View System Status and Notes", systemImage: "doc.text") }
                    .buttonStyle(.bordered)
            }
        }
        .padding(.horizontal, 12)
    }

    func observed(_ v: String, _ at: Date?, _ tz: TimeZone, _ ref: Date) -> String {
        if v.trimmed.isEmpty { return "Not recorded" }
        return "\(v) (updated \(TimeFormat.clock(at, tz: tz, ref: ref)))"
    }
}

struct CountTile: View {
    let label: String
    let value: Int
    var emphasis = false
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(value)").font(.system(.largeTitle, design: .rounded, weight: .bold).monospacedDigit())
            Text(label).font(.subheadline.bold())
        }
        .padding(10)
        .frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
        .foregroundStyle(emphasis ? Color.white : Color.primary)
        .background(emphasis ? Theme.navy : Theme.rowFill)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .accessibilityElement(children: .combine)
    }
}

struct UnitRow: View {
    let shift: ShiftRecord
    let unit: RosterUnit
    let striped: Bool
    @Environment(\.horizontalSizeClass) private var sizeClass

    var run: CallRecord? { shift.activeCall(for: unit.id) }

    var crewText: String { unit.crew.trimmed.isEmpty ? "Crew not recorded" : unit.crew }
    var runText: String {
        guard let run else { return "No active run" }
        return "Run \(run.runNumber.orDash) · \(run.priority.short) · \(run.determinant.short)"
    }
    var natureText: String {
        guard let run else { return "—" }
        return "\(run.nature.orDash) / \(run.destination.orDash)"
    }
    var updatedText: String {
        guard let d = unit.statusChangedAt else { return "No update" }
        return "Upd \(TimeFormat.clock(d, tz: shift.timeZone, ref: shift.operationalDate))"
    }

    var body: some View {
        Group {
            if sizeClass == .regular {
                HStack(alignment: .top, spacing: 14) {
                    identity.frame(width: 110, alignment: .leading)
                    StatusBadge(status: unit.status).frame(width: 84, alignment: .leading)
                    crew.frame(minWidth: 140, maxWidth: .infinity, alignment: .leading)
                    Text(runText).font(.body).frame(width: 190, alignment: .leading)
                    Text(natureText).lineLimit(2).frame(minWidth: 160, maxWidth: .infinity, alignment: .leading)
                    Text(updatedText).font(.subheadline).foregroundStyle(.secondary).frame(width: 96, alignment: .trailing)
                }
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 12) {
                        identity
                        StatusBadge(status: unit.status)
                        Spacer()
                        Text(updatedText).font(.subheadline).foregroundStyle(.secondary)
                    }
                    crew
                    Text(runText)
                    Text(natureText).lineLimit(2)
                }
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
        .background(striped ? Theme.rowFill : Color(uiColor: .systemBackground))
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Unit \(unit.name), \(unit.onDuty ? "on duty" : "not on duty"), status \(unit.status.fullName), \(crewText), \(runText), \(natureText), \(updatedText)")
    }

    var identity: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(unit.name).font(.heading(.title))
            Text(unit.onDuty ? "ON DUTY" : "NOT ON DUTY").font(.caption.bold())
                .foregroundStyle(unit.onDuty ? Theme.navy : .secondary)
        }
    }

    var crew: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(crewText).lineLimit(2).foregroundStyle(unit.crew.trimmed.isEmpty ? .secondary : .primary)
            if let m = unit.crewInherited, !m.reviewed { TagText(text: "INHERITED — REVIEW") }
        }
    }
}

struct PendingSection: View {
    let shift: ShiftRecord
    let adding: Bool
    let onAdd: () -> Void
    let onOpen: (UUID) -> Void

    var ordered: [PendingCall] {
        let rank: [PendingState: Int] = [.pending: 0, .assigned: 1, .cancelled: 2]
        return shift.pending.sorted {
            (rank[$0.state] ?? 3, $0.createdAt) < (rank[$1.state] ?? 3, $1.createdAt)
        }
    }

    var body: some View {
        SectionBox(title: "Calls Holding / Pending", accent: Theme.brick) {
            if !shift.isReadOnly {
                Button(action: onAdd) { BigButtonLabel(title: "Add Call", systemImage: "plus") }
                    .buttonStyle(.borderedProminent).tint(Theme.navy)
                    .disabled(adding)
            }
            if shift.pending.isEmpty {
                Text("No calls holding.").foregroundStyle(.secondary)
            }
            ForEach(Array(ordered.enumerated()), id: \.element.id) { idx, p in
                Button { onOpen(p.id) } label: { PendingRow(shift: shift, call: p, striped: idx % 2 == 1) }
                    .buttonStyle(.plain)
                    .accessibilityHint("Opens this holding call")
            }
        }
        .padding(.horizontal, 12)
    }
}

struct PendingRow: View {
    let shift: ShiftRecord
    let call: PendingCall
    let striped: Bool

    var assignedNames: String {
        let names = call.assignedCallIDs.compactMap { cid in
            shift.calls.first { $0.id == cid }.flatMap { shift.unit($0.unitID)?.name }
        }
        return names.isEmpty ? "Unassigned" : names.joined(separator: ", ")
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(call.timeIn == nil ? "Time In not recorded" : "In \(TimeFormat.clock(call.timeIn, tz: shift.timeZone, ref: shift.operationalDate))")
                    .font(.headline.monospacedDigit())
                if call.state == .pending, let t = call.timeIn {
                    TimelineView(.periodic(from: .now, by: 30)) { ctx in
                        Text("Holding \(TimeFormat.elapsed(from: t, to: ctx.date))").font(.subheadline)
                    }
                } else if call.state == .pending {
                    Text("Holding time unknown").font(.subheadline).foregroundStyle(.secondary)
                }
            }
            .frame(width: 170, alignment: .leading)
            TagText(text: call.state.label.uppercased(),
                    color: call.state == .pending ? Theme.brick : (call.state == .assigned ? Theme.navy : Color(white: 0.4)))
            VStack(alignment: .leading, spacing: 2) {
                Text("Run \(call.runNumber.orDash) · \(call.priority.short) · \(call.determinant.short)").font(.headline)
                Text(call.nature.orNotRecorded).lineLimit(2)
                Text(call.location.orNotRecorded).lineLimit(1).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text(assignedNames).font(.subheadline.bold())
        }
        .padding(10)
        .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
        .background(striped ? Theme.rowFill : Color(uiColor: .systemBackground))
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Unit editor

struct UndoToken: Equatable {
    let batch: UUID
    let text: String
}

struct UnitEditorView: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    let shiftID: UUID
    @State var unitID: UUID
    @State private var lastAction: UndoToken?

    var shift: ShiftRecord? { store.shift(shiftID) }

    var orderedIDs: [UUID] { shift?.orderedUnits.map(\.id) ?? [] }
    var position: Int? { orderedIDs.firstIndex(of: unitID) }

    var body: some View {
        NavigationStack {
            Group {
                if let shift, let unit = shift.unit(unitID) {
                    editor(shift, unit)
                } else {
                    Text("Unit not found.")
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .navigationBarLeading) {
                    Button { move(-1) } label: { Label("Previous Unit", systemImage: "chevron.up") }
                        .disabled((position ?? 0) == 0)
                    Button { move(1) } label: { Label("Next Unit", systemImage: "chevron.down") }
                        .disabled(position == nil || position == orderedIDs.count - 1)
                }
                ToolbarItem(placement: .principal) { SaveStatusView() }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { store.flush(); dismiss() }
                        .font(.headline)
                        .accessibilityLabel("Done, return to board")
                }
            }
        }
    }

    func move(_ delta: Int) {
        guard let i = position, orderedIDs.indices.contains(i + delta) else { return }
        store.flush()
        lastAction = nil
        unitID = orderedIDs[i + delta]
    }

    func editor(_ shift: ShiftRecord, _ unit: RosterUnit) -> some View {
        let readOnly = shift.isReadOnly
        let station = shift.station(unit.stationID)
        let run = shift.activeCall(for: unit.id)
        return VStack(spacing: 0) {
            IdentityBar(stationText: station.map { "Station \($0.number) / \($0.name)" } ?? "Station not set",
                        unit: unit, run: run)
            SaveFailureBanner()
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if readOnly {
                        Text("Archived shift — read-only.").font(.headline).foregroundStyle(Theme.brick)
                    }
                    if let lastAction, shift.events.contains(where: { $0.batchID == lastAction.batch }), !shift.isUndone(lastAction.batch) {
                        undoBanner(lastAction)
                    }
                    statusSection(shift, unit, readOnly: readOnly)
                    crewSection(shift, unit, readOnly: readOnly)
                    RunSection(shiftID: shiftID, unit: unit, readOnly: readOnly)
                    SectionBox(title: "Unit Notes") {
                        LongTextEditor(label: "Unit Notes", text: store.unitText(shiftID, unit.id, \.notes),
                                       minHeight: 200, readOnly: readOnly,
                                       ink: InkTarget(shiftID: shiftID, recordID: unit.id, fieldID: "unitNotes",
                                                      title: "Unit \(unit.name) — Unit Notes"))
                    }
                    PriorRunsSection(shift: shift, unit: unit)
                    HistorySection(shift: shift, recordIDs: Set([unit.id] + shift.runs(for: unit.id).map(\.id)))
                }
                .padding()
                .frame(maxWidth: 1000)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .id(unit.id)
    }

    func undoBanner(_ token: UndoToken) -> some View {
        HStack(spacing: 12) {
            Text(token.text).font(.headline)
            Spacer()
            Button {
                let t = store.now()
                let initials = store.data.settings.initials
                store.update(shiftID) { s in s.undo(batch: token.batch, now: t, initials: initials) }
                lastAction = nil
            } label: { Text("Undo").font(.headline).frame(minWidth: 80, minHeight: 48) }
            .buttonStyle(.borderedProminent).tint(Theme.navy)
            .accessibilityLabel("Undo: \(token.text)")
        }
        .padding(12)
        .background(Theme.rowFill)
        .overlay(Rectangle().stroke(Theme.navy, lineWidth: 1))
    }

    func statusSection(_ shift: ShiftRecord, _ unit: RosterUnit, readOnly: Bool) -> some View {
        SectionBox(title: "Status") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 10)], spacing: 10) {
                ForEach(UnitStatus.allCases) { s in
                    let isOn = unit.status == s
                    Button { pick(s, unit: unit) } label: {
                        VStack(spacing: 2) {
                            Text(s.abbr).font(.heading(.title2))
                            Text(s.fullName).font(.footnote).multilineTextAlignment(.center)
                        }
                        .padding(6)
                        .frame(maxWidth: .infinity, minHeight: 68)
                        .foregroundStyle(isOn ? Color.white : Color.primary)
                        .background(isOn ? s.color : Theme.rowFill)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(s.color, lineWidth: isOn ? 3 : 1))
                    }
                    .buttonStyle(.plain)
                    .disabled(readOnly)
                    .accessibilityLabel("\(s.abbr), \(s.fullName)")
                    .accessibilityAddTraits(isOn ? .isSelected : [])
                }
            }
            Text(unit.activeCallID == nil
                 ? "No active run: status changes will not record any run times."
                 : "ENR, SCN, TRN, HOS and CLR fill their matching run time only if it is empty. AVL and OOS never record times.")
                .font(.footnote).foregroundStyle(.secondary)
            Toggle(isOn: Binding(get: { unit.onDuty }, set: { v in
                let t = store.now()
                let initials = store.data.settings.initials
                store.update(shiftID) { s in s.setOnDuty(unitID: unit.id, v, now: t, initials: initials) }
            })) {
                Text("On duty this shift").font(.headline)
            }
            .frame(minHeight: 56)
            .disabled(readOnly)
        }
    }

    func pick(_ status: UnitStatus, unit: RosterUnit) {
        let t = store.now()
        let initials = store.data.settings.initials
        var batch: UUID?
        var stampedText = ""
        store.update(shiftID) { s in
            batch = s.setStatus(unitID: unit.id, to: status, now: t, initials: initials)
            if let b = batch, let e = s.events.first(where: { $0.batchID == b && $0.action == "timeStamped" }) {
                stampedText = "; \(Milestone(rawValue: e.field)?.label ?? e.field) time recorded \(TimeFormat.clock(t, tz: s.timeZone, ref: s.operationalDate))"
            }
        }
        if let batch {
            lastAction = UndoToken(batch: batch, text: "Unit \(unit.name) set to \(status.abbr)\(stampedText)")
        }
    }

    func crewSection(_ shift: ShiftRecord, _ unit: RosterUnit, readOnly: Bool) -> some View {
        SectionBox(title: "Crew") {
            if let m = unit.crewInherited, !m.reviewed {
                HStack {
                    Text("Carried forward from the shift of \(TimeFormat.day(m.fromDate, tz: shift.timeZone)). Review before treating as current.")
                        .font(.callout)
                    Spacer()
                    Button("Mark Reviewed") {
                        let t = store.now()
                        let initials = store.data.settings.initials
                        store.update(shiftID) { s in
                            if let i = s.unitIndex(unit.id) {
                                s.units[i].crewInherited?.reviewed = true
                                s.log(batch: UUID(), record: unit.id, kind: "unit", action: "reviewed", field: "crew",
                                      before: nil, after: nil, effective: t, now: t, initials: initials)
                            }
                        }
                    }
                    .buttonStyle(.borderedProminent).tint(Theme.navy).frame(minHeight: 48)
                    .disabled(readOnly)
                }
                .padding(10)
                .background(Color.yellow.opacity(0.2))
            }
            LongTextEditor(label: "Crew", text: store.unitText(shiftID, unit.id, \.crew), minHeight: 120,
                           readOnly: readOnly,
                           ink: InkTarget(shiftID: shiftID, recordID: unit.id, fieldID: "crew",
                                          title: "Unit \(unit.name) — Crew"))
        }
    }
}

struct IdentityBar: View {
    let stationText: String
    let unit: RosterUnit
    let run: CallRecord?
    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 2) {
                Text(stationText.uppercased()).font(.heading(.subheadline)).foregroundStyle(.white.opacity(0.85))
                Text("UNIT \(unit.name)").font(.heading(.largeTitle)).foregroundStyle(.white)
            }
            StatusBadge(status: unit.status)
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(run == nil ? "No active run" : "Run \(run?.runNumber.orDash ?? "—")").font(.headline).foregroundStyle(.white)
                Text(unit.onDuty ? "On duty" : "Not on duty").font(.subheadline).foregroundStyle(.white.opacity(0.85))
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(Theme.navy)
        .accessibilityElement(children: .combine)
    }
}

struct RunSection: View {
    @EnvironmentObject var store: Store
    let shiftID: UUID
    let unit: RosterUnit
    let readOnly: Bool
    @State private var confirmNew = false
    @State private var confirmClose = false

    var body: some View {
        SectionBox(title: "Current Run") {
            if let shift = store.shift(shiftID), let run = shift.activeCall(for: unit.id) {
                runEditor(shift, run)
            } else {
                Text("No active run.").font(.headline)
                if !readOnly {
                    Button { confirmNew = true } label: { BigButtonLabel(title: "Start Run", systemImage: "plus.circle") }
                        .buttonStyle(.borderedProminent).tint(Theme.navy)
                }
            }
        }
        .confirmationDialog(newRunQuestion, isPresented: $confirmNew, titleVisibility: .visible) {
            Button("Start New Run") {
                let expected = store.shift(shiftID)?.unit(unit.id)?.activeCallID
                let t = store.now()
                let initials = store.data.settings.initials
                store.update(shiftID) { s in s.startNewRun(unitID: unit.id, replacing: expected, now: t, initials: initials) }
            }
        }
        .confirmationDialog("Close this run? It stays in the unit's history with all its times.",
                            isPresented: $confirmClose, titleVisibility: .visible) {
            Button("Close Run") {
                guard let expected = store.shift(shiftID)?.unit(unit.id)?.activeCallID else { return }
                let t = store.now()
                let initials = store.data.settings.initials
                store.update(shiftID) { s in s.closeRun(unitID: unit.id, expected: expected, now: t, initials: initials) }
            }
        }
    }

    var newRunQuestion: String {
        unit.activeCallID == nil
            ? "Start a new run for unit \(unit.name)? All times start blank."
            : "Close the current run (kept in history) and start a new run with blank times?"
    }

    @ViewBuilder
    func runEditor(_ shift: ShiftRecord, _ run: CallRecord) -> some View {
        let tz = shift.timeZone
        let initials = store.data.settings.initials
        if run.transferredFromShiftID != nil {
            Text("Transferred from an earlier shift with its original times and history.").font(.callout)
        }
        if let pid = run.sharedCallID, let p = shift.pending.first(where: { $0.id == pid }) {
            Text("Linked to holding call received \(TimeFormat.clock(p.timeIn, tz: tz, ref: shift.operationalDate)).")
                .font(.callout).foregroundStyle(.secondary)
        }
        Group {
        LabeledTextField(label: "Run Number", text: store.callText(shiftID, run.id, \.runNumber), readOnly: readOnly)
        Text("Response Priority").font(.headline)
        OptionGrid(options: ResponsePriority.allCases, selected: run.priority, title: { $0.label }, minWidth: 110,
                   disabled: readOnly) { v in
            let t = store.now()
            store.update(shiftID) { s in s.setPriority(callID: run.id, v, now: t, initials: initials) }
        }
        Text("Determinant").font(.headline)
        OptionGrid(options: Determinant.allCases, selected: run.determinant, title: { $0.label }, minWidth: 120,
                   disabled: readOnly) { v in
            let t = store.now()
            store.update(shiftID) { s in s.setDeterminant(callID: run.id, v, now: t, initials: initials) }
        }
        Text("Priority and determinant are recorded separately. Neither sets the other or any clinical acuity.")
            .font(.footnote).foregroundStyle(.secondary)
        }
        Group {
        LongTextEditor(label: "Nature", text: store.callText(shiftID, run.id, \.nature), minHeight: 120, readOnly: readOnly)
        LabeledTextField(label: "Location", text: store.callText(shiftID, run.id, \.location), readOnly: readOnly)
        LongTextEditor(label: "Destination", text: store.callText(shiftID, run.id, \.destination), minHeight: 120, readOnly: readOnly)
        Text("Times").font(.heading(.title3))
        ForEach(Milestone.allCases) { m in
            TimeRow(label: m.label, value: run.time(m), tz: tz, ref: shift.operationalDate, readOnly: readOnly,
                    onNow: {
                        let t = store.now()
                        store.update(shiftID) { s in s.stampIfEmpty(callID: run.id, milestone: m, now: t, initials: initials) }
                    },
                    onSet: { value, reason in
                        let t = store.now()
                        store.update(shiftID) { s in
                            s.setTime(callID: run.id, milestone: m, to: value, now: t, initials: initials, reason: reason)
                        }
                    })
            Divider()
        }
        ForEach(shift.timeWarnings(run, now: Date()), id: \.self) { w in
            Label(w, systemImage: "exclamationmark.triangle").foregroundStyle(Theme.brick)
        }
        }
        LongTextEditor(label: "Run Notes", text: store.callText(shiftID, run.id, \.notes), minHeight: 200,
                       readOnly: readOnly,
                       ink: InkTarget(shiftID: shiftID, recordID: run.id, fieldID: "runNotes",
                                      title: "Unit \(unit.name) run \(run.runNumber.orDash) — Run Notes"))
        if !readOnly {
            HStack(spacing: 12) {
                Button { confirmClose = true } label: { BigButtonLabel(title: "Close Run", systemImage: "checkmark.circle") }
                    .buttonStyle(.bordered)
                Button { confirmNew = true } label: { BigButtonLabel(title: "New Run", systemImage: "plus.circle") }
                    .buttonStyle(.borderedProminent).tint(Theme.navy)
            }
        }
    }
}

struct PriorRunsSection: View {
    let shift: ShiftRecord
    let unit: RosterUnit

    var body: some View {
        let prior = shift.runs(for: unit.id).filter { $0.id != unit.activeCallID }.reversed()
        SectionBox(title: "Earlier Runs This Shift (\(prior.count))") {
            if prior.isEmpty { Text("None.").foregroundStyle(.secondary) }
            ForEach(Array(prior)) { r in
                VStack(alignment: .leading, spacing: 4) {
                    Text("Run \(r.runNumber.orDash) · \(r.priority.short) · \(r.determinant.short)").font(.headline)
                    Text("\(r.nature.orDash) / \(r.destination.orDash)")
                    Text(Milestone.allCases.map { "\($0.short) \(TimeFormat.clock(r.time($0), tz: shift.timeZone, ref: shift.operationalDate))" }.joined(separator: "  "))
                        .font(.callout.monospacedDigit())
                    if !r.notes.trimmed.isEmpty { Text(r.notes).font(.callout) }
                }
                .padding(.vertical, 6)
                Divider()
            }
        }
    }
}

struct HistorySection: View {
    let shift: ShiftRecord
    let recordIDs: Set<UUID>
    @State private var showAll = false

    var body: some View {
        let events = shift.events.filter { recordIDs.contains($0.recordID) }.sorted { $0.recordedAt > $1.recordedAt }
        let shown = showAll ? events : Array(events.prefix(15))
        SectionBox(title: "History (\(events.count))") {
            if events.isEmpty { Text("No history yet.").foregroundStyle(.secondary) }
            ForEach(shown) { e in
                VStack(alignment: .leading, spacing: 2) {
                    Text(shift.describe(e))
                    Text("\(shift.recordLabel(e.recordID)) · recorded \(TimeFormat.full(e.recordedAt, tz: shift.timeZone))\(e.initials.isEmpty ? "" : " · \(e.initials)")")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Divider()
            }
            if events.count > shown.count || showAll {
                Button(showAll ? "Show fewer" : "Show all \(events.count) entries") { showAll.toggle() }
                    .frame(minHeight: 48)
            }
        }
    }
}

// MARK: - Holding call editor

struct PendingEditorView: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    let shiftID: UUID
    let pendingID: UUID
    @State private var showAssign = false
    @State private var confirmCancel = false
    @State private var cancelReason = ""

    var body: some View {
        NavigationStack {
            Group {
                if let shift = store.shift(shiftID), let p = shift.pending.first(where: { $0.id == pendingID }) {
                    content(shift, p)
                } else {
                    Text("Call not found.")
                }
            }
            .navigationTitle("Holding Call")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .status) { SaveStatusView() }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { store.flush(); dismiss() }.accessibilityLabel("Done, return to board")
                }
            }
        }
        .sheet(isPresented: $showAssign) {
            AssignSheet(shiftID: shiftID, pendingID: pendingID).environmentObject(store)
        }
    }

    func content(_ shift: ShiftRecord, _ p: PendingCall) -> some View {
        let readOnly = shift.isReadOnly
        let tz = shift.timeZone
        let initials = store.data.settings.initials
        return ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text("RUN \(p.runNumber.orDash)").font(.heading(.largeTitle))
                    TagText(text: p.state.label.uppercased(), color: p.state == .pending ? Theme.brick : Theme.navy)
                    Spacer()
                }
                TimeRow(label: "Time In", value: p.timeIn, tz: tz, ref: shift.operationalDate,
                        readOnly: readOnly || p.state == .cancelled,
                        onNow: {
                            let t = store.now()
                            store.update(shiftID) { s in s.setPendingTimeIn(pendingID, to: t, onlyIfEmpty: true, now: t, initials: initials, reason: "Now") }
                        },
                        onSet: { v, reason in
                            let t = store.now()
                            store.update(shiftID) { s in s.setPendingTimeIn(pendingID, to: v, onlyIfEmpty: false, now: t, initials: initials, reason: reason) }
                        })
                if p.state == .pending {
                    if let t = p.timeIn {
                        TimelineView(.periodic(from: .now, by: 30)) { ctx in
                            Text("Holding \(TimeFormat.elapsed(from: t, to: ctx.date))").font(.title3.bold())
                        }
                    } else {
                        Text("Holding time unknown until Time In is recorded.").foregroundStyle(.secondary)
                    }
                }
                Group {
                LabeledTextField(label: "Run Number", text: store.pendingText(shiftID, pendingID, \.runNumber), readOnly: readOnly)
                Text("Response Priority").font(.headline)
                OptionGrid(options: ResponsePriority.allCases, selected: p.priority, title: { $0.label }, disabled: readOnly) { v in
                    let t = store.now()
                    store.update(shiftID) { s in s.setPendingPriority(pendingID, v, now: t, initials: initials) }
                }
                Text("Determinant").font(.headline)
                OptionGrid(options: Determinant.allCases, selected: p.determinant, title: { $0.label }, minWidth: 120, disabled: readOnly) { v in
                    let t = store.now()
                    store.update(shiftID) { s in s.setPendingDeterminant(pendingID, v, now: t, initials: initials) }
                }
                }
                LongTextEditor(label: "Nature", text: store.pendingText(shiftID, pendingID, \.nature), minHeight: 120, readOnly: readOnly)
                LabeledTextField(label: "Location", text: store.pendingText(shiftID, pendingID, \.location), readOnly: readOnly)
                LongTextEditor(label: "Status / Notes", text: store.pendingText(shiftID, pendingID, \.statusNotes),
                               minHeight: 200, readOnly: readOnly,
                               ink: InkTarget(shiftID: shiftID, recordID: pendingID, fieldID: "pendingNotes",
                                              title: "Holding call \(p.runNumber.orDash) — Status / Notes"))
                SectionBox(title: "Assigned Units") {
                    let linked = p.assignedCallIDs.compactMap { cid in shift.calls.first { $0.id == cid } }
                    if linked.isEmpty { Text("None.").foregroundStyle(.secondary) }
                    ForEach(linked) { c in
                        Text("Unit \(shift.unit(c.unitID)?.name ?? "?") — run \(c.isOpen ? "active" : "closed")").font(.headline)
                    }
                    Text("Assigning copies Run Number, priority, determinant, nature and location into a new run for that unit. Later edits here do not change those runs.")
                        .font(.footnote).foregroundStyle(.secondary)
                    if !readOnly && p.state != .cancelled {
                        Button { store.flush(); showAssign = true } label: { BigButtonLabel(title: "Assign Unit…", systemImage: "arrow.right.circle") }
                            .buttonStyle(.borderedProminent).tint(Theme.navy)
                    }
                }
                if !readOnly && p.state != .cancelled {
                    Button(role: .destructive) { confirmCancel = true } label: { BigButtonLabel(title: "Cancel Call…", systemImage: "xmark.circle") }
                        .buttonStyle(.bordered)
                }
                HistorySection(shift: shift, recordIDs: [pendingID])
            }
            .padding()
            .frame(maxWidth: 1000)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .alert("Cancel this call?", isPresented: $confirmCancel) {
            TextField("Reason (optional)", text: $cancelReason)
            Button("Cancel Call", role: .destructive) {
                let t = store.now()
                let reason = cancelReason
                store.update(shiftID) { s in s.cancelPending(pendingID, reason: reason, now: t, initials: initials) }
            }
            Button("Keep Call", role: .cancel) {}
        } message: {
            Text("The call stays on the board marked Cancelled, with its history.")
        }
    }
}

struct AssignSheet: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    let shiftID: UUID
    let pendingID: UUID
    @State private var selected: UUID?
    @State private var closeExisting = false
    @State private var overrideNote = ""
    @State private var message: String?
    @State private var working = false

    var body: some View {
        NavigationStack {
            Group {
                if let s = store.shift(shiftID) { content(s) }
            }
            .navigationTitle("Assign Unit")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
    }

    func content(_ s: ShiftRecord) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let id = selected, let u = s.unit(id) {
                    requirements(s, u)
                    Divider()
                }
                ForEach(s.orderedStations) { st in
                    Text("STATION \(st.number) / \(st.name)").font(.heading(.headline))
                    ForEach(s.stationUnits(st.id)) { u in unitChoice(s, u) }
                }
            }
            .padding()
        }
    }

    func unitChoice(_ s: ShiftRecord, _ u: RosterUnit) -> some View {
        let isOn = selected == u.id
        let hasRun = s.activeCall(for: u.id)?.isOpen ?? false
        return Button {
            selected = u.id
            closeExisting = false
            overrideNote = ""
            message = nil
        } label: {
            HStack(spacing: 12) {
                Image(systemName: isOn ? "largecircle.fill.circle" : "circle").font(.title2)
                Text(u.name).font(.heading(.title2))
                StatusBadge(status: u.status)
                Text(u.onDuty ? "On duty" : "Not on duty").foregroundStyle(.secondary)
                if hasRun { TagText(text: "ACTIVE RUN", color: Theme.navy) }
                Spacer()
            }
            .frame(minHeight: 56)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }

    @ViewBuilder
    func requirements(_ s: ShiftRecord, _ u: RosterUnit) -> some View {
        let active = s.activeCall(for: u.id).flatMap { $0.isOpen ? $0 : nil }
        let needsOverride = s.assignNeedsOverride(u)
        VStack(alignment: .leading, spacing: 12) {
            Text("Assign unit \(u.name)").font(.heading(.title2))
            if let active {
                Text("Unit \(u.name) has an active run (Run \(active.runNumber.orDash)). It must be closed to take this call; it stays in history with its times.")
                Toggle("Close that run and assign this call", isOn: $closeExisting).frame(minHeight: 48)
            }
            if needsOverride {
                Text("Warning: unit \(u.name) is \(u.onDuty ? u.status.fullName : "not on duty"). Assigning it is an override and needs a documented reason.")
                    .foregroundStyle(Theme.brick)
                TextField("Override reason (required)", text: $overrideNote)
                    .textFieldStyle(.roundedBorder)
                    .frame(minHeight: 48)
            }
            if let message { Text(message).foregroundStyle(Theme.brick) }
            Button { assign(u) } label: { BigButtonLabel(title: "Assign \(u.name)", systemImage: "checkmark") }
                .buttonStyle(.borderedProminent).tint(Theme.navy)
                .disabled(working || (active != nil && !closeExisting) || (needsOverride && overrideNote.trimmed.isEmpty))
        }
    }

    func assign(_ u: RosterUnit) {
        guard !working else { return }
        working = true
        var result = AssignResult.notFound
        let t = store.now()
        let initials = store.data.settings.initials
        let note = overrideNote
        let close = closeExisting
        store.update(shiftID) { s in
            result = s.assign(pendingID: pendingID, unitID: u.id, overrideNote: note, closeExistingRun: close,
                              now: t, initials: initials)
        }
        if case .assigned = result {
            dismiss()
        } else {
            message = result.message
            working = false
        }
    }
}

// MARK: - Header, system and roster editors

struct HeaderEditor: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    let shiftID: UUID
    @State private var tzText = ""
    @State private var tzMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                if let s = store.shift(shiftID) {
                    Section("Header") {
                        DatePicker("Date", selection: Binding(
                            get: { TimeFormat.pickerDate(fromNoon: s.operationalDate, in: s.timeZone) },
                            set: { v in store.update(shiftID) { r in r.operationalDate = TimeFormat.noon(ofPicked: v, in: r.timeZone) } }),
                                   displayedComponents: .date)
                        TextField("Shift", text: store.shiftText(shiftID, \.shiftLabel)).frame(minHeight: 44)
                        TextField("Supervisor", text: store.shiftText(shiftID, \.supervisor)).frame(minHeight: 44)
                        TextField("Sheet (reference)", text: store.shiftText(shiftID, \.sheetRef)).frame(minHeight: 44)
                    }
                    .disabled(s.isReadOnly)
                    Section("Operational time zone") {
                        Text("Current: \(s.timeZoneID)")
                        TextField("e.g. America/New_York", text: $tzText)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                        Button("Change Time Zone for This Shift") {
                            if let tz = TimeZone(identifier: tzText.trimmed) {
                                store.update(shiftID) { r in r.timeZoneID = tz.identifier }
                                tzMessage = "Changed. Stored times are unchanged; they are now displayed in \(tz.identifier)."
                            } else {
                                tzMessage = "Not a recognised time zone identifier."
                            }
                        }
                        .disabled(s.isReadOnly)
                        if let tzMessage { Text(tzMessage).font(.footnote) }
                    }
                }
            }
            .navigationTitle("Shift Header")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { store.flush(); dismiss() } }
            }
        }
    }
}

struct SystemEditor: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    let shiftID: UUID

    var body: some View {
        NavigationStack {
            ScrollView {
                if let s = store.shift(shiftID) {
                    VStack(alignment: .leading, spacing: 18) {
                        Text("These are manual observations. Nothing here is looked up or invented; each records when it was last changed.")
                            .font(.callout).foregroundStyle(.secondary)
                        observation(s, "Status Level", \.statusLevel, \.statusLevelUpdatedAt)
                        observation(s, "Weather", \.weather, \.weatherUpdatedAt)
                        LongTextEditor(label: "Hospital Divert",
                                       text: store.systemText(shiftID, \.hospitalDivert, stamp: \.hospitalDivertUpdatedAt),
                                       minHeight: 120, readOnly: s.isReadOnly)
                        Text("Hospital Divert updated: \(TimeFormat.full(s.system.hospitalDivertUpdatedAt, tz: s.timeZone))")
                            .font(.footnote).foregroundStyle(.secondary)
                        if let m = s.system.onDutyNotesInherited, !m.reviewed {
                            HStack {
                                Text("On-Duty Notes carried forward from the shift of \(TimeFormat.day(m.fromDate, tz: s.timeZone)). Review before treating as current.")
                                Spacer()
                                Button("Mark Reviewed") {
                                    let t = store.now()
                                    let initials = store.data.settings.initials
                                    store.update(shiftID) { r in
                                        r.system.onDutyNotesInherited?.reviewed = true
                                        r.log(batch: UUID(), record: r.id, kind: "shift", action: "reviewed", field: "On-Duty Notes",
                                              before: nil, after: nil, effective: t, now: t, initials: initials)
                                    }
                                }
                                .buttonStyle(.borderedProminent).tint(Theme.navy).frame(minHeight: 48)
                                .disabled(s.isReadOnly)
                            }
                            .padding(10).background(Color.yellow.opacity(0.2))
                        }
                        LongTextEditor(label: "On-Duty Notes", text: store.systemText(shiftID, \.onDutyNotes, stamp: nil),
                                       minHeight: 200, readOnly: s.isReadOnly,
                                       ink: InkTarget(shiftID: shiftID, recordID: s.id, fieldID: "onDutyNotes",
                                                      title: "System — On-Duty Notes"))
                    }
                    .padding()
                }
            }
            .navigationTitle("System Status")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .status) { SaveStatusView() }
                ToolbarItem(placement: .confirmationAction) { Button("Done") { store.flush(); dismiss() } }
            }
        }
    }

    func observation(_ s: ShiftRecord, _ label: String, _ kp: WritableKeyPath<SystemStatus, String>,
                     _ stamp: WritableKeyPath<SystemStatus, Date?>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            LabeledTextField(label: label, text: store.systemText(shiftID, kp, stamp: stamp), readOnly: s.isReadOnly)
            Text("Updated: \(TimeFormat.full(s.system[keyPath: stamp], tz: s.timeZone))")
                .font(.footnote).foregroundStyle(.secondary)
        }
    }
}

struct RosterEditor: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    let shiftID: UUID
    @State private var newUnitNames: [UUID: String] = [:]
    @State private var newStationNumber = ""
    @State private var newStationName = ""

    var body: some View {
        NavigationStack {
            Form {
                if let s = store.shift(shiftID) {
                    Section {
                        Text("Changes apply to this shift. Units keep their internal IDs, so reordering or renaming never moves notes, runs or handwriting to another unit. Removing a unit hides it from the board and counts; its history stays.")
                            .font(.footnote)
                    }
                    ForEach(s.orderedStations) { st in
                        Section {
                            TextField("Station number", text: store.stationText(shiftID, st.id, \.number))
                            TextField("Station name", text: store.stationText(shiftID, st.id, \.name))
                            HStack {
                                Button("Move Station Up") { store.update(shiftID) { $0.moveStation(st.id, by: -1) } }
                                    .buttonStyle(.bordered)
                                Button("Move Station Down") { store.update(shiftID) { $0.moveStation(st.id, by: 1) } }
                                    .buttonStyle(.bordered)
                            }
                            ForEach(s.stationUnits(st.id, includeRetired: true)) { u in unitRow(u) }
                            HStack {
                                TextField("New unit", text: Binding(get: { newUnitNames[st.id] ?? "" },
                                                                    set: { newUnitNames[st.id] = $0 }))
                                Button("Add Unit") {
                                    let name = (newUnitNames[st.id] ?? "").trimmed
                                    guard !name.isEmpty else { return }
                                    store.update(shiftID) { $0.addUnit(stationID: st.id, name: name) }
                                    newUnitNames[st.id] = ""
                                }
                                .buttonStyle(.borderedProminent).tint(Theme.navy)
                            }
                        } header: {
                            Text("Station \(st.number) / \(st.name)")
                        }
                    }
                    Section("Add Station") {
                        TextField("Number", text: $newStationNumber)
                        TextField("Name", text: $newStationName)
                        Button("Add Station") {
                            guard !newStationNumber.trimmed.isEmpty else { return }
                            let n = newStationNumber.trimmed, nm = newStationName.trimmed
                            store.update(shiftID) { $0.addStation(number: n, name: nm) }
                            newStationNumber = ""; newStationName = ""
                        }
                    }
                }
            }
            .navigationTitle("Roster and Stations")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { store.flush(); dismiss() } }
            }
        }
    }

    func unitRow(_ u: RosterUnit) -> some View {
        HStack(spacing: 10) {
            TextField("Unit", text: store.unitText(shiftID, u.id, \.name)).font(.title3)
            if u.retired { TagText(text: "REMOVED", color: Color(white: 0.4)) }
            Button { store.update(shiftID) { $0.moveUnit(u.id, by: -1) } } label: { Image(systemName: "arrow.up") }
                .buttonStyle(.bordered).accessibilityLabel("Move unit \(u.name) up")
            Button { store.update(shiftID) { $0.moveUnit(u.id, by: 1) } } label: { Image(systemName: "arrow.down") }
                .buttonStyle(.bordered).accessibilityLabel("Move unit \(u.name) down")
            Button(u.retired ? "Restore" : "Remove") {
                store.update(shiftID) { s in if let i = s.unitIndex(u.id) { s.units[i].retired.toggle() } }
            }
            .buttonStyle(.bordered)
        }
        .frame(minHeight: 52)
    }
}

// MARK: - Handwriting (PencilKit)

enum InkLayout {
    /// Fixed logical page in document coordinates; ink never depends on screen size or rotation.
    static let width: CGFloat = 1024
    static let pageHeight: CGFloat = 768
}

enum InkToolKind { case pen, eraser, lasso }

final class InkController: ObservableObject {
    weak var canvas: PKCanvasView?
    @Published var fingerDraw = false
    @Published var pageCount = 1
    @Published var erasedDrawing: PKDrawing?
    @Published var tool: InkToolKind = .pen
    var onChange: ((PKDrawing) -> Void)?

    func setTool(_ k: InkToolKind) {
        tool = k
        guard let c = canvas else { return }
        switch k {
        case .pen: c.tool = PKInkingTool(.pen, color: .black, width: 4)
        case .eraser: c.tool = PKEraserTool(.vector)
        case .lasso: c.tool = PKLassoTool()
        }
    }

    func undo() { canvas?.undoManager?.undo() }
    func redo() { canvas?.undoManager?.redo() }

    func eraseAll() {
        guard let c = canvas else { return }
        erasedDrawing = c.drawing
        c.drawing = PKDrawing()
        onChange?(c.drawing)
    }

    func restoreErased() {
        guard let c = canvas, let d = erasedDrawing else { return }
        c.drawing = d
        erasedDrawing = nil
        onChange?(d)
    }

    func fitWidth() {
        guard let c = canvas, c.bounds.width > 0 else { return }
        let s = c.bounds.width / InkLayout.width
        c.minimumZoomScale = min(s, 0.5)
        c.maximumZoomScale = max(s * 3, 3)
        c.setZoomScale(s, animated: false)
    }

    func scrollPage(_ delta: Int) {
        guard let c = canvas else { return }
        let step = c.bounds.height * 0.85 * CGFloat(delta)
        let maxY = max(0, c.contentSize.height - c.bounds.height)
        let y = min(max(0, c.contentOffset.y + step), maxY)
        c.setContentOffset(CGPoint(x: c.contentOffset.x, y: y), animated: true)
    }
}

struct InkCanvas: UIViewRepresentable {
    let initial: PKDrawing
    let readOnly: Bool
    @ObservedObject var controller: InkController

    func makeCoordinator() -> InkCoordinator { InkCoordinator(controller: controller) }

    func makeUIView(context: Context) -> PKCanvasView {
        let c = PKCanvasView()
        c.overrideUserInterfaceStyle = .light      // stable paper and ink colours in dark mode
        c.backgroundColor = .white
        c.isOpaque = true
        c.drawing = initial
        c.delegate = context.coordinator
        c.tool = PKInkingTool(.pen, color: .black, width: 4)
        c.drawingPolicy = controller.fingerDraw ? .anyInput : .pencilOnly
        c.drawingGestureRecognizer.isEnabled = !readOnly
        c.minimumZoomScale = 0.25
        c.maximumZoomScale = 4
        c.alwaysBounceVertical = true
        c.accessibilityLabel = "Handwriting canvas"
        controller.canvas = c
        let coordinator = context.coordinator
        coordinator.layout(c)
        if !readOnly {
            let picker = PKToolPicker()
            coordinator.picker = picker
            picker.addObserver(c)
            picker.setVisible(true, forFirstResponder: c)
        }
        let ctl = controller
        DispatchQueue.main.async {
            ctl.fitWidth()
            coordinator.layout(c)
            if !readOnly { c.becomeFirstResponder() }
        }
        return c
    }

    func updateUIView(_ c: PKCanvasView, context: Context) {
        c.drawingPolicy = controller.fingerDraw ? .anyInput : .pencilOnly
        context.coordinator.layout(c)
    }

    static func dismantleUIView(_ c: PKCanvasView, coordinator: InkCoordinator) {
        coordinator.picker?.setVisible(false, forFirstResponder: c)
        coordinator.picker?.removeObserver(c)
        c.resignFirstResponder()
    }
}

final class InkCoordinator: NSObject, PKCanvasViewDelegate {
    let controller: InkController
    var picker: PKToolPicker?
    var separators: [UIView] = []

    init(controller: InkController) { self.controller = controller }

    func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
        controller.onChange?(canvasView.drawing)
    }

    func scrollViewDidZoom(_ scrollView: UIScrollView) {
        if let c = scrollView as? PKCanvasView { layout(c) }
    }

    /// Content size follows the fixed logical page × zoom; page breaks are drawn as thin guides.
    func layout(_ c: PKCanvasView) {
        let z = c.zoomScale
        let pages = max(1, controller.pageCount)
        let size = CGSize(width: InkLayout.width * z, height: InkLayout.pageHeight * CGFloat(pages) * z)
        if c.contentSize != size { c.contentSize = size }
        while separators.count < pages - 1 {
            let v = UIView()
            v.backgroundColor = UIColor.systemBlue.withAlphaComponent(0.35)
            v.isUserInteractionEnabled = false
            c.insertSubview(v, at: 0)
            separators.append(v)
        }
        while separators.count > pages - 1 { separators.removeLast().removeFromSuperview() }
        for (i, v) in separators.enumerated() {
            v.frame = CGRect(x: 0, y: InkLayout.pageHeight * CGFloat(i + 1) * z - 1, width: size.width, height: 2)
        }
    }
}

struct HandwritingEditor: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    let target: InkTarget
    let readOnly: Bool
    @StateObject private var controller = InkController()
    @State private var initial: PKDrawing?
    @State private var loadError: String?
    @State private var confirmErase = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if !readOnly && loadError == nil { controls }
                Divider()
                if let loadError {
                    VStack(spacing: 12) {
                        Text("Handwriting Could Not Be Read").font(.heading(.title2))
                        Text(loadError)
                        Text("The stored data has not been changed. It is still included in backups.").font(.footnote)
                    }
                    .padding().frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let initial {
                    InkCanvas(initial: initial, readOnly: readOnly, controller: controller)
                        .id(target.id)
                } else {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                Text(controller.fingerDraw
                     ? "Finger Draw is on: one finger writes; use two fingers to scroll or zoom, or the Page Up / Page Down buttons. Handwriting is kept as an attachment and is never read or turned into statuses, times or counts."
                     : "Apple Pencil writes; fingers scroll and zoom. Turn on Finger Draw to write without a Pencil. Handwriting is kept as an attachment and is never read or turned into statuses, times or counts.")
                    .font(.footnote).foregroundStyle(.secondary).padding(8)
            }
            .navigationTitle(target.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .status) { SaveStatusView() }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { store.flush(); dismiss() }.accessibilityLabel("Done, close handwriting")
                }
            }
        }
        .task { load() }
        .confirmationDialog("Erase all handwriting on every page of this attachment?", isPresented: $confirmErase,
                            titleVisibility: .visible) {
            Button("Erase All", role: .destructive) { controller.eraseAll() }
        }
    }

    var controls: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 128), spacing: 8)], spacing: 8) {
            toolButton("Pen", "pencil.tip", .pen)
            toolButton("Eraser", "eraser", .eraser)
            toolButton("Lasso", "lasso", .lasso)
            Button { controller.undo() } label: { cell("Undo", "arrow.uturn.backward") }.buttonStyle(.bordered)
            Button { controller.redo() } label: { cell("Redo", "arrow.uturn.forward") }.buttonStyle(.bordered)
            Button {
                controller.pageCount += 1
                if let c = controller.canvas { store.saveInk(target, drawing: c.drawing, pageCount: controller.pageCount) }
            } label: { cell("Add Writing Page", "doc.badge.plus") }.buttonStyle(.bordered)
            Button { controller.fingerDraw.toggle() } label: {
                cell(controller.fingerDraw ? "Finger Draw: On" : "Finger Draw: Off", "hand.draw")
            }
            .buttonStyle(.borderedProminent).tint(controller.fingerDraw ? Theme.navy : Color.gray)
            Group {
            Button { controller.scrollPage(-1) } label: { cell("Page Up", "chevron.up") }.buttonStyle(.bordered)
            Button { controller.scrollPage(1) } label: { cell("Page Down", "chevron.down") }.buttonStyle(.bordered)
            Button { controller.fitWidth() } label: { cell("Fit Width", "arrow.left.and.right") }.buttonStyle(.bordered)
            if controller.erasedDrawing != nil {
                Button { controller.restoreErased() } label: { cell("Undo Erase All", "arrow.uturn.backward.circle") }
                    .buttonStyle(.borderedProminent).tint(Theme.navy)
            } else {
                Button(role: .destructive) { confirmErase = true } label: { cell("Erase All…", "trash") }.buttonStyle(.bordered)
            }
            }
        }
        .padding(8)
    }

    func toolButton(_ title: String, _ icon: String, _ kind: InkToolKind) -> some View {
        Button { controller.setTool(kind) } label: { cell(title, icon) }
            .buttonStyle(.borderedProminent)
            .tint(controller.tool == kind ? Theme.navy : Color.gray)
            .accessibilityAddTraits(controller.tool == kind ? .isSelected : [])
    }

    func cell(_ title: String, _ icon: String) -> some View {
        Label(title, systemImage: icon).font(.subheadline.bold()).frame(maxWidth: .infinity, minHeight: 44)
    }

    func load() {
        guard initial == nil, loadError == nil else { return }
        if let att = store.ink(target) {
            do {
                initial = try PKDrawing(data: att.drawing)
                controller.pageCount = max(1, att.pageCount)
            } catch {
                loadError = "This handwriting attachment is damaged or unreadable."
                return
            }
        } else {
            initial = PKDrawing()
        }
        guard !readOnly else { return }
        let s = store
        let t = target
        let ctl = controller
        ctl.onChange = { [weak s, weak ctl] d in
            guard let s, let ctl else { return }
            s.saveInk(t, drawing: d, pageCount: ctl.pageCount)
        }
    }
}

// MARK: - Export (PDF from a saved snapshot, plus editable backup)

enum ExportKind: String, CaseIterable, Identifiable {
    case summary, full
    var id: String { rawValue }
    var label: String { self == .summary ? "Shift Summary" : "Full Detail" }
}

enum ExportFiles {
    static func write(_ data: Data, name: String) throws -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("SumterExports", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent(name)
        if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
        try data.write(to: url, options: [.atomic, .completeFileProtection])
        return url
    }

    static func safe(_ s: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-"))
        let mapped = s.unicodeScalars.map { allowed.contains($0) ? Character($0) : "-" }
        return String(mapped)
    }

    static func baseName(_ s: ShiftRecord) -> String {
        let label = s.shiftLabel.trimmed.isEmpty ? "" : "-\(safe(s.shiftLabel.trimmed))"
        return "Sumter-\(s.isTraining ? "TRAINING-" : "")Shift-\(TimeFormat.fileDay(s.operationalDate, tz: s.timeZone))\(label)"
    }
}

struct PDFPreview: UIViewRepresentable {
    let url: URL
    func makeUIView(context: Context) -> PDFView {
        let v = PDFView()
        v.autoScales = true
        v.document = PDFDocument(url: url)
        return v
    }
    func updateUIView(_ v: PDFView, context: Context) {
        if v.document?.documentURL != url { v.document = PDFDocument(url: url) }
    }
}

struct ExportSheet: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    let snapshot: ShiftRecord
    @State private var kind: ExportKind = .summary
    @State private var pdfURL: URL?
    @State private var backupURL: URL?
    @State private var errorText: String?

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                Text("Exports contain operational information. Share or store them only as your agency's policy allows. Nothing is sent anywhere unless you choose to share it.")
                    .font(.footnote).foregroundStyle(.secondary)
                Picker("Report", selection: $kind) {
                    ForEach(ExportKind.allCases) { k in Text(k.label).tag(k) }
                }
                .pickerStyle(.segmented)
                .onChange(of: kind) { _ in pdfURL = nil }
                HStack(spacing: 12) {
                    Button { generatePDF() } label: { BigButtonLabel(title: "Generate PDF Preview", systemImage: "doc.richtext") }
                        .buttonStyle(.borderedProminent).tint(Theme.navy)
                    if let pdfURL {
                        ShareLink(item: pdfURL) { BigButtonLabel(title: "Share or Save PDF…", systemImage: "square.and.arrow.up") }
                            .buttonStyle(.bordered)
                    }
                }
                if let errorText { Text(errorText).foregroundStyle(Theme.brick) }
                if let pdfURL {
                    PDFPreview(url: pdfURL)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .border(Color.secondary.opacity(0.4))
                } else {
                    Text("Generate a preview to check the pages before sharing.")
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                Divider()
                HStack(spacing: 12) {
                    Button { makeBackup() } label: { BigButtonLabel(title: "Create Editable Backup File", systemImage: "externaldrive") }
                        .buttonStyle(.bordered)
                    if let backupURL {
                        ShareLink(item: backupURL) { BigButtonLabel(title: "Share or Save Backup…", systemImage: "square.and.arrow.up") }
                            .buttonStyle(.bordered)
                    }
                }
            }
            .padding()
            .navigationTitle("Export — \(snapshot.title)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
    }

    func generatePDF() {
        let data = ShiftPDF.make(snapshot, kind: kind, generatedAt: Date())
        do {
            pdfURL = try ExportFiles.write(data, name: "\(ExportFiles.baseName(snapshot))-\(kind == .summary ? "Summary" : "Full-Detail").pdf")
            errorText = nil
        } catch {
            errorText = "The PDF could not be written: \(error.localizedDescription)"
        }
    }

    func makeBackup() {
        do {
            let data = try Backup.encode(snapshot, exportedAt: Date())
            backupURL = try ExportFiles.write(data, name: "\(ExportFiles.baseName(snapshot))-backup.json")
            errorText = nil
        } catch {
            errorText = "The backup could not be written: \(error.localizedDescription)"
        }
    }
}

enum ShiftPDF {
    /// Two passes: the first counts pages so every page can say "Page n of N".
    static func make(_ s: ShiftRecord, kind: ExportKind, generatedAt: Date) -> Data {
        let first = render(s, kind: kind, generatedAt: generatedAt, totalPages: 0)
        return render(s, kind: kind, generatedAt: generatedAt, totalPages: first.pages).data
    }

    static func render(_ s: ShiftRecord, kind: ExportKind, generatedAt: Date, totalPages: Int) -> (data: Data, pages: Int) {
        let format = UIGraphicsPDFRendererFormat()
        format.documentInfo = [kCGPDFContextTitle as String: "Sumter EMS Shift Board — \(s.title)",
                               kCGPDFContextCreator as String: "Sumter EMS Command"]
        let renderer = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 792, height: 612), format: format)
        var pages = 0
        let data = renderer.pdfData { ctx in
            let c = PDFComposer(ctx: ctx, shift: s, kind: kind, generatedAt: generatedAt, totalPages: totalPages)
            c.compose()
            pages = c.pageNumber
        }
        return (data, pages)
    }
}

final class PDFComposer {
    let ctx: UIGraphicsPDFRendererContext
    let s: ShiftRecord
    let kind: ExportKind
    let generatedAt: Date
    let totalPages: Int
    let pageRect = CGRect(x: 0, y: 0, width: 792, height: 612)
    let margin: CGFloat = 30
    var y: CGFloat = 0
    var pageNumber = 0
    var continuedHeader: (() -> Void)?
    var continuations: [(title: String, text: String)] = []
    var continuationKeys = Set<String>()

    let bodyFont = UIFont.systemFont(ofSize: 10)
    let boldFont = UIFont.systemFont(ofSize: 10, weight: .semibold)
    let headFont = UIFont.systemFont(ofSize: 10, weight: .bold, width: .condensed)
    let barFont = UIFont.systemFont(ofSize: 14, weight: .bold, width: .condensed)
    let smallFont = UIFont.systemFont(ofSize: 8)

    init(ctx: UIGraphicsPDFRendererContext, shift: ShiftRecord, kind: ExportKind, generatedAt: Date, totalPages: Int) {
        self.ctx = ctx
        self.s = shift
        self.kind = kind
        self.generatedAt = generatedAt
        self.totalPages = totalPages
    }

    var tz: TimeZone { s.timeZone }
    var contentTop: CGFloat { margin + 42 }
    var bottom: CGFloat { pageRect.height - margin - 14 }
    var contentWidth: CGFloat { pageRect.width - margin * 2 }

    func clock(_ d: Date?) -> String { TimeFormat.clock(d, tz: tz, ref: s.operationalDate) }

    // Drawing primitives

    func textHeight(_ text: String, _ font: UIFont, _ width: CGFloat) -> CGFloat {
        let r = (text as NSString).boundingRect(with: CGSize(width: max(width, 1), height: .greatestFiniteMagnitude),
                                                options: [.usesLineFragmentOrigin, .usesFontLeading],
                                                attributes: [.font: font], context: nil)
        return ceil(r.height)
    }

    func drawText(_ text: String, _ font: UIFont, _ color: UIColor, _ rect: CGRect,
                  align: NSTextAlignment = .left) {
        let p = NSMutableParagraphStyle()
        p.alignment = align
        p.lineBreakMode = .byWordWrapping
        (text as NSString).draw(with: rect, options: [.usesLineFragmentOrigin, .usesFontLeading],
                                attributes: [.font: font, .foregroundColor: color, .paragraphStyle: p], context: nil)
    }

    func newPage() {
        ctx.beginPage()
        pageNumber += 1
        chrome()
        y = contentTop
        continuedHeader?()
    }

    func chrome() {
        let bar = CGRect(x: margin, y: margin - 12, width: contentWidth, height: 22)
        Theme.uiNavy.setFill()
        UIRectFill(bar)
        drawText("SUMTER COUNTY EMS — SHIFT COMMAND BOARD", barFont, .white, bar.insetBy(dx: 8, dy: 3))
        drawText(kind.label.uppercased() + (s.isTraining ? " · TRAINING" : ""), barFont, .white,
                 bar.insetBy(dx: 8, dy: 3), align: .right)
        let ident = "\(TimeFormat.day(s.operationalDate, tz: tz)) · Shift \(s.shiftLabel.orDash) · Supervisor \(s.supervisor.orDash) · Sheet \(s.sheetRef.orDash)"
        drawText(String(ident.prefix(150)), boldFont, Theme.uiNavy, CGRect(x: margin, y: bar.maxY + 4, width: contentWidth, height: 14))
        let trainingPrefix: String = s.isTraining ? "TRAINING — FICTITIOUS DATA · " : ""
        let ofTotal: String = totalPages > 0 ? " of \(totalPages)" : ""
        let generated: String = TimeFormat.full(generatedAt, tz: tz)
        let foot = "\(trainingPrefix)Page \(pageNumber)\(ofTotal) · Generated \(generated) · Times in \(s.timeZoneID), 24-hour · — = not recorded"
        drawText(foot, smallFont, .darkGray, CGRect(x: margin, y: pageRect.height - margin - 4, width: contentWidth, height: 12))
    }

    func sectionBar(_ title: String) {
        if y + 60 > bottom { newPage() }
        let r = CGRect(x: margin, y: y, width: contentWidth, height: 18)
        Theme.uiNavy.setFill()
        UIRectFill(r)
        drawText(title.uppercased(), headFont, .white, r.insetBy(dx: 6, dy: 3))
        y += 22
    }

    /// Long entries are shortened in tables and printed in full under "Continued Text". Nothing is dropped.
    func cell(_ text: String, _ ref: String, limit: Int = 320) -> String {
        let t = text.trimmed
        if t.isEmpty { return "—" }
        if t.count <= limit { return t }
        if continuationKeys.insert(ref).inserted { continuations.append((ref, t)) }
        return String(t.prefix(limit - 70)) + "… [continued: \(ref)]"
    }

    func table(_ title: String, _ columns: [(String, CGFloat)], _ rows: [[String]], empty: String = "None recorded.") {
        sectionBar(title)
        if rows.isEmpty {
            drawText(empty, bodyFont, .darkGray, CGRect(x: margin, y: y, width: contentWidth, height: 14))
            y += 22
            return
        }
        let widths = columns.map { $0.1 * contentWidth }
        let drawHeader: () -> Void = { [unowned self] in
            let h = (columns.enumerated().map { self.textHeight($0.element.0, self.headFont, widths[$0.offset] - 6) }.max() ?? 12) + 6
            Theme.uiBrick.setFill()
            UIRectFill(CGRect(x: self.margin, y: self.y, width: self.contentWidth, height: h))
            var x = self.margin
            for (i, col) in columns.enumerated() {
                self.drawText(col.0, self.headFont, .white, CGRect(x: x + 3, y: self.y + 3, width: widths[i] - 6, height: h - 6))
                x += widths[i]
            }
            self.y += h
        }
        drawHeader()
        continuedHeader = { [unowned self] in
            self.drawText("\(title) (continued)", self.boldFont, Theme.uiNavy,
                          CGRect(x: self.margin, y: self.y, width: self.contentWidth, height: 14))
            self.y += 16
            drawHeader()
        }
        for (n, raw) in rows.enumerated() {
            let row = raw + Array(repeating: "", count: max(0, columns.count - raw.count))
            let h = (widths.indices.map { textHeight(row[$0], bodyFont, widths[$0] - 6) }.max() ?? 12) + 6
            if y + h > bottom { newPage() }
            if n % 2 == 1 {
                Theme.uiRow.setFill()
                UIRectFill(CGRect(x: margin, y: y, width: contentWidth, height: h))
            }
            var x = margin
            for i in widths.indices {
                drawText(row[i], bodyFont, .black, CGRect(x: x + 3, y: y + 3, width: widths[i] - 6, height: h - 4))
                x += widths[i]
            }
            UIColor(white: 0.75, alpha: 1).setFill()
            UIRectFill(CGRect(x: margin, y: y + h - 0.5, width: contentWidth, height: 0.5))
            y += h
        }
        continuedHeader = nil
        y += 12
    }

    /// Text of any length, split across as many pages as needed.
    func flowing(_ text: String, title: String) {
        let para = NSMutableParagraphStyle()
        para.lineBreakMode = .byWordWrapping
        let attr = NSAttributedString(string: text.isEmpty ? "—" : text,
                                      attributes: [.font: bodyFont, .paragraphStyle: para])
        let setter = CTFramesetterCreateWithAttributedString(attr as CFAttributedString)
        var start = 0
        let total = attr.length
        while start < total {
            if bottom - y < 30 { newPage() }
            if start > 0 {
                drawText("\(title) (continued)", boldFont, Theme.uiNavy, CGRect(x: margin, y: y, width: contentWidth, height: 14))
                y += 16
            }
            let avail = CGRect(x: margin, y: y, width: contentWidth, height: bottom - y)
            guard let cg = UIGraphicsGetCurrentContext() else { return }
            cg.saveGState()
            cg.textMatrix = .identity
            cg.translateBy(x: 0, y: pageRect.height)
            cg.scaleBy(x: 1, y: -1)
            let pathRect = CGRect(x: avail.minX, y: pageRect.height - avail.maxY, width: avail.width, height: avail.height)
            let frame = CTFramesetterCreateFrame(setter, CFRange(location: start, length: 0),
                                                 CGPath(rect: pathRect, transform: nil), nil)
            CTFrameDraw(frame, cg)
            cg.restoreGState()
            let visible = CTFrameGetVisibleStringRange(frame)
            if visible.length <= 0 {
                if y <= contentTop + 20 { return }   // cannot fit even on a fresh page
                newPage()
                continue
            }
            let used = CTFramesetterSuggestFrameSizeWithConstraints(setter, visible, nil,
                                                                    CGSize(width: avail.width, height: .greatestFiniteMagnitude), nil)
            start += visible.length
            if start < total { newPage() } else { y += ceil(used.height) + 10 }
        }
    }

    // Content

    func compose() {
        newPage()
        identitySection()
        systemSection()
        unitsSection()
        runTimesSection()
        pendingSection()
        if kind == .full {
            allRunsSection()
            historySection()
        }
        continuationSection()
        inkSections()
    }

    func identitySection() {
        table("Shift", [("Field", 0.22), ("Value", 0.78)], [
            ["Date", TimeFormat.day(s.operationalDate, tz: tz)],
            ["Shift", cell(s.shiftLabel, "Shift label")],
            ["Supervisor", cell(s.supervisor, "Supervisor")],
            ["Sheet", cell(s.sheetRef, "Sheet")],
            ["Operational time zone", s.timeZoneID],
            ["Record type", s.isTraining ? "TRAINING — fictitious data" : "Operational"],
            ["State", s.isReadOnly ? "Archived (read-only) \(TimeFormat.full(s.archivedAt, tz: tz))" : "Active"],
            ["Provenance", s.provenance ?? "Created on this iPad"],
        ])
    }

    func systemSection() {
        let c = BoardCounts.of(s.units)
        let sys = s.system
        var notes = cell(sys.onDutyNotes, "On-Duty Notes")
        if let m = sys.onDutyNotesInherited {
            notes += m.reviewed ? " (carried forward, reviewed)" : " (carried forward from \(TimeFormat.day(m.fromDate, tz: tz)), NOT reviewed)"
        }
        table("System Status", [("Item", 0.24), ("Value", 0.5), ("Updated", 0.26)], [
            ["Trucks in Service", "\(c.inService)", "Calculated"],
            ["Available Now (AVL)", "\(c.available)", "Calculated"],
            ["Status Unknown (on duty)", "\(c.unknown)", "Calculated"],
            ["Out of Service (on duty)", "\(c.oos)", "Calculated"],
            ["On Duty / Not on Duty", "\(c.onDuty) / \(c.offDuty)", "Calculated"],
            ["Status Level", cell(sys.statusLevel, "Status Level"), TimeFormat.full(sys.statusLevelUpdatedAt, tz: tz)],
            ["Weather", cell(sys.weather, "Weather"), TimeFormat.full(sys.weatherUpdatedAt, tz: tz)],
            ["Hospital Divert", cell(sys.hospitalDivert, "Hospital Divert"), TimeFormat.full(sys.hospitalDivertUpdatedAt, tz: tz)],
            ["On-Duty Notes", notes, "—"],
        ])
        flowing("Counting rules: " + BoardCounts.definition, title: "Counting rules")
    }

    func natureDest(_ run: CallRecord?, _ ref: String) -> String {
        guard let run else { return "—" }
        var t = "\(run.nature.orDash) / \(run.destination.orDash)"
        if !run.location.trimmed.isEmpty { t += "\nLocation: \(run.location)" }
        return cell(t, ref)
    }

    func unitsSection() {
        var rows: [[String]] = []
        for st in s.orderedStations {
            for u in s.stationUnits(st.id, includeRetired: true) {
                let run = s.activeCall(for: u.id)
                var crew = cell(u.crew, "Unit \(u.name) crew")
                if let m = u.crewInherited, !m.reviewed { crew += " (inherited, not reviewed)" }
                rows.append([
                    "\(st.number) / \(st.name)",
                    u.name,
                    "\(u.status.abbr)\n\(u.status.fullName)",
                    u.retired ? "Removed" : (u.onDuty ? "Yes" : "No"),
                    crew,
                    run.map { $0.runNumber.orDash } ?? "No run",
                    run?.priority.short ?? "—",
                    run?.determinant.short ?? "—",
                    natureDest(run, "Unit \(u.name) nature/destination"),
                    cell(u.notes, "Unit \(u.name) notes"),
                ])
            }
        }
        table("Units", [("Station", 0.09), ("Unit", 0.06), ("Status", 0.09), ("On Duty", 0.05), ("Crew", 0.14),
                        ("Run #", 0.07), ("Pri", 0.05), ("Det", 0.07), ("Nature / Destination", 0.21), ("Notes", 0.17)], rows)
    }

    func runTimesSection() {
        var rows: [[String]] = []
        for u in s.orderedUnits {
            guard let run = s.activeCall(for: u.id) else { continue }
            var r: [String] = ["Unit \(u.name)", run.runNumber.orDash]
            r += Milestone.allCases.map { clock(run.time($0)) }
            r.append(cell(run.notes, "Unit \(u.name) run \(run.runNumber.orDash) notes"))
            rows.append(r)
        }
        table("Current Run Times", [("Unit", 0.08), ("Run #", 0.08), ("Dispatched", 0.09), ("En Route", 0.09),
                                    ("On Scene", 0.09), ("Transporting", 0.09), ("At Hospital", 0.09), ("Clear", 0.09),
                                    ("Run Notes", 0.30)], rows, empty: "No active runs.")
    }

    func pendingSection() {
        let rows: [[String]] = s.pending.sorted { $0.createdAt < $1.createdAt }.map { p in
            let assigned = p.assignedCallIDs.compactMap { cid in
                s.calls.first { $0.id == cid }.flatMap { s.unit($0.unitID)?.name }
            }
            let held: String
            if p.state == .pending, let t = p.timeIn { held = TimeFormat.elapsed(from: t, to: generatedAt) }
            else if p.state == .pending { held = "Unknown" }
            else { held = "—" }
            return [clock(p.timeIn), held, p.runNumber.orDash, p.priority.short, p.determinant.short,
                    cell(p.nature, "Holding call \(p.runNumber.orDash) nature"),
                    cell(p.location, "Holding call \(p.runNumber.orDash) location"),
                    assigned.isEmpty ? "—" : assigned.joined(separator: ", "),
                    p.state.label,
                    cell(p.statusNotes, "Holding call \(p.runNumber.orDash) status/notes")]
        }
        table("Calls Holding / Pending", [("Time In", 0.09), ("Holding", 0.08), ("Run #", 0.07), ("Pri", 0.05),
                                          ("Det", 0.07), ("Nature", 0.16), ("Location", 0.14), ("Assign Unit", 0.09),
                                          ("State", 0.07), ("Status / Notes", 0.18)], rows, empty: "No calls holding.")
    }

    func allRunsSection() {
        var rows: [[String]] = []
        for u in s.orderedUnits + s.units.filter({ $0.retired }) {
            for r in s.runs(for: u.id) {
                var row: [String] = [u.name, r.runNumber.orDash, r.priority.short, r.determinant.short,
                           cell(r.nature, "Unit \(u.name) run \(r.runNumber.orDash) nature"),
                           cell(r.location, "Unit \(u.name) run \(r.runNumber.orDash) location"),
                           cell(r.destination, "Unit \(u.name) run \(r.runNumber.orDash) destination")]
                row += Milestone.allCases.map { clock(r.time($0)) }
                row.append(r.isOpen ? "Open" : "Closed \(clock(r.closedAt))")
                rows.append(row)
                if !r.notes.trimmed.isEmpty {
                    let ref = "Unit \(u.name) run \(r.runNumber.orDash) notes (opened \(clock(r.openedAt)))"
                    if continuationKeys.insert(ref).inserted { continuations.append((ref, r.notes.trimmed)) }
                }
            }
        }
        table("All Runs This Shift", [("Unit", 0.06), ("Run #", 0.07), ("Pri", 0.04), ("Det", 0.06), ("Nature", 0.12),
                                      ("Location", 0.10), ("Destination", 0.10), ("Disp", 0.065), ("EnR", 0.065),
                                      ("OnS", 0.065), ("Trn", 0.065), ("Hos", 0.065), ("Clr", 0.065), ("Run", 0.06)],
              rows, empty: "No runs recorded.")
    }

    func historySection() {
        let rows = s.events.sorted { $0.recordedAt < $1.recordedAt }.map { e in
            [TimeFormat.full(e.recordedAt, tz: tz), TimeFormat.full(e.effectiveAt, tz: tz), s.recordLabel(e.recordID),
             cell(s.describe(e), "History entry \(e.id.uuidString.prefix(8))"), e.initials.orDash]
        }
        table("History", [("Recorded", 0.16), ("Effective", 0.16), ("Record", 0.14), ("Change", 0.46), ("Initials", 0.08)],
              rows, empty: "No history.")
    }

    func continuationSection() {
        guard !continuations.isEmpty else { return }
        sectionBar("Continued Text (full entries)")
        for item in continuations {
            if y + 40 > bottom { newPage() }
            drawText(item.title, boldFont, Theme.uiNavy, CGRect(x: margin, y: y, width: contentWidth, height: 14))
            y += 16
            flowing(item.text, title: item.title)
        }
    }

    func inkTitle(_ ink: InkAttachment) -> String {
        let fields: [String: String] = ["crew": "Crew", "unitNotes": "Unit Notes", "runNotes": "Run Notes",
                      "pendingNotes": "Status / Notes", "onDutyNotes": "On-Duty Notes"]
        let field = fields[ink.fieldID] ?? ink.fieldID
        if ink.recordID == s.id { return "System — \(field)" }
        return "\(s.recordLabel(ink.recordID)) — \(field)"
    }

    func inkSections() {
        for ink in s.inks.sorted(by: { inkTitle($0) < inkTitle($1) }) {
            let title = inkTitle(ink)
            let drawing: PKDrawing
            do {
                drawing = try PKDrawing(data: ink.drawing)
            } catch {
                sectionBar("\(title) — handwriting")
                drawText("This handwriting attachment could not be read. It is preserved unchanged in backups.",
                         bodyFont, .black, CGRect(x: margin, y: y, width: contentWidth, height: 14))
                y += 20
                continue
            }
            if drawing.strokes.isEmpty { continue }
            let w = CGFloat(ink.canvasWidth)
            let pageH = CGFloat(ink.pageHeight)
            let pages = max(ink.pageCount, Int(ceil(drawing.bounds.maxY / pageH)))
            for p in 0..<pages {
                newPage()
                sectionBar("\(title) — handwriting page \(p + 1) of \(pages)")
                let src = CGRect(x: 0, y: CGFloat(p) * pageH, width: w, height: pageH)
                var image = UIImage()
                UITraitCollection(userInterfaceStyle: .light).performAsCurrent {
                    image = drawing.image(from: src, scale: 2)
                }
                let availH = bottom - y
                let scale = min(contentWidth / w, availH / pageH)
                let dest = CGRect(x: margin + (contentWidth - w * scale) / 2, y: y, width: w * scale, height: pageH * scale)
                UIColor.white.setFill()
                UIRectFill(dest)
                image.draw(in: dest)
                UIColor.gray.setStroke()
                UIBezierPath(rect: dest).stroke()
                y = dest.maxY + 8
            }
        }
    }
}

// MARK: - Settings and built-in checks

struct SettingsView: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    @State private var tzText = ""
    @State private var tzMessage: String?
    @State private var results: [CheckResult] = []

    var body: some View {
        NavigationStack {
            Form {
                Section("Operational time zone for new shifts") {
                    Text("Current: \(store.data.settings.defaultTimeZoneID)")
                    TextField("e.g. America/New_York", text: $tzText)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button("Apply") {
                        if let tz = TimeZone(identifier: tzText.trimmed) {
                            store.updateSettings { $0.defaultTimeZoneID = tz.identifier }
                            tzMessage = "New shifts will use \(tz.identifier). Existing shifts keep their own zone."
                        } else {
                            tzMessage = "Not a recognised time zone identifier."
                        }
                    }
                    if let tzMessage { Text(tzMessage).font(.footnote) }
                }
                Section {
                    TextField("Initials (optional)", text: Binding(get: { store.data.settings.initials },
                                                                   set: { v in store.updateSettings(debounce: true) { $0.initials = v } }))
                } header: { Text("Initials label") } footer: {
                    Text("Added to history entries as a label. It is not a sign-in or proof of identity.")
                }
                Section("Screen") {
                    Toggle("Keep screen awake while a shift board is open",
                           isOn: Binding(get: { store.data.settings.keepAwake }, set: { v in store.updateSettings { $0.keepAwake = v } }))
                    Text("Only while this app is in front on a board. Passcode lock is not affected.").font(.footnote)
                }
                Section {
                    Button("Run Built-in Checks") { results = SelfChecks.run() }.frame(minHeight: 48)
                    if !results.isEmpty {
                        let passed = results.filter(\.passed).count
                        Text("\(passed) of \(results.count) passed").font(.headline)
                            .foregroundStyle(passed == results.count ? Color.green : Theme.brick)
                    }
                    ForEach(results) { r in
                        VStack(alignment: .leading, spacing: 2) {
                            Label(r.name, systemImage: r.passed ? "checkmark.circle.fill" : "xmark.octagon.fill")
                                .foregroundStyle(r.passed ? Color.green : Theme.brick)
                            if !r.detail.isEmpty { Text(r.detail).font(.footnote) }
                        }
                    }
                } header: { Text("Built-in checks") } footer: {
                    Text("These run the board's rules on throwaway fictitious data in memory. Your saved shifts are not touched.")
                }
                Section("About this data") {
                    Text("Stored only on this iPad, in this app's Documents folder, with iOS file protection (readable while the iPad is unlocked or the file is open). Nothing is sent over the network. iCloud or computer backups of the iPad may include this app's data, depending on your iPad's backup settings. Exports and backups contain operational information; handle them as your agency's policy requires. This is not a certified, HIPAA-validated or agency-approved system.")
                        .font(.footnote)
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { store.flush(); dismiss() } } }
        }
    }
}

struct CheckResult: Identifiable {
    let id = UUID()
    let name: String
    let passed: Bool
    let detail: String
}

enum SelfChecks {
    static func run() -> [CheckResult] {
        var out: [CheckResult] = []
        func check(_ name: String, _ conditions: Bool..., detail: String = "") {
            let ok = conditions.allSatisfy { $0 }
            out.append(CheckResult(name: name, passed: ok, detail: ok ? "" : detail))
        }
        let base = Date(timeIntervalSince1970: 1_793_000_000)
        func at(_ minutes: Double) -> Date { base.addingTimeInterval(minutes * 60) }

        var s = ShiftRecord.blank(now: base, tzID: "America/New_York", training: true)
        check("Roster seeded exactly (HQ 101–106, DALZELL 201–202, DABBS XRDS 401)", s.orderedUnits.map(\.name) == ["101", "102", "103", "104", "105", "106", "201", "202", "401"], s.orderedStations.map(\.name) == ["HQ", "DALZELL", "DABBS XRDS"])
        check("New units start Unknown and not on duty", s.units.allSatisfy { $0.status == .unknown && !$0.onDuty })
        check("Empty board counts nothing as in service", BoardCounts.of(s.units) == BoardCounts(offDuty: 9))

        let seededIDs = Dictionary(uniqueKeysWithValues: s.units.map { ($0.name, $0.id) })
        func uid(_ name: String) -> UUID { seededIDs[name]! }
        for n in ["101", "102", "103", "104", "201"] { s.setOnDuty(unitID: uid(n), true, now: base, initials: "") }
        s.setStatus(unitID: uid("101"), to: .avl, now: base, initials: "")
        s.setStatus(unitID: uid("102"), to: .enr, now: base, initials: "")
        s.setStatus(unitID: uid("103"), to: .oos, now: base, initials: "")
        s.setStatus(unitID: uid("201"), to: .clr, now: base, initials: "")
        s.setStatus(unitID: uid("105"), to: .avl, now: base, initials: "")   // not on duty
        let c = BoardCounts.of(s.units)
        check("Counts follow the stated definitions", c.onDuty == 5, c.inService == 3, c.available == 1, c.unknown == 1, c.oos == 1, c.offDuty == 4, detail: "Got onDuty \(c.onDuty), inService \(c.inService), available \(c.available), unknown \(c.unknown), oos \(c.oos)")

        // 401 isolation
        let before401 = s.units.filter { $0.name != "401" }
        s.setStatus(unitID: uid("401"), to: .scn, now: at(1), initials: "")
        if let i = s.unitIndex(uid("401")) { s.units[i].crew = "Changed crew"; s.units[i].notes = "Changed notes" }
        check("Updating unit 401 does not change any other unit", s.units.filter { $0.name != "401" } == before401)

        // Runs and stamping
        let u = uid("104")
        let run1 = s.startNewRun(unitID: u, replacing: nil, now: at(2), initials: "")
        check("Start Run creates a run", run1 != nil)
        let eventsBefore = s.events.count
        s.setStatus(unitID: u, to: .enr, now: at(3), initials: "")
        let again = s.setStatus(unitID: u, to: .enr, now: at(4), initials: "")
        let r1 = s.activeCall(for: u)!
        check("ENR stamps En Route once; a repeated tap changes nothing", again == nil, r1.time(.enRoute) == at(3), s.events.count == eventsBefore + 2)
        check("En Route never invents Dispatched", r1.time(.dispatched) == nil)
        s.setStatus(unitID: u, to: .scn, now: at(5), initials: "")
        s.setStatus(unitID: u, to: .trn, now: at(6), initials: "")
        s.setStatus(unitID: u, to: .scn, now: at(7), initials: "")
        check("Returning to SCN does not overwrite the existing On Scene time", s.activeCall(for: u)!.time(.onScene) == at(5))
        s.setStatus(unitID: u, to: .avl, now: at(8), initials: "")
        s.setStatus(unitID: u, to: .oos, now: at(9), initials: "")
        let r1b = s.activeCall(for: u)!
        check("AVL and OOS record no times", r1b.times.count == 3)

        // Undo
        let batch = s.setStatus(unitID: u, to: .hos, now: at(10), initials: "")!
        let undone = s.undo(batch: batch, now: at(11), initials: "")
        let undoneAgain = s.undo(batch: batch, now: at(12), initials: "")
        check("Undo restores status and clears only the stamped time, once", undone, !undoneAgain, s.unit(u)!.status == .oos, s.activeCall(for: u)!.time(.atHospital) == nil)
        check("Undo keeps the original entries and adds compensating ones", s.events.contains { $0.batchID == batch }, s.events.contains { $0.compensatesEventID != nil })

        // Now and corrections
        check("Now fills an empty time", s.stampIfEmpty(callID: run1!, milestone: .dispatched, now: at(1), initials: ""))
        check("Now never overwrites an existing time", !s.stampIfEmpty(callID: run1!, milestone: .dispatched, now: at(20), initials: ""))
        s.setTime(callID: run1!, milestone: .dispatched, to: at(2.5), now: at(21), initials: "", reason: "Radio log")
        let corr = s.events.last!
        check("Correction keeps the previous value in history", corr.action == "timeCorrected", corr.before == iso(at(1)), corr.after == iso(at(2.5)))
        s.setTime(callID: run1!, milestone: .clear, to: at(0), now: at(22), initials: "", reason: "Test")
        check("Out-of-order times are flagged, not fixed", !s.timeWarnings(s.activeCall(for: u)!, now: at(30)).isEmpty, s.activeCall(for: u)!.time(.clear) == at(0))

        // New Run
        let run2 = s.startNewRun(unitID: u, replacing: run1, now: at(23), initials: "")
        let dup = s.startNewRun(unitID: u, replacing: run1, now: at(23), initials: "")
        check("New Run keeps the prior run and starts with blank times", run2 != nil, dup == nil, s.runs(for: u).count == 2, s.activeCall(for: u)!.times.isEmpty, s.calls.first { $0.id == run1 }!.closedAt != nil, s.calls.first { $0.id == run1 }!.time(.enRoute) == at(3))

        // Midnight and daylight saving (US clocks fall back 2026-11-01 02:00 EDT)
        let ny = TimeZone(identifier: "America/New_York")!
        let edt = Date(timeIntervalSince1970: 1_793_511_000)  // 2026-11-01 05:30Z = 01:30 EDT
        let est = edt.addingTimeInterval(3600)                // 2026-11-01 06:30Z = 01:30 EST
        s.setTime(callID: run2!, milestone: .enRoute, to: edt, now: est, initials: "", reason: "DST test")
        s.setTime(callID: run2!, milestone: .onScene, to: est, now: est, initials: "", reason: "DST test")
        let r2 = s.calls.first { $0.id == run2 }!
        check("Repeated 01:30 hour keeps two distinct full timestamps", r2.time(.onScene)!.timeIntervalSince(r2.time(.enRoute)!) == 3600, TimeFormat.full(edt, tz: ny).hasSuffix("EDT"), TimeFormat.full(est, tz: ny).hasSuffix("EST"), detail: "\(TimeFormat.full(edt, tz: ny)) / \(TimeFormat.full(est, tz: ny))")
        let ref = TimeFormat.noonOfDay(containing: Date(timeIntervalSince1970: 1_793_462_400), tz: ny) // Oct 31
        check("Times after midnight show their date", TimeFormat.clock(edt, tz: ny, ref: ref).contains("11/01"), detail: TimeFormat.clock(edt, tz: ny, ref: ref))

        // Holding calls and assignment
        let p = s.addPending(now: at(30), initials: "")
        check("Unset Time In is unknown, not zero", s.pending.first { $0.id == p }!.timeIn == nil)
        let busy = s.assign(pendingID: p, unitID: uid("102"), overrideNote: "", closeExistingRun: false, now: at(31), initials: "")
        check("Busy unit needs a documented override", busy == .requiresOverrideNote)
        let ok = s.assign(pendingID: p, unitID: uid("102"), overrideNote: "Closest unit", closeExistingRun: false, now: at(31), initials: "")
        let twice = s.assign(pendingID: p, unitID: uid("102"), overrideNote: "Closest unit", closeExistingRun: false, now: at(31), initials: "")
        var run102: UUID?
        if case .assigned(let id) = ok { run102 = id }
        check("Assigning twice cannot duplicate", run102 != nil, twice == .alreadyAssigned)
        if let run102 { s.stampIfEmpty(callID: run102, milestone: .enRoute, now: at(33), initials: "") }
        let needsClose = s.assign(pendingID: p, unitID: u, overrideNote: "x", closeExistingRun: false, now: at(32), initials: "")
        check("A unit with an active run needs explicit resolution", needsClose == .requiresActiveRunResolution)
        _ = s.assign(pendingID: p, unitID: u, overrideNote: "Second unit", closeExistingRun: true, now: at(32), initials: "")
        let pc = s.pending.first { $0.id == p }!
        check("Several units link to one shared call; prior run kept", pc.assignedCallIDs.count == 2, pc.assignedCallIDs.allSatisfy { cid in s.calls.first { $0.id == cid }?.sharedCallID == p }, s.runs(for: u).count == 3)

        // Ink follows IDs through reordering
        let point = { (x: CGFloat, y: CGFloat) in
            PKStrokePoint(location: CGPoint(x: x, y: y), timeOffset: 0, size: CGSize(width: 4, height: 4),
                          opacity: 1, force: 1, azimuth: 0, altitude: .pi / 2)
        }
        let stroke = PKStroke(ink: PKInk(.pen, color: .black),
                              path: PKStrokePath(controlPoints: [point(10, 10), point(300, 900), point(600, 1300)], creationDate: base),
                              transform: .identity, mask: nil)
        let drawing = PKDrawing(strokes: [stroke])
        let u401 = uid("401")
        s.inks.append(InkAttachment(id: UUID(), recordID: u401, fieldID: "unitNotes", drawing: drawing.dataRepresentation(),
                                    pageCount: 2, canvasWidth: Double(InkLayout.width), pageHeight: Double(InkLayout.pageHeight),
                                    updatedAt: base))
        let st4 = s.units.first { $0.id == u401 }!.stationID
        s.addUnit(stationID: st4, name: "402")
        s.moveUnit(u401, by: 1)
        s.moveStation(st4, by: -2)
        check("Roster reordering cannot move unit 401's ink", s.ink(u401, "unitNotes") != nil, s.unit(u401)?.name == "401", s.inks.filter { $0.recordID != u401 }.isEmpty)

        // New shift carry-forward
        if let i = s.unitIndex(uid("101")) { s.units[i].crew = "TRAINING Medic A" }
        s.system.onDutyNotes = "Clinical-looking note that must not carry"
        var carry = CarryForward(roster: true, crew: true, systemNotes: false, transferCallIDs: Set([run102].compactMap { $0 }))
        carry.transferCallIDs.insert(UUID())   // unknown IDs are ignored
        let next = ShiftRecord.newShift(previous: s, carry: carry,
                                        header: ShiftHeader(date: base, label: "B", supervisor: "", sheet: ""),
                                        tzID: "America/New_York", training: true, initials: "", now: at(600))
        let moved = next.calls.first { $0.id == run102 }
        check("New shift: statuses Unknown, nobody on duty, no holding calls", next.units.allSatisfy { $0.status == .unknown && !$0.onDuty }, next.pending.isEmpty)
        check("Transferred run keeps its ID and original times; nothing else carried", next.calls.count == 1, moved?.time(.enRoute) == at(33), moved?.transferredFromShiftID == s.id, next.unit(uid("102"))?.activeCallID == run102)
        check("Inherited crew is marked for review; notes not carried unless chosen", next.unit(uid("101"))?.crewInherited?.reviewed == false, next.system.onDutyNotes.isEmpty)

        // 1,000-character note and overflow
        let long = String(repeating: "Long note text for pagination checks. ", count: 27) + "MARKER-END"
        if let i = s.unitIndex(uid("201")) { s.units[i].notes = long }
        check("1,000-character note stored in full", long.count >= 1000, s.unit(uid("201"))?.notes == long)
        for n in 0..<30 {
            let id = s.addPending(now: at(40 + Double(n)), initials: "")
            if let i = s.pendingIndex(id) {
                s.pending[i].nature = "Fictitious holding call \(n) with a longer description to wrap"
                s.pending[i].runNumber = "T-\(n)"
            }
        }
        if let i = s.pendingIndex(s.pending.last!.id) { s.pending[i].location = "LAST-ROW-MARKER" }

        // PDF content
        let pdfData = ShiftPDF.make(s, kind: .full, generatedAt: at(700))
        if let doc = PDFDocument(data: pdfData) {
            let text = doc.string ?? ""
            check("Full Detail PDF paginates", doc.pageCount >= 3, detail: "Pages: \(doc.pageCount)")
            check("PDF includes the end of the 1,000-character note", text.contains("MARKER-END"))
            check("PDF includes the last overflow holding call", text.contains("LAST-ROW-MARKER"))
            check("PDF includes both handwriting pages", text.contains("handwriting page 2 of 2"))
            check("PDF pages are numbered with a total", text.contains("of \(doc.pageCount)"))
        } else {
            check("Full Detail PDF opens", false, detail: "The generated PDF could not be read.")
        }

        // Backup round trip
        do {
            let data = try Backup.encode(s, exportedAt: at(800))
            let decoded = try Backup.decode(data)
            let problems = Backup.validate(decoded.shift)
            let copy = Backup.restoredCopy(decoded, now: at(801), initials: "")
            let copyProblems = Backup.validate(copy)
            check("Backup validates", problems.isEmpty, detail: problems.joined(separator: "; "))
            check("Restored copy has new IDs and is read-only", copy.id != s.id, copy.isReadOnly, Set(copy.units.map(\.id)).isDisjoint(with: Set(s.units.map(\.id))))
            check("Restored copy keeps every record and relationship", copyProblems.isEmpty, copy.units.count == s.units.count, copy.calls.count == s.calls.count, copy.pending.count == s.pending.count, copy.inks.count == s.inks.count, copy.units.first { $0.name == "201" }?.notes == long, BoardCounts.of(copy.units) == BoardCounts.of(s.units), detail: copyProblems.joined(separator: "; "))
            let copiedInk = copy.inks.first.flatMap { try? PKDrawing(data: $0.drawing) }
            check("Handwriting survives the round trip", copiedInk?.strokes.count == 1)
        } catch {
            check("Backup round trip", false, detail: "\(error)")
        }
        var rejected = false
        do { _ = try Backup.decode(Data("not a backup".utf8)) } catch { rejected = true }
        check("Unreadable backup is rejected without changes", rejected)

        return out
    }
}
