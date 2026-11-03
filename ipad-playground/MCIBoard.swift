// Sumter EMS Command — MCI Board (Swift Playgrounds edition)
//
// Paste this whole file over ContentView.swift in a new Swift Playgrounds "App".
// The template's MyApp.swift already shows ContentView(); this file defines it at the bottom.
//
// An offline incident command board: a manually maintained coordination record.
// It is not an ePCR, triage decision tool, dispatch system or hospital-capacity feed.
// One iPad is the working copy. Exports and backups are not live sharing.
// Nothing here claims NIMS/ICS compliance, agency adoption or medical approval.

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

// MARK: - Style

enum MCIStyle {
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
    static func mciHeading(_ style: Font.TextStyle) -> Font {
        .system(style, design: .default, weight: .bold).width(.condensed)
    }
}

extension String {
    var mciTrimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
    var mciDash: String { mciTrimmed.isEmpty ? "—" : self }
    var mciNR: String { mciTrimmed.isEmpty ? "Not recorded" : self }
}

// MARK: - Time

enum MCIFmt {
    static func iso(_ d: Date) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: d)
    }

    static func parseISO(_ s: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)
    }

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

    /// 24-hour time; adds the date when it differs from the reference day (multi-day incidents).
    static func clock(_ d: Date?, tz: TimeZone, ref: Date?) -> String {
        guard let d else { return "—" }
        if let ref, calendar(tz).isDate(d, inSameDayAs: ref) { return formatter("HH:mm", tz).string(from: d) }
        return formatter("MM/dd HH:mm", tz).string(from: d)
    }

    static func full(_ d: Date?, tz: TimeZone) -> String {
        guard let d else { return "—" }
        return formatter("yyyy-MM-dd HH:mm zzz", tz).string(from: d)
    }

    static func fileStamp(_ d: Date, tz: TimeZone) -> String { formatter("yyyy-MM-dd-HHmm", tz).string(from: d) }
    static func deviceClock(_ d: Date) -> String { formatter("HH:mm:ss", .current).string(from: d) }

    /// "Age unknown" when there is no time — never zero.
    static func age(of d: Date?, now: Date) -> String {
        guard let d else { return "age unknown" }
        let m = Int(now.timeIntervalSince(d) / 60)
        if m < 0 { return "time is later than now" }
        if m >= 60 { return "\(m / 60) h \(m % 60) min ago" }
        return "\(m) min ago"
    }
}

// MARK: - Categories (stable IDs, independent of colour)

enum TriageCategory: String, Codable, CaseIterable, Identifiable {
    case immediate, delayed, minor, expectant, deceased
    var id: String { rawValue }

    var name: String {
        switch self {
        case .immediate: return "Immediate"
        case .delayed: return "Delayed"
        case .minor: return "Minor / Minimal"
        case .expectant: return "Expectant"
        case .deceased: return "Deceased"
        }
    }
    var colorWord: String {
        switch self {
        case .immediate: return "RED"
        case .delayed: return "YELLOW"
        case .minor: return "GREEN"
        case .expectant: return "GRAY"
        case .deceased: return "BLACK"
        }
    }
    var abbr: String {
        switch self {
        case .immediate: return "R"
        case .delayed: return "Y"
        case .minor: return "G"
        case .expectant: return "EXP"
        case .deceased: return "DEC"
        }
    }
    var full: String { "\(name) / \(colorWord) / \(abbr)" }
    var swatch: Color {
        switch self {
        case .immediate: return Color(red: 0.78, green: 0.1, blue: 0.1)
        case .delayed: return Color(red: 0.98, green: 0.82, blue: 0.1)
        case .minor: return Color(red: 0.1, green: 0.5, blue: 0.2)
        case .expectant: return Color(white: 0.42)
        case .deceased: return Color.black
        }
    }
    var swatchText: Color { self == .delayed ? .black : .white }
    var uiSwatch: UIColor { UIColor(swatch) }
}

enum MCIUnclassified {
    static let key = "unclassified"
    static let label = "Not classified / UNK"
}

func mciCategoryLabel(_ c: TriageCategory?) -> String { c?.full ?? MCIUnclassified.label }
func mciCategoryShort(_ c: TriageCategory?) -> String { c.map { "\($0.abbr) \($0.name)" } ?? "UNK" }

// MARK: - Records

enum MCIChecklistState: String, Codable, CaseIterable, Identifiable {
    case pending, completed, notApplicable
    var id: String { rawValue }
    var label: String {
        switch self {
        case .pending: return "Pending"
        case .completed: return "Completed"
        case .notApplicable: return "Not Applicable"
        }
    }
}

struct MCIChecklistItem: Codable, Identifiable, Hashable {
    var id: UUID
    var text: String
    var state: MCIChecklistState
    var completedAt: Date?
    var initials: String
    var notes: String
}

struct MCIRoleAssignment: Codable, Identifiable, Hashable {
    var id: UUID
    var role: String
    var person: String
    var agencyChannel: String
    var reportsTo: String
    var assignedAt: Date?
    var relievedAt: Date?
    var notes: String
}

/// Reported Scene Count: a manual snapshot. A missing value is Unknown, never zero.
struct MCICountSnapshot: Codable, Identifiable, Hashable {
    var id: UUID
    var values: [String: Int]
    var observedAt: Date?
    var recordedAt: Date
    var reporter: String
    var notes: String
    var correctsID: UUID?

    func value(_ c: TriageCategory) -> Int? { values[c.rawValue] }
    var knownSubtotal: Int { TriageCategory.allCases.compactMap { value($0) }.reduce(0, +) }
    var isComplete: Bool { TriageCategory.allCases.allSatisfy { value($0) != nil } }
    var totalText: String { isComplete ? "Total \(knownSubtotal)" : "Known subtotal \(knownSubtotal) — Incomplete" }
}

enum MCILocation: String, Codable, CaseIterable, Identifiable {
    case onScene, departed, arrivalConfirmed, unknown
    var id: String { rawValue }
    var label: String {
        switch self {
        case .onScene: return "On Scene"
        case .departed: return "Departed"
        case .arrivalConfirmed: return "Arrival Confirmed"
        case .unknown: return "Unknown"
        }
    }
}

enum MCISex: String, Codable, CaseIterable, Identifiable {
    case unknown, female, male, other
    var id: String { rawValue }
    var label: String {
        switch self {
        case .unknown: return "Unknown"
        case .female: return "F"
        case .male: return "M"
        case .other: return "Other"
        }
    }
}

enum MCIAgeUnit: String, Codable, CaseIterable, Identifiable {
    case years, months
    var id: String { rawValue }
}

struct MCIPatient: Codable, Identifiable, Hashable {
    var id: UUID                // internal; independent of the displayed number and tag
    var number: String
    var tag: String
    var ageValue: Int?
    var ageUnit: MCIAgeUnit
    var ageApprox: Bool
    var sex: MCISex
    var complaint: String
    var category: TriageCategory?   // nil = Not classified; never Minor by default
    var sceneLocation: MCILocation  // used only when there is no valid departure
    var notes: String
    var createdAt: Date
    var enteredInError: Bool
    var errorReason: String

    var ageText: String {
        guard let a = ageValue else { return "Age unknown" }
        return "\(ageApprox ? "~" : "")\(a) \(ageUnit == .years ? "y" : "mo")"
    }
}

/// One initial scene departure per patient in this release. Stable ID guards against double recording.
struct MCIDeparture: Codable, Identifiable, Hashable {
    var id: UUID
    var patientID: UUID
    var hospitalID: UUID?
    var resourceID: UUID?
    var unitText: String
    var categoryAtDeparture: TriageCategory?
    var departedAt: Date?
    var recordedAt: Date
    var retrospective: Bool
    var voided: Bool
    var voidReason: String
    var voidedAt: Date?
    var arrivalConfirmedAt: Date?
    var notes: String

    var needsCompletion: Bool {
        hospitalID == nil || (resourceID == nil && unitText.mciTrimmed.isEmpty) || categoryAtDeparture == nil || departedAt == nil
    }
}

enum MCIDivert: String, Codable, CaseIterable, Identifiable {
    case unknown, no, yes
    var id: String { rawValue }
    var label: String { self == .unknown ? "Unknown" : (self == .yes ? "Yes — on divert" : "No") }
}

struct MCIHospital: Codable, Identifiable, Hashable {
    var id: UUID
    var directoryID: UUID?
    var name: String          // snapshot of the directory name; later renames never change it
    var capabilityNotes: String
}

struct MCIHospitalPoll: Codable, Identifiable, Hashable {
    var id: UUID
    var hospitalID: UUID
    var immediate: Int?       // nil = Unknown; 0 = zero
    var delayed: Int?
    var minor: Int?
    var divert: MCIDivert
    var contactNotes: String
    var reporter: String
    var method: String
    var observedAt: Date?
    var recordedAt: Date
}

enum MCIRequestStatus: String, Codable, CaseIterable, Identifiable {
    case requested, acknowledged, enRoute, arrived, assigned, released, cancelled, unknown
    var id: String { rawValue }
    var label: String {
        switch self {
        case .requested: return "Requested"
        case .acknowledged: return "Acknowledged"
        case .enRoute: return "En Route"
        case .arrived: return "Arrived"
        case .assigned: return "Assigned"
        case .released: return "Released"
        case .cancelled: return "Cancelled"
        case .unknown: return "Unknown"
        }
    }
}

struct MCIAidRequest: Codable, Identifiable, Hashable {
    var id: UUID
    var agency: String
    var status: MCIRequestStatus
    var contactedAt: Date?
    var unitsSent: String
    var eta: Date?
    var etaSource: String
    var assignment: String
    var notes: String
    var createdAt: Date
}

struct MCIAirRequest: Codable, Identifiable, Hashable {
    var id: UUID
    var service: String
    var status: MCIRequestStatus
    var requestedAt: Date?
    var lzFrequency: String
    var eta: Date?
    var patientIDs: [UUID]
    var destination: String
    var notes: String
    var createdAt: Date
}

enum MCIResourceStatus: String, Codable, CaseIterable, Identifiable {
    case available, assigned, transporting, released, unknown
    var id: String { rawValue }
    var label: String {
        switch self {
        case .available: return "In Staging — Available"
        case .assigned: return "Assigned"
        case .transporting: return "Transporting"
        case .released: return "Released"
        case .unknown: return "Unknown"
        }
    }
}

struct MCIResource: Codable, Identifiable, Hashable {
    var id: UUID
    var identifier: String
    var type: String
    var agency: String
    var contact: String
    var capacityNotes: String
    var timeIn: Date?
    var assignment: String
    var status: MCIResourceStatus
    var releasedAt: Date?
    var aidRequestID: UUID?
    var notes: String
    var createdAt: Date
}

enum MCISketchTemplate: String, Codable, CaseIterable, Identifiable {
    case roadway, structure, facility
    var id: String { rawValue }
    var title: String {
        switch self {
        case .roadway: return "Roadway / MVC"
        case .structure: return "Structure A / B / C / D"
        case .facility: return "Large Facility / Nursing Home"
        }
    }
    /// Page of the supplied Scene Sketch Cards PDF used as the locked background.
    var pageIndex: Int {
        switch self {
        case .roadway: return 0
        case .structure: return 1
        case .facility: return 2
        }
    }
    var fields: [(key: String, label: String)] {
        let common: [(key: String, label: String)] = [("incidentNumber", "Incident Number"), ("dateTime", "Date/Time"),
                      ("location", "Location / Address"), ("sketchedBy", "Sketched By")]
        switch self {
        case .roadway:
            return common + [("mainRoad", "Main Road"), ("crossStreet", "Cross Street")]
        case .structure:
            return common + [("sideAFaces", "Side A Faces"), ("wings", "Wing / Hall Labels")]
        case .facility:
            return common + [("facility", "Facility"), ("residents", "Residents Number"), ("staff", "Staff Number"),
                             ("ambulatory", "Ambulatory"), ("nonAmbulatory", "Non-ambulatory"),
                             ("bariatric", "Bariatric"), ("wings", "Wing / Hall Labels")]
        }
    }
}

struct MCISketch: Codable, Identifiable, Hashable {
    var id: UUID
    var template: MCISketchTemplate
    var title: String
    var notes: String
    var author: String
    var createdAt: Date
    var updatedAt: Date
    var canvasWidth: Double
    var canvasHeight: Double
    var fields: [String: String]
    var triageSnapshot: String   // a timestamped copy with its source; never a live tally
}

struct MCIInk: Codable, Identifiable, Hashable {
    var id: UUID
    var recordID: UUID
    var fieldID: String
    var drawing: Data
    var pageCount: Int
    var width: Double
    var pageHeight: Double
    var updatedAt: Date
}

struct MCIEvent: Codable, Identifiable, Hashable {
    var id: UUID
    var batchID: UUID
    var recordID: UUID
    var kind: String
    var action: String
    var field: String
    var before: String?
    var after: String?
    var effectiveAt: Date
    var recordedAt: Date
    var initials: String
    var note: String
}

enum MCIIncidentState: String, Codable { case open, closed }

struct MCIIncident: Codable, Identifiable, Hashable {
    var id: UUID
    var localNumber: String
    var name: String
    var occurrenceAt: Date?          // entered start time; never back-filled
    var createdAt: Date
    var location: String
    var types: [String]
    var otherType: String
    var level: String                 // "Unknown" or a configured level label
    var commandEstablishedAt: Date?
    var timeZoneID: String
    var isTraining: Bool
    var state: MCIIncidentState
    var closedAt: Date?
    var commandChannel: String
    var tacticalChannel: String
    var medicalChannel: String
    var airAidChannel: String
    var commandPost: String
    var accessEgress: String
    var hazards: String
    var commandNotes: String
    var checklistTemplateVersion: Int
    var checklist: [MCIChecklistItem]
    var roleNames: [String]
    var roles: [MCIRoleAssignment]
    var snapshots: [MCICountSnapshot]
    var patients: [MCIPatient]
    var departures: [MCIDeparture]
    var hospitals: [MCIHospital]
    var polls: [MCIHospitalPoll]
    var aid: [MCIAidRequest]
    var air: [MCIAirRequest]
    var resources: [MCIResource]
    var sketches: [MCISketch]
    var events: [MCIEvent]
    var inks: [MCIInk]
    var provenance: String?
    var sourceID: UUID?
    var sourceExportedAt: Date?

    var timeZone: TimeZone { TimeZone(identifier: timeZoneID) ?? TimeZone(identifier: "America/New_York") ?? .current }
    var isClosed: Bool { state == .closed }
    var displayName: String { name.mciTrimmed.isEmpty ? localNumber : "\(name) (\(localNumber))" }
    var refDate: Date { occurrenceAt ?? createdAt }
}

struct MCIDirectoryEntry: Codable, Identifiable, Hashable {
    var id: UUID
    var name: String
    var active: Bool
}

struct MCIReferenceDoc: Codable, Identifiable, Hashable {
    var id: UUID
    var title: String
    var revision: String
    var effectiveDate: String
    var source: String
    var approvalRecord: String   // operator-entered; not proof of approval
    var fileName: String
    var addedAt: Date
}

enum MCISeeds {
    static let incidentTypes = ["MCI", "MVC", "HazMat", "Fire", "Threat", "Other"]
    static let levels = ["1", "2", "3", "4", "5"]
    static let checklist = [
        "Establish and announce Command.",
        "Declare MCI and level to dispatch.",
        "Size-up: scene safety, hazards, number of patients.",
        "Don ICS position vests.",
        "Request resources: units, supervisors, buses, air.",
        "Request hospital bed poll.",
        "Designate Triage / Treatment / Transport.",
        "Designate Staging and Medical Comms.",
        "Establish staging and access / egress routes.",
        "Unified Command with Fire / LE.",
        "Consider Rehab, CISD, Mutual Aid.",
        "Appoint Safety Officer.",
    ]
    static let roles = [
        "Incident Commander", "Safety Officer", "Public Information Officer", "Liaison Officer",
        "Operations Section Chief", "Medical Branch Director", "Triage Group Supervisor",
        "Treatment Group Supervisor", "Transport Group Supervisor", "Staging Area Manager",
        "Medical Communications Coordinator",
    ]
    static let hospitals = [
        "Prisma Health Tuomey, Sumter", "McLeod Regional, Florence", "MUSC Health, Florence",
        "Prisma Health Richland, Columbia", "McLeod Health Clarendon, Manning", "MUSC Health Kershaw, Camden",
    ]
    static let ground = [
        "Lee County EMS", "Kershaw County EMS", "Clarendon Fire / Rescue", "Timmonsville Rescue",
        "Florence County EMS", "Richland County EMS", "Guardian Ambulance", "Prisma Health Ambulance",
    ]
    static let air = ["Meducare 2", "AirReach", "LifeNet 2"]
}

struct MCISettings: Codable {
    var defaultTimeZoneID = "America/New_York"
    var initials = ""
    var keepAwake = false
    var levels = MCISeeds.levels
    var checklist = MCISeeds.checklist
    var checklistVersion = 1
    var roles = MCISeeds.roles
    var hospitals: [MCIDirectoryEntry] = MCISeeds.hospitals.map { MCIDirectoryEntry(id: UUID(), name: $0, active: true) }
    var groundAgencies = MCISeeds.ground
    var airServices = MCISeeds.air
    var pollReminderMinutes: Int? = nil
    var references: [MCIReferenceDoc] = []
    var sketchPDFName: String? = nil
}

struct MCIAppData: Codable {
    static let currentSchema = 1
    var schemaVersion = MCIAppData.currentSchema
    var incidents: [MCIIncident] = []
    var settings = MCISettings()
}

// MARK: - Derived counts (pure functions; never stored totals)

struct MCIRegister: Equatable {
    var all: [String: Int] = [:]
    var onScene: [String: Int] = [:]
    var departed: [String: Int] = [:]
    var unknownLocation: [String: Int] = [:]

    func total(_ d: [String: Int]) -> Int { d.values.reduce(0, +) }
    var allTotal: Int { total(all) }
    var onSceneTotal: Int { total(onScene) }
    var departedTotal: Int { total(departed) }
    var unknownTotal: Int { total(unknownLocation) }

    static let keys: [String] = TriageCategory.allCases.map(\.rawValue) + [MCIUnclassified.key]
    static func label(_ key: String) -> String {
        TriageCategory(rawValue: key).map { "\($0.abbr) \($0.name)" } ?? "UNK Not classified"
    }
}

enum MCIDepartureResult: Equatable {
    case recorded, alreadyRecorded, patientAlreadyDeparted, patientEnteredInError, notFound, closed
    var message: String {
        switch self {
        case .recorded: return "Departure recorded."
        case .alreadyRecorded: return "This departure was already recorded. Nothing was added."
        case .patientAlreadyDeparted: return "This patient already has a valid departure. Void or correct it instead."
        case .patientEnteredInError: return "This patient is marked Entered in Error."
        case .notFound: return "Patient not found."
        case .closed: return "This incident is closed."
        }
    }
}

enum MCIErrorMarkResult: Equatable { case marked, needsReason, blockedByDeparture, notFound }

extension MCIIncident {
    static func new(now: Date, settings: MCISettings, training: Bool) -> MCIIncident {
        let tz = TimeZone(identifier: settings.defaultTimeZoneID) ?? .current
        let stamp = MCIFmt.formatter("yyyyMMdd-HHmm", tz).string(from: now)
        return MCIIncident(
            id: UUID(), localNumber: "\(training ? "TRN-" : "")MCI-\(stamp)", name: "", occurrenceAt: nil, createdAt: now,
            location: "", types: [], otherType: "", level: "Unknown", commandEstablishedAt: nil,
            timeZoneID: tz.identifier, isTraining: training, state: .open, closedAt: nil,
            commandChannel: "", tacticalChannel: "", medicalChannel: "", airAidChannel: "", commandPost: "",
            accessEgress: "", hazards: "", commandNotes: "",
            checklistTemplateVersion: settings.checklistVersion,
            checklist: settings.checklist.map {
                MCIChecklistItem(id: UUID(), text: $0, state: .pending, completedAt: nil, initials: "", notes: "")
            },
            roleNames: settings.roles, roles: [], snapshots: [], patients: [], departures: [],
            hospitals: settings.hospitals.filter(\.active).map {
                MCIHospital(id: UUID(), directoryID: $0.id, name: $0.name, capabilityNotes: "")
            },
            polls: [], aid: [], air: [], resources: [], sketches: [], events: [], inks: [],
            provenance: nil, sourceID: nil, sourceExportedAt: nil)
    }

    mutating func log(_ record: UUID, _ kind: String, _ action: String, field: String = "", before: String? = nil,
                      after: String? = nil, effective: Date? = nil, now: Date, initials: String, note: String = "",
                      batch: UUID = UUID()) {
        events.append(MCIEvent(id: UUID(), batchID: batch, recordID: record, kind: kind, action: action, field: field,
                               before: before, after: after, effectiveAt: effective ?? now, recordedAt: now,
                               initials: initials, note: note))
    }

    // Lookups

    func patient(_ id: UUID) -> MCIPatient? { patients.first { $0.id == id } }
    func patientIndex(_ id: UUID) -> Int? { patients.firstIndex { $0.id == id } }
    func departureIndex(_ id: UUID) -> Int? { departures.firstIndex { $0.id == id } }
    func hospital(_ id: UUID?) -> MCIHospital? { id.flatMap { hid in hospitals.first { $0.id == hid } } }
    func resource(_ id: UUID?) -> MCIResource? { id.flatMap { rid in resources.first { $0.id == rid } } }
    func resourceIndex(_ id: UUID) -> Int? { resources.firstIndex { $0.id == id } }

    func validDeparture(for patientID: UUID) -> MCIDeparture? {
        departures.first { $0.patientID == patientID && !$0.voided }
    }

    func location(of p: MCIPatient) -> MCILocation {
        if let d = validDeparture(for: p.id) { return d.arrivalConfirmedAt == nil ? .departed : .arrivalConfirmed }
        return p.sceneLocation
    }

    var activePatients: [MCIPatient] { patients.filter { !$0.enteredInError } }

    /// Patient Register: derived only from individual, non-error patient records.
    func register() -> MCIRegister {
        var r = MCIRegister()
        for p in activePatients {
            let key = p.category?.rawValue ?? MCIUnclassified.key
            r.all[key, default: 0] += 1
            switch location(of: p) {
            case .onScene: r.onScene[key, default: 0] += 1
            case .departed, .arrivalConfirmed: r.departed[key, default: 0] += 1
            case .unknown: r.unknownLocation[key, default: 0] += 1
            }
        }
        return r
    }

    /// Patients Sent: valid departures of non-error patients, by destination and category AT DEPARTURE.
    func patientsSent() -> [UUID?: [String: Int]] {
        var out: [UUID?: [String: Int]] = [:]
        let errorIDs = Set(patients.filter(\.enteredInError).map(\.id))
        for d in departures where !d.voided && !errorIDs.contains(d.patientID) {
            let key = d.categoryAtDeparture?.rawValue ?? "unknownAtDeparture"
            out[d.hospitalID, default: [:]][key, default: 0] += 1
        }
        return out
    }

    func sentTotal(to hospitalID: UUID?) -> Int { patientsSent()[hospitalID]?.values.reduce(0, +) ?? 0 }

    var latestSnapshot: MCICountSnapshot? { snapshots.max { $0.recordedAt < $1.recordedAt } }

    func latestPoll(_ hospitalID: UUID) -> MCIHospitalPoll? {
        polls.filter { $0.hospitalID == hospitalID }.max { $0.recordedAt < $1.recordedAt }
    }

    var availableResourceCount: Int { resources.filter { $0.status == .available }.count }

    // Patients

    static func normalizeTag(_ s: String) -> String {
        var out = String.UnicodeScalarView()
        for u in s.uppercased().unicodeScalars where CharacterSet.alphanumerics.contains(u) { out.append(u) }
        return String(out)
    }

    /// Other active patients with the same nonblank tag (uppercase, letters and digits only). Never merged.
    func duplicateTags(of p: MCIPatient) -> [MCIPatient] {
        let n = MCIIncident.normalizeTag(p.tag)
        guard !n.isEmpty else { return [] }
        return activePatients.filter { $0.id != p.id && MCIIncident.normalizeTag($0.tag) == n }
    }

    @discardableResult
    mutating func addPatient(now: Date, initials: String, retrospective: Bool = false) -> UUID {
        let p = MCIPatient(id: UUID(), number: String(format: "P-%03d", patients.count + 1), tag: "", ageValue: nil,
                           ageUnit: .years, ageApprox: false, sex: .unknown, complaint: "", category: nil,
                           sceneLocation: retrospective ? .unknown : .onScene, notes: "", createdAt: now,
                           enteredInError: false, errorReason: "")
        patients.append(p)
        log(p.id, "patient", retrospective ? "patientAddedRetrospective" : "patientAdded", after: p.number,
            now: now, initials: initials)
        return p.id
    }

    mutating func setCategory(_ patientID: UUID, _ c: TriageCategory?, reason: String, now: Date, initials: String) {
        guard let i = patientIndex(patientID), patients[i].category != c else { return }
        let old = patients[i].category
        patients[i].category = c
        log(patientID, "patient", "categoryChanged", field: "Category", before: mciCategoryLabel(old),
            after: mciCategoryLabel(c), now: now, initials: initials, note: reason)
    }

    mutating func setSceneLocation(_ patientID: UUID, _ l: MCILocation, now: Date, initials: String) {
        guard let i = patientIndex(patientID), patients[i].sceneLocation != l else { return }
        let old = patients[i].sceneLocation
        patients[i].sceneLocation = l
        log(patientID, "patient", "edit", field: "Location", before: old.label, after: l.label, now: now, initials: initials)
    }

    mutating func markEnteredInError(_ patientID: UUID, reason: String, now: Date, initials: String) -> MCIErrorMarkResult {
        guard let i = patientIndex(patientID) else { return .notFound }
        guard !reason.mciTrimmed.isEmpty else { return .needsReason }
        if validDeparture(for: patientID) != nil { return .blockedByDeparture }
        if patients[i].enteredInError { return .marked }
        patients[i].enteredInError = true
        patients[i].errorReason = reason.mciTrimmed
        log(patientID, "patient", "enteredInError", after: patients[i].number, now: now, initials: initials, note: reason)
        return .marked
    }

    mutating func restoreFromError(_ patientID: UUID, now: Date, initials: String) {
        guard let i = patientIndex(patientID), patients[i].enteredInError else { return }
        patients[i].enteredInError = false
        log(patientID, "patient", "restored", after: patients[i].number, now: now, initials: initials,
            note: "Entered in Error undone (was: \(patients[i].errorReason))")
    }

    // Departures

    mutating func recordDeparture(id: UUID, patientID: UUID, hospitalID: UUID?, resourceID: UUID?, unitText: String,
                                  category: TriageCategory?, departedAt: Date?, retrospective: Bool, notes: String,
                                  now: Date, initials: String) -> MCIDepartureResult {
        if isClosed { return .closed }
        if departures.contains(where: { $0.id == id }) { return .alreadyRecorded }
        guard let p = patient(patientID) else { return .notFound }
        if p.enteredInError { return .patientEnteredInError }
        if validDeparture(for: patientID) != nil { return .patientAlreadyDeparted }
        let batch = UUID()
        let d = MCIDeparture(id: id, patientID: patientID, hospitalID: hospitalID, resourceID: resourceID,
                             unitText: unitText.mciTrimmed, categoryAtDeparture: category, departedAt: departedAt,
                             recordedAt: now, retrospective: retrospective, voided: false, voidReason: "", voidedAt: nil,
                             arrivalConfirmedAt: nil, notes: notes)
        departures.append(d)
        let dest = hospital(hospitalID)?.name ?? "Unknown destination"
        log(id, "departure", "departureRecorded", after: "\(p.number) → \(dest)", effective: departedAt, now: now,
            initials: initials, note: d.needsCompletion ? "Incomplete — flagged for completion" : "", batch: batch)
        if let rid = resourceID, let ri = resourceIndex(rid), resources[ri].status != .transporting {
            let old = resources[ri].status
            resources[ri].status = .transporting
            log(rid, "resource", "status", field: "Status", before: old.label, after: MCIResourceStatus.transporting.label,
                now: now, initials: initials, note: "Linked to departure of \(p.number)", batch: batch)
        }
        return .recorded
    }

    @discardableResult
    mutating func voidDeparture(_ id: UUID, reason: String, now: Date, initials: String) -> Bool {
        guard let i = departureIndex(id), !departures[i].voided, !reason.mciTrimmed.isEmpty else { return false }
        departures[i].voided = true
        departures[i].voidReason = reason.mciTrimmed
        departures[i].voidedAt = now
        let number = patient(departures[i].patientID)?.number ?? "?"
        log(id, "departure", "departureVoided", after: number, now: now, initials: initials, note: reason)
        return true
    }

    mutating func correctDepartureHospital(_ id: UUID, _ hospitalID: UUID?, reason: String, now: Date, initials: String) {
        guard let i = departureIndex(id), departures[i].hospitalID != hospitalID else { return }
        let old = hospital(departures[i].hospitalID)?.name ?? "Unknown"
        departures[i].hospitalID = hospitalID
        log(id, "departure", "edit", field: "Destination", before: old, after: hospital(hospitalID)?.name ?? "Unknown",
            now: now, initials: initials, note: reason)
    }

    /// Explicit correction only. Re-triage never changes category at departure.
    mutating func correctDepartureCategory(_ id: UUID, _ c: TriageCategory?, reason: String, now: Date, initials: String) {
        guard let i = departureIndex(id), departures[i].categoryAtDeparture != c else { return }
        let old = departures[i].categoryAtDeparture
        departures[i].categoryAtDeparture = c
        log(id, "departure", "edit", field: "Category at departure", before: mciCategoryLabel(old),
            after: mciCategoryLabel(c), now: now, initials: initials, note: reason)
    }

    mutating func correctDepartureTime(_ id: UUID, _ t: Date?, reason: String, now: Date, initials: String) {
        guard let i = departureIndex(id), departures[i].departedAt != t else { return }
        let old = departures[i].departedAt
        departures[i].departedAt = t
        log(id, "departure", "edit", field: "Time Out", before: old.map(MCIFmt.iso), after: t.map(MCIFmt.iso),
            effective: t, now: now, initials: initials, note: reason)
    }

    mutating func correctDepartureUnit(_ id: UUID, resourceID: UUID?, unitText: String, reason: String, now: Date, initials: String) {
        guard let i = departureIndex(id) else { return }
        let old = resource(departures[i].resourceID)?.identifier ?? departures[i].unitText
        departures[i].resourceID = resourceID
        departures[i].unitText = unitText.mciTrimmed
        let new = resource(resourceID)?.identifier ?? unitText
        if old == new { return }
        log(id, "departure", "edit", field: "Transport Unit", before: old.mciDash, after: new.mciDash, now: now,
            initials: initials, note: reason)
    }

    mutating func confirmArrival(_ id: UUID, at t: Date, now: Date, initials: String) {
        guard let i = departureIndex(id), departures[i].arrivalConfirmedAt == nil else { return }
        departures[i].arrivalConfirmedAt = t
        log(id, "departure", "arrivalConfirmed", after: MCIFmt.iso(t), effective: t, now: now, initials: initials)
    }

    // Reported Scene Count

    @discardableResult
    mutating func recordSnapshot(id: UUID, values: [TriageCategory: Int?], observedAt: Date?, reporter: String,
                                 notes: String, correcting: UUID?, now: Date, initials: String) -> Bool {
        guard !snapshots.contains(where: { $0.id == id }) else { return false }   // guards double Save
        var v: [String: Int] = [:]
        for (c, n) in values { if let n { v[c.rawValue] = max(0, n) } }
        let s = MCICountSnapshot(id: id, values: v, observedAt: observedAt, recordedAt: now, reporter: reporter,
                                 notes: notes, correctsID: correcting)
        snapshots.append(s)
        log(id, "snapshot", correcting == nil ? "snapshotRecorded" : "snapshotCorrection", after: s.totalText,
            effective: observedAt, now: now, initials: initials, note: reporter.mciTrimmed.isEmpty ? "" : "Source: \(reporter)")
        return true
    }

    // Checklist and roles

    mutating func setChecklist(_ itemID: UUID, _ state: MCIChecklistState, at t: Date, now: Date, initials: String) {
        guard let i = checklist.firstIndex(where: { $0.id == itemID }), checklist[i].state != state else { return }
        let old = checklist[i].state
        checklist[i].state = state
        checklist[i].completedAt = state == .completed ? t : nil
        checklist[i].initials = initials
        log(itemID, "checklist", "checklist", field: checklist[i].text, before: old.label, after: state.label,
            effective: t, now: now, initials: initials)
    }

    func currentAssignment(_ role: String) -> MCIRoleAssignment? {
        roles.filter { $0.role == role && $0.relievedAt == nil }.max { ($0.assignedAt ?? .distantPast) < ($1.assignedAt ?? .distantPast) }
    }

    /// Assigning a role relieves the current holder; history is kept.
    mutating func assignRole(_ role: String, person: String, agencyChannel: String, reportsTo: String, at t: Date,
                             notes: String, now: Date, initials: String) {
        let batch = UUID()
        if let cur = currentAssignment(role), let i = roles.firstIndex(where: { $0.id == cur.id }) {
            roles[i].relievedAt = t
            log(cur.id, "role", "relieved", field: role, before: cur.person, effective: t, now: now, initials: initials, batch: batch)
        }
        let a = MCIRoleAssignment(id: UUID(), role: role, person: person.mciTrimmed, agencyChannel: agencyChannel,
                                  reportsTo: reportsTo, assignedAt: t, relievedAt: nil, notes: notes)
        roles.append(a)
        log(a.id, "role", "assigned", field: role, after: a.person, effective: t, now: now, initials: initials, batch: batch)
    }

    mutating func relieveRole(_ assignmentID: UUID, at t: Date, now: Date, initials: String) {
        guard let i = roles.firstIndex(where: { $0.id == assignmentID }), roles[i].relievedAt == nil else { return }
        roles[i].relievedAt = t
        log(assignmentID, "role", "relieved", field: roles[i].role, before: roles[i].person, effective: t, now: now, initials: initials)
    }

    // Hospitals

    @discardableResult
    mutating func addPoll(_ p: MCIHospitalPoll, initials: String) -> Bool {
        guard !polls.contains(where: { $0.id == p.id }) else { return false }
        polls.append(p)
        func n(_ v: Int?) -> String { v.map(String.init) ?? "Unknown" }
        log(p.hospitalID, "hospital", "bedPoll", after: "I \(n(p.immediate)) / D \(n(p.delayed)) / M \(n(p.minor)) · Divert \(p.divert.label)",
            effective: p.observedAt, now: p.recordedAt, initials: initials)
        return true
    }

    // Mutual aid, air, staging

    @discardableResult
    mutating func addAid(agency: String, now: Date, initials: String) -> UUID {
        let r = MCIAidRequest(id: UUID(), agency: agency, status: .requested, contactedAt: nil, unitsSent: "", eta: nil,
                              etaSource: "", assignment: "", notes: "", createdAt: now)
        aid.append(r)
        log(r.id, "aid", "aidRequestAdded", after: agency, now: now, initials: initials)
        return r.id
    }

    mutating func setAidStatus(_ id: UUID, _ s: MCIRequestStatus, now: Date, initials: String) {
        guard let i = aid.firstIndex(where: { $0.id == id }), aid[i].status != s else { return }
        let old = aid[i].status
        aid[i].status = s
        log(id, "aid", "status", field: aid[i].agency, before: old.label, after: s.label, now: now, initials: initials)
    }

    @discardableResult
    mutating func addAir(service: String, now: Date, initials: String) -> UUID {
        let r = MCIAirRequest(id: UUID(), service: service, status: .requested, requestedAt: nil, lzFrequency: "", eta: nil,
                              patientIDs: [], destination: "", notes: "", createdAt: now)
        air.append(r)
        log(r.id, "air", "airRequestAdded", after: service, now: now, initials: initials)
        return r.id
    }

    mutating func setAirStatus(_ id: UUID, _ s: MCIRequestStatus, now: Date, initials: String) {
        guard let i = air.firstIndex(where: { $0.id == id }), air[i].status != s else { return }
        let old = air[i].status
        air[i].status = s
        log(id, "air", "status", field: air[i].service, before: old.label, after: s.label, now: now, initials: initials)
    }

    func duplicateResources(identifier: String, excluding id: UUID?) -> [MCIResource] {
        let n = MCIIncident.normalizeTag(identifier)
        guard !n.isEmpty else { return [] }
        return resources.filter { $0.id != id && MCIIncident.normalizeTag($0.identifier) == n }
    }

    @discardableResult
    mutating func addResource(identifier: String, agency: String, aidRequestID: UUID?, timeIn: Date?, now: Date,
                              initials: String) -> UUID {
        let r = MCIResource(id: UUID(), identifier: identifier, type: "", agency: agency, contact: "", capacityNotes: "",
                            timeIn: timeIn, assignment: "", status: .available, releasedAt: nil, aidRequestID: aidRequestID,
                            notes: "", createdAt: now)
        resources.append(r)
        log(r.id, "resource", "resourceAdded", after: identifier.mciDash, now: now, initials: initials,
            note: aidRequestID == nil ? "" : "Linked to mutual aid request")
        return r.id
    }

    /// Mutual aid arrival creates or reuses ONE linked staging resource, never a second copy.
    mutating func stageAidArrival(_ aidID: UUID, now: Date, initials: String) -> UUID? {
        guard let i = aid.firstIndex(where: { $0.id == aidID }) else { return nil }
        if let existing = resources.first(where: { $0.aidRequestID == aidID }) { return existing.id }
        setAidStatus(aidID, .arrived, now: now, initials: initials)
        let label = aid[i].unitsSent.mciTrimmed.isEmpty ? aid[i].agency : aid[i].unitsSent
        return addResource(identifier: label, agency: aid[i].agency, aidRequestID: aidID, timeIn: now, now: now, initials: initials)
    }

    mutating func setResourceStatus(_ id: UUID, _ s: MCIResourceStatus, now: Date, initials: String) {
        guard let i = resourceIndex(id), resources[i].status != s else { return }
        let old = resources[i].status
        resources[i].status = s
        if s == .released { resources[i].releasedAt = now }
        log(id, "resource", "status", field: resources[i].identifier, before: old.label, after: s.label, now: now, initials: initials)
    }

    // Sketches

    @discardableResult
    mutating func addSketch(_ t: MCISketchTemplate, aspect: Double, author: String, now: Date, initials: String) -> UUID {
        let w = 1024.0
        let h = (w * (aspect > 0 ? aspect : 0.773)).rounded()
        var fields: [String: String] = [:]
        fields["incidentNumber"] = localNumber
        fields["location"] = location
        let count = sketches.filter { $0.template == t }.count
        let s = MCISketch(id: UUID(), template: t, title: count == 0 ? t.title : "\(t.title) — page \(count + 1)",
                          notes: "", author: author, createdAt: now, updatedAt: now, canvasWidth: w, canvasHeight: h,
                          fields: fields, triageSnapshot: "")
        sketches.append(s)
        log(s.id, "sketch", "sketchAdded", after: s.title, now: now, initials: initials)
        return s.id
    }

    // Close / reopen

    mutating func close(now: Date, initials: String) {
        guard state == .open else { return }
        state = .closed
        closedAt = now
        log(id, "incident", "closed", now: now, initials: initials)
    }

    mutating func reopen(now: Date, initials: String) {
        guard state == .closed else { return }
        state = .open
        log(id, "incident", "reopened", now: now, initials: initials)
    }

    /// Valid departures whose patient is marked Entered in Error must be reconciled.
    var reconciliationIssues: [String] {
        var out: [String] = []
        for d in departures where !d.voided {
            if let p = patient(d.patientID), p.enteredInError {
                out.append("\(p.number) is Entered in Error but has a valid departure.")
            }
            if d.needsCompletion {
                out.append("Departure of \(patient(d.patientID)?.number ?? "?") is missing destination, unit, category or time.")
            }
        }
        return out
    }

    // Readable history

    func recordLabel(_ id: UUID) -> String {
        if id == self.id { return "Incident" }
        if let p = patient(id) { return "Patient \(p.number)" }
        if let d = departures.first(where: { $0.id == id }) { return "Departure of \(patient(d.patientID)?.number ?? "?")" }
        if let h = hospitals.first(where: { $0.id == id }) { return h.name }
        if let r = resources.first(where: { $0.id == id }) { return "Resource \(r.identifier.mciDash)" }
        if let a = aid.first(where: { $0.id == id }) { return "Aid: \(a.agency)" }
        if let a = air.first(where: { $0.id == id }) { return "Air: \(a.service)" }
        if let c = checklist.first(where: { $0.id == id }) { return "Checklist: \(c.text)" }
        if let r = roles.first(where: { $0.id == id }) { return r.role }
        if snapshots.contains(where: { $0.id == id }) { return "Reported count" }
        if let s = sketches.first(where: { $0.id == id }) { return "Sketch: \(s.title)" }
        return "Record"
    }

    func describe(_ e: MCIEvent) -> String {
        let tz = timeZone
        let ref = refDate
        func t(_ s: String) -> String {
            guard let d = MCIFmt.parseISO(s) else { return s }
            return MCIFmt.clock(d, tz: tz, ref: ref)
        }
        let names = ["patientAdded": "Patient added", "patientAddedRetrospective": "Patient added (already departed)",
                     "categoryChanged": "Category changed", "enteredInError": "Marked Entered in Error",
                     "restored": "Restored", "departureRecorded": "Departure recorded",
                     "departureVoided": "Departure voided", "arrivalConfirmed": "Arrival confirmed",
                     "snapshotRecorded": "Reported count recorded", "snapshotCorrection": "Reported count correction",
                     "assigned": "Assigned", "relieved": "Relieved", "bedPoll": "Bed poll",
                     "aidRequestAdded": "Mutual aid request", "airRequestAdded": "Air request",
                     "resourceAdded": "Resource added", "sketchAdded": "Sketch added", "closed": "Incident closed",
                     "reopened": "Incident reopened", "restoredCopy": "Restored copy created", "checklist": "Checklist",
                     "status": "Status", "edit": "Changed", "levelChanged": "MCI Level"]
        var text = names[e.action] ?? e.action
        if !e.field.isEmpty { text += " — \(e.field)" }
        let timeFields: Set<String> = ["Time Out", "Command Established", "Occurrence"]
        let isTime = timeFields.contains(e.field) || e.action == "arrivalConfirmed"
        let before: String? = isTime ? e.before.map { t($0) } : e.before
        let after: String? = isTime ? e.after.map { t($0) } : e.after
        if let before { text += ": \(before) → \(after ?? "—")" } else if let after { text += ": \(after)" }
        if !e.note.isEmpty { text += " (\(e.note))" }
        return text
    }

    /// Plain-text handover summary.
    func handoverSummary(now: Date) -> String {
        let tz = timeZone
        var lines: [String] = []
        lines.append("\(isTraining ? "TRAINING — FICTITIOUS · " : "")HANDOVER — \(displayName)")
        lines.append("Generated \(MCIFmt.full(now, tz: tz)) on this iPad (not shared live).")
        lines.append("Location: \(location.mciNR) · MCI Level: \(level) · Command established: \(MCIFmt.full(commandEstablishedAt, tz: tz))")
        lines.append("")
        lines.append("ROLES")
        for r in roleNames {
            var who = "Unassigned"
            if let a = currentAssignment(r) {
                who = a.person.mciNR
                if !a.agencyChannel.mciTrimmed.isEmpty { who += " (" + a.agencyChannel + ")" }
            }
            lines.append("  " + r + ": " + who)
        }
        lines.append("")
        lines.append("CHANNELS: Command \(commandChannel.mciNR) · Tac/Ops \(tacticalChannel.mciNR) · Med/Hosp \(medicalChannel.mciNR) · Air/Aid \(airAidChannel.mciNR) · CP \(commandPost.mciNR)")
        lines.append("HAZARDS: \(hazards.mciNR)")
        lines.append("ACCESS / EGRESS: \(accessEgress.mciNR)")
        lines.append("")
        lines.append("OUTSTANDING ACTIONS")
        let pending = checklist.filter { $0.state == .pending }
        if pending.isEmpty { lines.append("  None pending") }
        for c in pending { lines.append("  [ ] \(c.text)") }
        lines.append("")
        if let s = latestSnapshot {
            let vals = TriageCategory.allCases.map { "\($0.abbr) \(s.value($0).map(String.init) ?? "?")" }.joined(separator: " · ")
            lines.append("REPORTED SCENE COUNT (snapshot observed \(MCIFmt.full(s.observedAt, tz: tz)), source \(s.reporter.mciNR)): \(vals) — \(s.totalText)")
        } else {
            lines.append("REPORTED SCENE COUNT: none recorded")
        }
        let r = register()
        lines.append("PATIENT REGISTER (tracked records, as of \(MCIFmt.full(now, tz: tz))): \(r.allTotal) tracked · \(r.onSceneTotal) on scene · \(r.departedTotal) departed · \(r.unknownTotal) location unknown")
        for k in MCIRegister.keys {
            lines.append("  \(MCIRegister.label(k)): \(r.all[k] ?? 0) tracked, \(r.onScene[k] ?? 0) on scene")
        }
        lines.append("")
        lines.append("PENDING TRANSPORTS (tracked patients still on scene): \(r.onSceneTotal)")
        lines.append("Staging available: \(availableResourceCount)")
        let issues = reconciliationIssues
        if !issues.isEmpty {
            lines.append("")
            lines.append("NEEDS RECONCILIATION")
            for i in issues { lines.append("  ! \(i)") }
        }
        return lines.joined(separator: "\n")
    }
}

// MARK: - Backup (versioned editable JSON, including ink)

struct MCIBackup: Codable {
    var format: String
    var formatVersion: Int
    var exportedAt: Date
    var appSchemaVersion: Int
    var incident: MCIIncident
}

enum MCIBackupError: Error { case wrongFormat, newerVersion }

enum MCIBackupCodec {
    static let format = "SumterCommand.MCIIncidentBackup"
    static let version = 1

    static func encoder() -> JSONEncoder {
        let e = JSONEncoder()
        e.outputFormatting = [.prettyPrinted, .sortedKeys]
        e.dateEncodingStrategy = .custom { date, enc in
            var c = enc.singleValueContainer()
            try c.encode(MCIFmt.iso(date))
        }
        return e
    }

    static func decoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { dec in
            let c = try dec.singleValueContainer()
            let s = try c.decode(String.self)
            guard let date = MCIFmt.parseISO(s) else {
                throw DecodingError.dataCorruptedError(in: c, debugDescription: "Unreadable date")
            }
            return date
        }
        return d
    }

    static func encode(_ i: MCIIncident, exportedAt: Date) throws -> Data {
        try encoder().encode(MCIBackup(format: format, formatVersion: version, exportedAt: exportedAt,
                                       appSchemaVersion: MCIAppData.currentSchema, incident: i))
    }

    static func decode(_ data: Data) throws -> MCIBackup {
        let b = try decoder().decode(MCIBackup.self, from: data)
        guard b.format == format else { throw MCIBackupError.wrongFormat }
        guard b.formatVersion <= version else { throw MCIBackupError.newerVersion }
        return b
    }

    static func validate(_ i: MCIIncident) -> [String] {
        var p: [String] = []
        if TimeZone(identifier: i.timeZoneID) == nil { p.append("Unknown time zone.") }
        let patientIDs = Set(i.patients.map(\.id))
        let hospitalIDs = Set(i.hospitals.map(\.id))
        let resourceIDs = Set(i.resources.map(\.id))
        let aidIDs = Set(i.aid.map(\.id))
        var all: [UUID] = [i.id]
        all += i.patients.map(\.id) + i.departures.map(\.id) + i.hospitals.map(\.id) + i.polls.map(\.id)
        all += i.aid.map(\.id) + i.air.map(\.id) + i.resources.map(\.id) + i.sketches.map(\.id)
        all += i.snapshots.map(\.id) + i.checklist.map(\.id) + i.roles.map(\.id) + i.events.map(\.id) + i.inks.map(\.id)
        if Set(all).count != all.count { p.append("Duplicate record identifiers.") }
        for d in i.departures {
            if !patientIDs.contains(d.patientID) { p.append("A departure refers to a missing patient.") }
            if let h = d.hospitalID, !hospitalIDs.contains(h) { p.append("A departure refers to a missing hospital.") }
            if let r = d.resourceID, !resourceIDs.contains(r) { p.append("A departure refers to a missing resource.") }
        }
        let validCounts = Dictionary(grouping: i.departures.filter { !$0.voided }, by: \.patientID)
        if validCounts.values.contains(where: { $0.count > 1 }) { p.append("A patient has more than one valid departure.") }
        for poll in i.polls where !hospitalIDs.contains(poll.hospitalID) { p.append("A bed poll refers to a missing hospital.") }
        for poll in i.polls {
            for v in [poll.immediate, poll.delayed, poll.minor] { if let v, v < 0 { p.append("Negative bed count.") } }
        }
        for s in i.snapshots where s.values.values.contains(where: { $0 < 0 }) { p.append("Negative reported count.") }
        for r in i.resources { if let a = r.aidRequestID, !aidIDs.contains(a) { p.append("A resource refers to a missing aid request.") } }
        for a in i.air { for pid in a.patientIDs where !patientIDs.contains(pid) { p.append("An air request refers to a missing patient.") } }
        let known = Set(all)
        for e in i.events where !known.contains(e.recordID) { p.append("A history entry refers to a missing record.") }
        for k in i.inks {
            if !known.contains(k.recordID) { p.append("Handwriting refers to a missing record.") }
            if k.pageCount < 1 || k.pageCount > 500 || k.width <= 0 || k.pageHeight <= 0 { p.append("Handwriting has invalid dimensions.") }
            do { _ = try PKDrawing(data: k.drawing) } catch { p.append("A handwriting attachment could not be read.") }
        }
        return Array(Set(p)).sorted()
    }

    /// New internal IDs everywhere, so a restored copy can never overwrite or collide with live records.
    static func remap(_ src: MCIIncident) -> MCIIncident {
        var idMap: [UUID: UUID] = [:]
        func m(_ id: UUID) -> UUID {
            if let n = idMap[id] { return n }
            let n = UUID()
            idMap[id] = n
            return n
        }
        func mo(_ id: UUID?) -> UUID? { id.map { m($0) } }
        var i = src
        i.id = m(src.id)
        i.checklist = src.checklist.map { var x = $0; x.id = m($0.id); return x }
        i.roles = src.roles.map { var x = $0; x.id = m($0.id); return x }
        i.snapshots = src.snapshots.map { var x = $0; x.id = m($0.id); x.correctsID = mo($0.correctsID); return x }
        i.patients = src.patients.map { var x = $0; x.id = m($0.id); return x }
        i.hospitals = src.hospitals.map { var x = $0; x.id = m($0.id); return x }
        i.resources = src.resources.map { var x = $0; x.id = m($0.id); x.aidRequestID = mo($0.aidRequestID); return x }
        i.aid = src.aid.map { var x = $0; x.id = m($0.id); return x }
        i.departures = src.departures.map { d in
            var x = d
            x.id = m(d.id); x.patientID = m(d.patientID); x.hospitalID = mo(d.hospitalID); x.resourceID = mo(d.resourceID)
            return x
        }
        i.polls = src.polls.map { var x = $0; x.id = m($0.id); x.hospitalID = m($0.hospitalID); return x }
        i.air = src.air.map { a in var x = a; x.id = m(a.id); x.patientIDs = a.patientIDs.map { m($0) }; return x }
        i.sketches = src.sketches.map { var x = $0; x.id = m($0.id); return x }
        i.events = src.events.map { e in
            var x = e
            x.id = m(e.id); x.batchID = m(e.batchID); x.recordID = m(e.recordID)
            return x
        }
        i.inks = src.inks.map { var x = $0; x.id = m($0.id); x.recordID = m($0.recordID); return x }
        return i
    }

    static func restoredCopy(_ b: MCIBackup, now: Date, initials: String) -> MCIIncident {
        var i = remap(b.incident)
        i.sourceID = b.incident.id
        i.sourceExportedAt = b.exportedAt
        i.provenance = "Restored copy of \(b.incident.displayName) from a backup exported \(MCIFmt.full(b.exportedAt, tz: b.incident.timeZone))"
        i.state = .closed
        i.closedAt = now
        i.log(i.id, "incident", "restoredCopy", now: now, initials: initials, note: "Read-only until reopened")
        return i
    }
}

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

    var sketchPDFURL: URL? {
        guard let name = data.settings.sketchPDFName else { return nil }
        let u = directory.appendingPathComponent(name)
        return FileManager.default.fileExists(atPath: u.path) ? u : nil
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
            return .invalid("The backup failed validation. Nothing was changed.\n" + problems.prefix(8).joined(separator: "\n"))
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

// MARK: - Shared UI

struct MCIIDBox: Identifiable, Hashable { let id: UUID }

struct MCISectionBox<Content: View>: View {
    let title: String
    var accent: Color = MCIStyle.navy
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title.uppercased())
                .font(.mciHeading(.headline))
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
        .overlay(Rectangle().stroke(MCIStyle.navy.opacity(0.35), lineWidth: 1))
    }
}

struct MCICategoryBadge: View {
    let category: TriageCategory?
    var body: some View {
        Text(category.map { "\($0.abbr) · \($0.name.uppercased())" } ?? "UNK · NOT CLASSIFIED")
            .font(.mciHeading(.headline))
            .foregroundStyle(category?.swatchText ?? Color.primary)
            .padding(.horizontal, 10).padding(.vertical, 5)
            .background(category?.swatch ?? Color.clear)
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(category == nil ? Color.secondary : Color.clear,
                                                              style: StrokeStyle(lineWidth: 2, dash: [5, 3])))
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .accessibilityLabel("Category \(mciCategoryLabel(category))")
    }
}

struct MCITag: View {
    let text: String
    var color: Color = MCIStyle.brick
    var body: some View {
        Text(text).font(.caption.bold()).foregroundStyle(.white)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(color).clipShape(Capsule())
    }
}

struct MCIBigLabel: View {
    let title: String
    let systemImage: String
    var body: some View {
        Label(title, systemImage: systemImage).font(.headline).frame(maxWidth: .infinity, minHeight: 56)
    }
}

struct MCISaveStatus: View {
    @EnvironmentObject var store: MCIStore
    var body: some View {
        switch store.saveState {
        case .idle:
            Label("No unsaved changes", systemImage: "checkmark.circle").foregroundStyle(.secondary)
        case .pending, .saving:
            Label("Saving…", systemImage: "clock")
        case .saved(let d):
            Label("Saved \(MCIFmt.deviceClock(d))", systemImage: "checkmark.circle.fill").foregroundStyle(.secondary)
        case .failed(let msg):
            HStack(spacing: 10) {
                Label("Save Failed", systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(MCIStyle.brick).font(.headline).accessibilityHint(msg)
                Button("Retry") { store.saveNow() }.buttonStyle(.borderedProminent).tint(MCIStyle.brick)
            }
        }
    }
}

struct MCISaveFailureBanner: View {
    @EnvironmentObject var store: MCIStore
    var body: some View {
        if case .failed(let msg) = store.saveState {
            VStack(alignment: .leading, spacing: 6) {
                Text("SAVE FAILED — changes are on screen but not yet stored.").font(.headline)
                Text(msg).font(.footnote)
                Button("Retry Save") { store.saveNow() }.buttonStyle(.borderedProminent).tint(.white)
                    .foregroundStyle(MCIStyle.brick)
            }
            .foregroundStyle(.white)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(MCIStyle.brick)
        }
    }
}

struct MCIOptionGrid<Option: Hashable & Identifiable>: View {
    let options: [Option]
    let selected: Option?
    let title: (Option) -> String
    var minWidth: CGFloat = 130
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
                        .background(isOn ? MCIStyle.navy : MCIStyle.rowFill)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8)
                            .stroke(isOn ? MCIStyle.navy : Color.secondary.opacity(0.4), lineWidth: isOn ? 3 : 1))
                }
                .buttonStyle(.plain)
                .disabled(disabled)
                .accessibilityLabel(title(o))
                .accessibilityAddTraits(isOn ? .isSelected : [])
            }
        }
    }
}

/// Large manual category selector. Unclassified is a separate, explicit choice.
struct MCICategoryPicker: View {
    let selected: TriageCategory?
    var allowUnclassified = true
    var disabled = false
    let onPick: (TriageCategory?) -> Void

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 10)], spacing: 10) {
            ForEach(TriageCategory.allCases) { c in
                button(c.abbr, c.name, c.colorWord, fill: c.swatch, text: c.swatchText, isOn: selected == c) { onPick(c) }
            }
            if allowUnclassified {
                button("UNK", "Not classified", "No category", fill: Color(white: 0.85), text: .black, isOn: selected == nil) { onPick(nil) }
            }
        }
    }

    func button(_ abbr: String, _ name: String, _ word: String, fill: Color, text: Color, isOn: Bool,
                action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Text(abbr).font(.mciHeading(.title2))
                Text(name).font(.subheadline.bold())
                Text(word).font(.caption)
            }
            .foregroundStyle(text)
            .frame(maxWidth: .infinity, minHeight: 76)
            .background(fill)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(isOn ? MCIStyle.navy : Color.clear, lineWidth: 5))
            .overlay(alignment: .topTrailing) {
                if isOn { Image(systemName: "checkmark.circle.fill").font(.title2).foregroundStyle(MCIStyle.navy).padding(4) }
            }
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .accessibilityLabel("\(abbr), \(name), \(word)")
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}

struct MCIField: View {
    @EnvironmentObject var store: MCIStore
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
                .background(MCIStyle.rowFill)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.secondary.opacity(0.5)))
                .focused($focused)
                .disabled(readOnly)
                .submitLabel(.done)
        }
        .onChange(of: focused) { f in if !f { store.flush() } }
    }
}

struct MCIInkTarget: Identifiable, Hashable {
    var incidentID: UUID
    var recordID: UUID
    var fieldID: String
    var title: String
    var width: CGFloat = 1024
    var pageHeight: CGFloat = 768
    var id: String { "\(recordID.uuidString)|\(fieldID)" }
}

struct MCILongText: View {
    @EnvironmentObject var store: MCIStore
    let label: String
    @Binding var text: String
    var minHeight: CGFloat = 120
    var readOnly = false
    var ink: MCIInkTarget? = nil
    @FocusState private var focused: Bool
    @State private var expanded = false
    @State private var showInk: MCIInkTarget?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Text(label).font(.mciHeading(.title3))
                Spacer()
                Button { expanded = true } label: {
                    Label("Expand", systemImage: "arrow.up.left.and.arrow.down.right").frame(minHeight: 40)
                }
                .buttonStyle(.bordered)
                .accessibilityLabel("Expand \(label)")
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
                .background(MCIStyle.rowFill)
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
            MCIExpandedText(label: label, text: $text, readOnly: readOnly).environmentObject(store)
        }
        .fullScreenCover(item: $showInk) { t in
            MCIHandwritingEditor(target: t, readOnly: readOnly, background: nil).environmentObject(store)
        }
    }
}

struct MCIExpandedText: View {
    @EnvironmentObject var store: MCIStore
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
                    ToolbarItem(placement: .confirmationAction) { Button("Done") { store.flush(); dismiss() } }
                    ToolbarItem(placement: .status) { MCISaveStatus() }
                }
        }
    }
}

struct MCITimeSheet: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    let original: Date?
    let tz: TimeZone
    var requireReason: Bool
    let onSave: (Date?, String) -> Void
    @State private var value: Date
    @State private var reason = ""

    init(title: String, original: Date?, tz: TimeZone, requireReason: Bool? = nil, onSave: @escaping (Date?, String) -> Void) {
        self.title = title
        self.original = original
        self.tz = tz
        self.requireReason = requireReason ?? (original != nil)
        self.onSave = onSave
        _value = State(initialValue: original ?? Date())
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Current: \(MCIFmt.full(original, tz: tz))")
                    Text("Earlier values stay in the activity log. Retrospective times are allowed.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Section("Date and time (\(tz.identifier), 24-hour)") {
                    DatePicker("Time", selection: $value, displayedComponents: [.date, .hourAndMinute])
                        .datePickerStyle(.graphical)
                        .environment(\.timeZone, tz)
                        .environment(\.locale, Locale(identifier: "en_GB"))
                    Text("Selected: \(MCIFmt.full(value, tz: tz))").font(.headline)
                    if value > Date().addingTimeInterval(300) {
                        Text("This time is in the future.").foregroundStyle(MCIStyle.brick)
                    }
                }
                Section(requireReason ? "Reason (required)" : "Note (optional)") {
                    TextField("Reason", text: $reason).frame(minHeight: 44)
                }
                if original != nil {
                    Section {
                        Button("Clear This Time", role: .destructive) { onSave(nil, reason.mciTrimmed); dismiss() }
                            .disabled(requireReason && reason.mciTrimmed.isEmpty)
                    }
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { onSave(value, reason.mciTrimmed); dismiss() }
                        .disabled(requireReason && reason.mciTrimmed.isEmpty)
                }
            }
        }
    }
}

/// Shows a full date/time with Now (only when empty) and Enter/Correct.
struct MCITimeRow: View {
    let label: String
    let value: Date?
    let tz: TimeZone
    let ref: Date
    let readOnly: Bool
    let onSet: (Date?, String) -> Void
    @State private var editing = false

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.headline)
                Text(value == nil ? "Not recorded" : MCIFmt.clock(value, tz: tz, ref: ref))
                    .font(.title3.monospacedDigit())
                    .foregroundStyle(value == nil ? .secondary : .primary)
            }
            Spacer()
            if !readOnly {
                if value == nil {
                    Button("Now") { onSet(Date(), "Now") }
                        .buttonStyle(.borderedProminent).tint(MCIStyle.navy)
                        .frame(minWidth: 72, minHeight: 48)
                        .accessibilityLabel("Set \(label) to now")
                }
                Button(value == nil ? "Enter…" : "Correct…") { editing = true }
                    .buttonStyle(.bordered).frame(minHeight: 48)
                    .accessibilityLabel(value == nil ? "Enter \(label)" : "Correct \(label)")
            }
        }
        .frame(minHeight: 56)
        .sheet(isPresented: $editing) { MCITimeSheet(title: label, original: value, tz: tz, onSave: onSet) }
    }
}

/// Optional nonnegative count: blank = Unknown, 0 = zero. Large, separated −/+ controls.
struct MCICountField: View {
    let label: String
    @Binding var value: Int?
    var accent: Color = MCIStyle.navy
    var accentText: Color = .white
    @State private var text = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.headline)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .foregroundStyle(accentText).background(accent).clipShape(RoundedRectangle(cornerRadius: 4))
            HStack(spacing: 16) {
                Button { value = max(0, (value ?? 1) - 1) } label: {
                    Image(systemName: "minus").font(.title2.bold()).frame(width: 60, height: 56)
                }
                .buttonStyle(.bordered)
                .disabled(value == nil || value == 0)
                .accessibilityLabel("Decrease \(label)")
                TextField("Unknown", text: $text)
                    .keyboardType(.numberPad)
                    .font(.title.monospacedDigit().bold())
                    .multilineTextAlignment(.center)
                    .frame(minWidth: 90, minHeight: 56)
                    .background(MCIStyle.rowFill)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .accessibilityLabel("\(label) count")
                Button { value = (value ?? -1) + 1 } label: {
                    Image(systemName: "plus").font(.title2.bold()).frame(width: 60, height: 56)
                }
                .buttonStyle(.bordered)
                .accessibilityLabel("Increase \(label)")
                Button("Unknown") { value = nil }
                    .buttonStyle(.bordered).frame(minHeight: 48)
                    .accessibilityLabel("Set \(label) to unknown")
            }
            Text(value == nil ? "Unknown" : "\(value!)").font(.caption).foregroundStyle(.secondary)
        }
        .onAppear { text = value.map(String.init) ?? "" }
        .onChange(of: value) { v in
            let s = v.map(String.init) ?? ""
            if s != text { text = s }
        }
        .onChange(of: text) { t in
            let digits = t.filter(\.isNumber)
            if digits != t { text = digits; return }
            let v: Int? = digits.isEmpty ? nil : Int(digits)
            if v != value { value = v }
        }
    }
}

struct MCIPDFPreview: UIViewRepresentable {
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

struct MCIHistoryList: View {
    let incident: MCIIncident
    let recordIDs: Set<UUID>?
    var limit = 15
    @State private var showAll = false

    var body: some View {
        let events = incident.events.filter { recordIDs?.contains($0.recordID) ?? true }.sorted { $0.recordedAt > $1.recordedAt }
        let shown = showAll ? events : Array(events.prefix(limit))
        VStack(alignment: .leading, spacing: 8) {
            if events.isEmpty { Text("No activity yet.").foregroundStyle(.secondary) }
            ForEach(shown) { e in
                VStack(alignment: .leading, spacing: 2) {
                    Text(incident.describe(e))
                    Text("\(incident.recordLabel(e.recordID)) · recorded \(MCIFmt.full(e.recordedAt, tz: incident.timeZone))\(e.initials.isEmpty ? "" : " · " + e.initials)")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Divider()
            }
            if events.count > limit {
                Button(showAll ? "Show fewer" : "Show all \(events.count) entries") { showAll.toggle() }.frame(minHeight: 48)
            }
        }
    }
}

// MARK: - Handwriting (PencilKit)

final class MCIInkController: ObservableObject {
    weak var canvas: PKCanvasView?
    @Published var fingerDraw = false
    @Published var pageCount = 1
    @Published var erasedDrawing: PKDrawing?
    @Published var tool = 0   // 0 pen, 1 eraser, 2 lasso
    var width: CGFloat = 1024
    var pageHeight: CGFloat = 768
    var onChange: ((PKDrawing) -> Void)?

    func setTool(_ k: Int) {
        tool = k
        guard let c = canvas else { return }
        switch k {
        case 1: c.tool = PKEraserTool(.vector)
        case 2: c.tool = PKLassoTool()
        default: c.tool = PKInkingTool(.pen, color: .black, width: 4)
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
        let s = c.bounds.width / width
        c.minimumZoomScale = min(s, 0.3)
        c.maximumZoomScale = max(s * 4, 4)
        c.setZoomScale(s, animated: false)
    }

    func fitPage() {
        guard let c = canvas, c.bounds.width > 0, c.bounds.height > 0 else { return }
        let s = min(c.bounds.width / width, c.bounds.height / pageHeight)
        c.minimumZoomScale = min(s, 0.3)
        c.setZoomScale(s, animated: true)
    }

    func zoom(_ factor: CGFloat) {
        guard let c = canvas else { return }
        c.setZoomScale(min(max(c.zoomScale * factor, c.minimumZoomScale), c.maximumZoomScale), animated: true)
    }

    func scrollPage(_ delta: Int) {
        guard let c = canvas else { return }
        let step = c.bounds.height * 0.85 * CGFloat(delta)
        let maxY = max(0, c.contentSize.height - c.bounds.height)
        c.setContentOffset(CGPoint(x: c.contentOffset.x, y: min(max(0, c.contentOffset.y + step), maxY)), animated: true)
    }
}

struct MCIInkCanvas: UIViewRepresentable {
    let initial: PKDrawing
    let readOnly: Bool
    let background: UIImage?
    @ObservedObject var controller: MCIInkController

    func makeCoordinator() -> MCIInkCoordinator { MCIInkCoordinator(controller: controller, background: background) }

    func makeUIView(context: Context) -> PKCanvasView {
        let c = PKCanvasView()
        c.overrideUserInterfaceStyle = .light
        c.backgroundColor = .white
        c.isOpaque = true
        c.drawing = initial
        c.delegate = context.coordinator
        c.tool = PKInkingTool(.pen, color: .black, width: 4)
        c.drawingPolicy = controller.fingerDraw ? .anyInput : .pencilOnly
        c.drawingGestureRecognizer.isEnabled = !readOnly
        c.minimumZoomScale = 0.25
        c.maximumZoomScale = 5
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

    static func dismantleUIView(_ c: PKCanvasView, coordinator: MCIInkCoordinator) {
        coordinator.picker?.setVisible(false, forFirstResponder: c)
        coordinator.picker?.removeObserver(c)
        c.resignFirstResponder()
    }
}

final class MCIInkCoordinator: NSObject, PKCanvasViewDelegate {
    let controller: MCIInkController
    let background: UIImage?
    var picker: PKToolPicker?
    var separators: [UIView] = []
    var backgroundView: UIImageView?

    init(controller: MCIInkController, background: UIImage?) {
        self.controller = controller
        self.background = background
    }

    func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) { controller.onChange?(canvasView.drawing) }

    func scrollViewDidZoom(_ scrollView: UIScrollView) {
        if let c = scrollView as? PKCanvasView { layout(c) }
    }

    /// Fixed logical page × zoom. The locked background sits behind the ink and is not ink, so erasing cannot remove it.
    func layout(_ c: PKCanvasView) {
        let z = c.zoomScale
        let pages = max(1, controller.pageCount)
        let size = CGSize(width: controller.width * z, height: controller.pageHeight * CGFloat(pages) * z)
        if c.contentSize != size { c.contentSize = size }
        if let bg = background {
            if backgroundView == nil {
                let v = UIImageView(image: bg)
                v.contentMode = .scaleAspectFit
                v.isUserInteractionEnabled = false
                c.insertSubview(v, at: 0)
                backgroundView = v
            }
            backgroundView?.frame = CGRect(x: 0, y: 0, width: controller.width * z, height: controller.pageHeight * z)
        }
        while separators.count < pages - 1 {
            let v = UIView()
            v.backgroundColor = UIColor.systemBlue.withAlphaComponent(0.35)
            v.isUserInteractionEnabled = false
            c.insertSubview(v, at: 0)
            separators.append(v)
        }
        while separators.count > pages - 1 { separators.removeLast().removeFromSuperview() }
        for (i, v) in separators.enumerated() {
            v.frame = CGRect(x: 0, y: controller.pageHeight * CGFloat(i + 1) * z - 1, width: size.width, height: 2)
        }
    }
}

struct MCIHandwritingEditor: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.dismiss) private var dismiss
    let target: MCIInkTarget
    let readOnly: Bool
    let background: UIImage?
    var allowPages = true
    @StateObject private var controller = MCIInkController()
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
                        Text("Handwriting Could Not Be Read").font(.mciHeading(.title2))
                        Text(loadError)
                        Text("The stored data has not been changed and is still included in backups.").font(.footnote)
                    }
                    .padding().frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let initial {
                    MCIInkCanvas(initial: initial, readOnly: readOnly, background: background, controller: controller)
                        .id(target.id)
                } else {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                Text(controller.fingerDraw
                     ? "Finger Draw on: one finger writes; two fingers scroll and zoom, or use the page and zoom buttons. Ink is an attachment and never changes counts, categories, locations or times."
                     : "Apple Pencil writes; fingers scroll and pinch to zoom. Turn on Finger Draw to write without a Pencil. Ink is an attachment and never changes counts, categories, locations or times.")
                    .font(.footnote).foregroundStyle(.secondary).padding(8)
            }
            .navigationTitle(target.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .status) { MCISaveStatus() }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { store.flush(); dismiss() }.accessibilityLabel("Done, close handwriting")
                }
            }
        }
        .task { load() }
        .confirmationDialog("Erase all handwriting on every page of this attachment? The background is not affected.",
                            isPresented: $confirmErase, titleVisibility: .visible) {
            Button("Erase All", role: .destructive) { controller.eraseAll() }
        }
    }

    var controls: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 8)], spacing: 8) {
            toolButton("Pen", "pencil.tip", 0)
            toolButton("Eraser", "eraser", 1)
            toolButton("Lasso", "lasso", 2)
            Button { controller.undo() } label: { cell("Undo", "arrow.uturn.backward") }.buttonStyle(.bordered)
            Button { controller.redo() } label: { cell("Redo", "arrow.uturn.forward") }.buttonStyle(.bordered)
            Button { controller.fingerDraw.toggle() } label: {
                cell(controller.fingerDraw ? "Finger Draw: On" : "Finger Draw: Off", "hand.draw")
            }
            .buttonStyle(.borderedProminent).tint(controller.fingerDraw ? MCIStyle.navy : Color.gray)
            Group {
                if allowPages {
                    Button {
                        controller.pageCount += 1
                        if let c = controller.canvas { store.saveInk(target, drawing: c.drawing, pageCount: controller.pageCount) }
                    } label: { cell("Add Page", "doc.badge.plus") }.buttonStyle(.bordered)
                    Button { controller.scrollPage(-1) } label: { cell("Page Up", "chevron.up") }.buttonStyle(.bordered)
                    Button { controller.scrollPage(1) } label: { cell("Page Down", "chevron.down") }.buttonStyle(.bordered)
                }
                Button { controller.zoom(1.25) } label: { cell("Zoom In", "plus.magnifyingglass") }.buttonStyle(.bordered)
                Button { controller.zoom(0.8) } label: { cell("Zoom Out", "minus.magnifyingglass") }.buttonStyle(.bordered)
                Button { controller.fitPage() } label: { cell("Reset Zoom", "arrow.up.left.and.down.right.magnifyingglass") }.buttonStyle(.bordered)
            }
            if controller.erasedDrawing != nil {
                Button { controller.restoreErased() } label: { cell("Undo Erase All", "arrow.uturn.backward.circle") }
                    .buttonStyle(.borderedProminent).tint(MCIStyle.navy)
            } else {
                Button(role: .destructive) { confirmErase = true } label: { cell("Erase All…", "trash") }.buttonStyle(.bordered)
            }
        }
        .padding(8)
    }

    func toolButton(_ title: String, _ icon: String, _ k: Int) -> some View {
        Button { controller.setTool(k) } label: { cell(title, icon) }
            .buttonStyle(.borderedProminent)
            .tint(controller.tool == k ? MCIStyle.navy : Color.gray)
            .accessibilityAddTraits(controller.tool == k ? .isSelected : [])
    }

    func cell(_ title: String, _ icon: String) -> some View {
        Label(title, systemImage: icon).font(.subheadline.bold()).frame(maxWidth: .infinity, minHeight: 44)
    }

    func load() {
        guard initial == nil, loadError == nil else { return }
        controller.width = target.width
        controller.pageHeight = target.pageHeight
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

// MARK: - Root and Home

struct MCIRootView: View {
    @StateObject private var store = MCIStore()
    @Environment(\.scenePhase) private var scenePhase
    @State private var path: [UUID] = []

    var body: some View {
        ZStack {
            NavigationStack(path: $path) {
                if let problem = store.loadProblem {
                    MCIRecoveryView(problem: problem)
                } else {
                    MCIHomeView(path: $path)
                }
            }
            if scenePhase != .active {
                ZStack {
                    MCIStyle.navy.ignoresSafeArea()
                    VStack(spacing: 8) {
                        Text("SUMTER EMS — MCI BOARD").font(.mciHeading(.largeTitle)).foregroundStyle(.white)
                        Text("Board hidden while the app is not active").foregroundStyle(.white.opacity(0.85))
                    }
                }
            }
        }
        .environmentObject(store)
        .onChange(of: scenePhase) { phase in
            if phase == .active { store.applyIdleTimer() } else { store.flush(); UIApplication.shared.isIdleTimerDisabled = false }
        }
    }
}

struct MCIRecoveryView: View {
    @EnvironmentObject var store: MCIStore
    let problem: String
    @State private var confirm = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Saved Incidents Could Not Be Opened").font(.mciHeading(.largeTitle))
                Text(problem)
                Text("Nothing has been deleted or replaced, and saving is paused so the file cannot be overwritten. Try again (for example after freeing storage), or move the unreadable file aside and start empty; the moved file stays in this app's Documents/MCIBoard folder.")
                Button { store.load() } label: { MCIBigLabel(title: "Try Loading Again", systemImage: "arrow.clockwise") }
                    .buttonStyle(.borderedProminent).tint(MCIStyle.navy)
                Button(role: .destructive) { confirm = true } label: { MCIBigLabel(title: "Move Unreadable File Aside…", systemImage: "folder") }
                    .buttonStyle(.bordered)
            }
            .padding(24).frame(maxWidth: 760)
        }
        .confirmationDialog("Move the unreadable file aside and start with no incidents?", isPresented: $confirm, titleVisibility: .visible) {
            Button("Move Aside and Start Empty", role: .destructive) { store.setAsideUnreadableFile() }
        }
    }
}

struct MCIHomeView: View {
    @EnvironmentObject var store: MCIStore
    @Binding var path: [UUID]
    @State private var showSettings = false
    @State private var showImporter = false
    @State private var importMessage: String?
    @State private var duplicateData: Data?
    @State private var creating = false

    var open: [MCIIncident] { store.data.incidents.filter { $0.state == .open }.sorted { $0.createdAt > $1.createdAt } }
    var closed: [MCIIncident] {
        store.data.incidents.filter { $0.state == .closed }.sorted { ($0.closedAt ?? $0.createdAt) > ($1.closedAt ?? $1.createdAt) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack(spacing: 14) {
                    if let shield = UIImage(named: "SumterShield") {
                        Image(uiImage: shield).resizable().scaledToFit().frame(height: 72)
                            .accessibilityLabel("Sumter County EMS shield")
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text("SUMTER COUNTY EMS").font(.mciHeading(.largeTitle)).foregroundStyle(.white)
                        Text("MCI INCIDENT COMMAND BOARD").font(.mciHeading(.title3)).foregroundStyle(.white.opacity(0.9))
                    }
                    Spacer()
                }
                .padding(16)
                .background(MCIStyle.navy)
                MCISaveFailureBanner()
                if !open.isEmpty {
                    MCISectionBox(title: "Resume Open Incident") {
                        ForEach(open) { i in incidentButton(i, primary: i.id == open.first?.id) }
                    }
                }
                MCISectionBox(title: "Start") {
                    Button { create(training: false) } label: { MCIBigLabel(title: "New Incident", systemImage: "exclamationmark.triangle") }
                        .buttonStyle(.borderedProminent).tint(MCIStyle.navy).disabled(creating)
                    Button { create(training: true) } label: { MCIBigLabel(title: "New Training Incident (fictitious data)", systemImage: "graduationcap") }
                        .buttonStyle(.bordered).disabled(creating)
                    Text("A new incident opens immediately with a local ID. Name, location and details can be added later. Nothing needs a network or account.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                MCISectionBox(title: "Closed Incidents") {
                    if closed.isEmpty { Text("None.").foregroundStyle(.secondary) }
                    ForEach(closed) { i in
                        Button { path.append(i.id) } label: {
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(i.displayName).font(.headline)
                                    if let p = i.provenance { Text(p).font(.footnote).foregroundStyle(.secondary) }
                                }
                                Spacer()
                                if i.isTraining { MCITag(text: "TRAINING", color: MCIStyle.slate) }
                                Text("Open (read-only)").foregroundStyle(MCIStyle.navy)
                            }
                            .frame(minHeight: 56).contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                MCISectionBox(title: "Backups and Settings") {
                    Button { showImporter = true } label: { MCIBigLabel(title: "Import Incident Backup as a Separate Copy…", systemImage: "square.and.arrow.down") }
                        .buttonStyle(.bordered)
                    Button { showSettings = true } label: { MCIBigLabel(title: "Settings, Directories and Built-in Checks", systemImage: "gearshape") }
                        .buttonStyle(.bordered)
                }
                Text("This iPad holds the working copy. Exports and backups are copies; other devices do not see live updates.")
                    .font(.footnote).foregroundStyle(.secondary)
                MCISaveStatus()
            }
            .padding()
            .frame(maxWidth: 900)
            .frame(maxWidth: .infinity)
        }
        .navigationTitle("MCI Board")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: UUID.self) { id in MCIIncidentView(incidentID: id) }
        .sheet(isPresented: $showSettings) { MCISettingsView().environmentObject(store) }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [.json]) { result in handleImport(result) }
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
        .onAppear { creating = false }
    }

    func create(training: Bool) {
        guard !creating else { return }
        creating = true
        let id = store.newIncident(training: training)
        path.append(id)
    }

    func incidentButton(_ i: MCIIncident, primary: Bool) -> some View {
        Button { path.append(i.id) } label: {
            VStack(alignment: .leading, spacing: 4) {
                Text("Resume: \(i.displayName)").font(.title3.bold())
                Text("\(i.isTraining ? "TRAINING · " : "")Started \(MCIFmt.full(i.createdAt, tz: i.timeZone)) · \(i.activePatients.count) tracked patients")
                    .font(.subheadline)
            }
            .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
            .padding(.horizontal, 8)
        }
        .buttonStyle(.borderedProminent)
        .tint(primary ? MCIStyle.navy : MCIStyle.slate)
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

    func report(_ o: MCIStore.ImportOutcome) {
        switch o {
        case .imported: importMessage = "Imported as a separate, read-only restored copy under Closed Incidents. Use Reopen to edit it."
        case .duplicate: importMessage = "Already imported."
        case .invalid(let m): importMessage = m
        }
    }
}

// MARK: - Incident shell

enum MCISection: String, CaseIterable, Identifiable {
    case overview, command, triage, hospitals, transport, staging, sketch, activity
    var id: String { rawValue }
    var title: String {
        switch self {
        case .overview: return "Overview"
        case .command: return "Command"
        case .triage: return "Triage"
        case .hospitals: return "Hospitals and Aid"
        case .transport: return "Transport"
        case .staging: return "Staging"
        case .sketch: return "Sketch"
        case .activity: return "Activity"
        }
    }
    var icon: String {
        switch self {
        case .overview: return "rectangle.grid.2x2"
        case .command: return "person.3"
        case .triage: return "list.number"
        case .hospitals: return "cross.case"
        case .transport: return "car"
        case .staging: return "parkingsign"
        case .sketch: return "pencil.and.outline"
        case .activity: return "clock.arrow.circlepath"
        }
    }
}

struct MCIIncidentView: View {
    @EnvironmentObject var store: MCIStore
    let incidentID: UUID
    @State private var section: MCISection = .overview
    @State private var openPatient: MCIIDBox?
    @State private var showSnapshot = false
    @State private var showHandover = false
    @State private var showExport = false
    @State private var confirmClose = false
    @State private var confirmReopen = false
    @State private var adding = false

    var body: some View {
        Group {
            if let inc = store.incident(incidentID) {
                shell(inc)
            } else {
                Text("This incident is no longer available.")
            }
        }
        .onAppear { store.boardVisible = true; store.applyIdleTimer() }
        .onDisappear { store.flush(); store.boardVisible = false; store.applyIdleTimer() }
    }

    func shell(_ inc: MCIIncident) -> some View {
        VStack(spacing: 0) {
            identityBar(inc)
            MCISaveFailureBanner()
            if inc.isTraining {
                Text("TRAINING — FICTITIOUS DATA — NOT AN OPERATIONAL RECORD")
                    .font(.mciHeading(.headline)).foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 32).background(MCIStyle.slate)
            }
            if inc.isClosed {
                HStack {
                    Text("CLOSED — read-only. \(inc.provenance ?? "")").font(.headline)
                    Spacer()
                    Button("Reopen…") { confirmReopen = true }.buttonStyle(.borderedProminent).tint(MCIStyle.navy)
                }
                .padding(10).background(Color.yellow.opacity(0.25))
            }
            navigator
            ScrollView {
                content(inc)
                    .padding()
                    .frame(maxWidth: 1100)
                    .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .navigationTitle(section.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .status) { MCISaveStatus() }
            ToolbarItemGroup(placement: .primaryAction) {
                Button { store.flush(); showHandover = true } label: { Label("Handover", systemImage: "doc.plaintext") }
                Button { store.flush(); showExport = true } label: { Label("Export", systemImage: "square.and.arrow.up") }
                Menu {
                    Toggle(isOn: Binding(get: { store.data.settings.keepAwake }, set: { v in store.updateSettings { $0.keepAwake = v } })) {
                        Label("Keep Screen Awake on Board", systemImage: "sun.max")
                    }
                    if inc.isClosed {
                        Button { confirmReopen = true } label: { Label("Reopen Incident…", systemImage: "lock.open") }
                    } else {
                        Button { confirmClose = true } label: { Label("Close Incident…", systemImage: "archivebox") }
                    }
                } label: { Label("More", systemImage: "ellipsis.circle") }
            }
        }
        .fullScreenCover(item: $openPatient) { box in
            MCIPatientEditor(incidentID: incidentID, patientID: box.id, onAddAnother: addPatient).environmentObject(store)
        }
        .sheet(isPresented: $showSnapshot) { MCISnapshotSheet(incidentID: incidentID, correcting: nil).environmentObject(store) }
        .sheet(isPresented: $showHandover) { MCIHandoverSheet(incidentID: incidentID).environmentObject(store) }
        .sheet(isPresented: $showExport) { MCIExportSheet(snapshot: inc).environmentObject(store) }
        .confirmationDialog("Close this incident? It becomes read-only. Patients, counts and history are kept; nothing is reset or deleted. Export a final packet from Export.",
                            isPresented: $confirmClose, titleVisibility: .visible) {
            Button("Close Incident") {
                let t = store.now()
                let ini = store.initials
                store.update(incidentID) { $0.close(now: t, initials: ini) }
            }
        }
        .confirmationDialog("Reopen this incident for editing? The reopen is recorded in its activity.",
                            isPresented: $confirmReopen, titleVisibility: .visible) {
            Button("Reopen Incident") {
                let t = store.now()
                let ini = store.initials
                store.update(incidentID, allowClosed: true) { $0.reopen(now: t, initials: ini) }
            }
        }
    }

    func identityBar(_ inc: MCIIncident) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(inc.name.mciTrimmed.isEmpty ? "UNNAMED INCIDENT" : inc.name.uppercased())
                    .font(.mciHeading(.title)).foregroundStyle(.white).lineLimit(2)
                Text("\(inc.localNumber) · \(inc.timeZoneID) · started \(MCIFmt.full(inc.createdAt, tz: inc.timeZone))")
                    .font(.subheadline).foregroundStyle(.white.opacity(0.85))
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text("MCI LEVEL \(inc.level.uppercased())").font(.mciHeading(.headline)).foregroundStyle(.white)
                Text(section.title.uppercased()).font(.subheadline.bold()).foregroundStyle(.white.opacity(0.85))
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(MCIStyle.navy)
        .accessibilityElement(children: .combine)
    }

    var navigator: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 130), spacing: 6)], spacing: 6) {
            ForEach(MCISection.allCases) { s in
                Button { store.flush(); section = s } label: {
                    Label(s.title, systemImage: s.icon)
                        .font(.subheadline.bold())
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .foregroundStyle(section == s ? Color.white : Color.primary)
                        .background(section == s ? MCIStyle.navy : MCIStyle.rowFill)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(section == s ? .isSelected : [])
            }
        }
        .padding(8)
        .background(Color(uiColor: .secondarySystemBackground))
    }

    @ViewBuilder
    func content(_ inc: MCIIncident) -> some View {
        switch section {
        case .overview:
            MCIOverviewSection(incident: inc, onAddPatient: addPatient, onSnapshot: { showSnapshot = true },
                               onGo: { section = $0 }, onOpenPatient: { openPatient = MCIIDBox(id: $0) })
        case .command: MCICommandSection(incident: inc)
        case .triage: MCITriageSection(incident: inc, onSnapshot: { showSnapshot = true })
        case .hospitals: MCIHospitalsSection(incident: inc)
        case .transport: MCITransportSection(incident: inc, onAddPatient: addPatient, onOpenPatient: { openPatient = MCIIDBox(id: $0) })
        case .staging: MCIStagingSection(incident: inc)
        case .sketch: MCISketchSection(incident: inc)
        case .activity: MCISectionBox(title: "Activity") { MCIHistoryList(incident: inc, recordIDs: nil, limit: 100) }
        }
    }

    func addPatient() {
        guard !adding else { return }
        adding = true
        store.flush()
        var newID: UUID?
        let t = store.now()
        let initials = store.initials
        store.update(incidentID) { newID = $0.addPatient(now: t, initials: initials) }
        if let newID {
            openPatient = nil
            DispatchQueue.main.async { openPatient = MCIIDBox(id: newID); adding = false }
        } else {
            adding = false
        }
    }
}

// MARK: - Overview

struct MCIOverviewSection: View {
    let incident: MCIIncident
    let onAddPatient: () -> Void
    let onSnapshot: () -> Void
    let onGo: (MCISection) -> Void
    let onOpenPatient: (UUID) -> Void

    var body: some View {
        let inc = incident
        VStack(alignment: .leading, spacing: 16) {
            if !inc.isClosed {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 220), spacing: 10)], spacing: 10) {
                    Button(action: onAddPatient) { MCIBigLabel(title: "Add Patient", systemImage: "person.badge.plus") }
                        .buttonStyle(.borderedProminent).tint(MCIStyle.navy)
                    Button(action: onSnapshot) { MCIBigLabel(title: "Update Reported Count", systemImage: "number") }
                        .buttonStyle(.borderedProminent).tint(MCIStyle.navy)
                    Button { onGo(.staging) } label: { MCIBigLabel(title: "Add Resource", systemImage: "truck.box") }
                        .buttonStyle(.bordered)
                    Button { onGo(.transport) } label: { MCIBigLabel(title: "Record Departure", systemImage: "arrow.right.circle") }
                        .buttonStyle(.bordered)
                }
            }
            MCISectionBox(title: "Incident") {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 220), alignment: .topLeading)], alignment: .leading, spacing: 10) {
                    MCIFieldValue(label: "Location", value: inc.location.mciNR)
                    MCIFieldValue(label: "Type", value: typeText(inc))
                    MCIFieldValue(label: "Occurred / started", value: MCIFmt.full(inc.occurrenceAt, tz: inc.timeZone))
                    MCIFieldValue(label: "Command established", value: MCIFmt.full(inc.commandEstablishedAt, tz: inc.timeZone))
                    MCIFieldValue(label: "Incident Commander", value: inc.currentAssignment("Incident Commander")?.person.mciNR ?? "Unassigned")
                    MCIFieldValue(label: "Command Post", value: inc.commandPost.mciNR)
                }
                Button { onGo(.command) } label: { Text("Edit in Command").frame(minHeight: 44) }.buttonStyle(.bordered)
            }
            MCICountsPanel(incident: inc)
            let issues = inc.reconciliationIssues
            if !issues.isEmpty {
                MCISectionBox(title: "Needs Completion or Reconciliation", accent: MCIStyle.brick) {
                    ForEach(issues, id: \.self) { Label($0, systemImage: "exclamationmark.triangle").foregroundStyle(MCIStyle.brick) }
                    Button { onGo(.transport) } label: { Text("Go to Transport").frame(minHeight: 44) }.buttonStyle(.bordered)
                }
            }
            MCISectionBox(title: "Hospitals — Last Reported") {
                ForEach(inc.hospitals) { h in
                    let poll = inc.latestPoll(h.id)
                    HStack {
                        Text(h.name).font(.headline)
                        Spacer()
                        Text(poll == nil ? "No poll" : "Poll \(MCIFmt.age(of: poll?.observedAt, now: Date()))")
                            .foregroundStyle(.secondary)
                        Text("Sent \(inc.sentTotal(to: h.id))").font(.headline.monospacedDigit())
                    }
                    .frame(minHeight: 36)
                }
                let unknownDest = inc.sentTotal(to: nil)
                if unknownDest > 0 {
                    Text("\(unknownDest) departed with destination Unknown — complete in Transport.").foregroundStyle(MCIStyle.brick)
                }
            }
            MCISectionBox(title: "Command Checklist") {
                let pending = inc.checklist.filter { $0.state == .pending }
                Text("\(pending.count) of \(inc.checklist.count) pending").font(.headline)
                ForEach(pending.prefix(4)) { Text("• \($0.text)") }
                Button { onGo(.command) } label: { Text("Open Checklist").frame(minHeight: 44) }.buttonStyle(.bordered)
            }
        }
    }

    func typeText(_ inc: MCIIncident) -> String {
        var t = inc.types
        if !inc.otherType.mciTrimmed.isEmpty { t.append(inc.otherType) }
        return t.isEmpty ? "Not recorded" : t.joined(separator: ", ")
    }
}

struct MCIFieldValue: View {
    let label: String
    let value: String
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased()).font(.caption.bold()).foregroundStyle(.secondary)
            Text(value).foregroundStyle(value == "Not recorded" || value == "—" ? .secondary : .primary)
        }
        .accessibilityElement(children: .combine)
    }
}

/// The two count sources, side by side, each labelled with its own scope and time. Never added together.
struct MCICountsPanel: View {
    let incident: MCIIncident

    var body: some View {
        let inc = incident
        let r = inc.register()
        let snap = inc.latestSnapshot
        VStack(alignment: .leading, spacing: 12) {
            MCISectionBox(title: "A · Reported Scene Count (manual snapshot)") {
                if let s = snap {
                    Text("Patients reportedly still on scene. Observed \(MCIFmt.full(s.observedAt, tz: inc.timeZone)) · source \(s.reporter.mciNR).")
                        .font(.callout)
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 8)], spacing: 8) {
                        ForEach(TriageCategory.allCases) { c in
                            MCICountTile(title: "\(c.abbr) \(c.name)", value: s.value(c).map(String.init) ?? "Unknown",
                                         fill: c.swatch, text: c.swatchText)
                        }
                    }
                    Text(s.totalText).font(.title3.bold())
                } else {
                    Text("No reported count recorded yet.").foregroundStyle(.secondary)
                }
            }
            MCISectionBox(title: "B · Patient Register (tracked individual records)") {
                Text("Derived from \(r.allTotal) tracked patient records as of now. Entered-in-error records are excluded.")
                    .font(.callout)
                MCIRegisterTable(register: r)
            }
            if let s = snap {
                if s.isComplete && s.knownSubtotal != r.onSceneTotal {
                    Text("Reported on scene (\(s.knownSubtotal)) and tracked on scene (\(r.onSceneTotal)) differ. Reconcile; neither is assumed wrong, and they are never added together.")
                        .font(.callout).padding(10).background(Color.yellow.opacity(0.2))
                }
            }
        }
    }
}

struct MCICountTile: View {
    let title: String
    let value: String
    let fill: Color
    let text: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.title.bold().monospacedDigit())
            Text(title).font(.subheadline.bold())
        }
        .foregroundStyle(text)
        .padding(10)
        .frame(maxWidth: .infinity, minHeight: 70, alignment: .leading)
        .background(fill)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .accessibilityElement(children: .combine)
    }
}

struct MCIRegisterTable: View {
    let register: MCIRegister
    var body: some View {
        let r = register
        VStack(spacing: 0) {
            row("Category", "Tracked", "On scene", "Departed", "Location unknown", header: true)
            ForEach(MCIRegister.keys, id: \.self) { k in
                row(MCIRegister.label(k), "\(r.all[k] ?? 0)", "\(r.onScene[k] ?? 0)", "\(r.departed[k] ?? 0)", "\(r.unknownLocation[k] ?? 0)")
            }
            row("Total", "\(r.allTotal)", "\(r.onSceneTotal)", "\(r.departedTotal)", "\(r.unknownTotal)", header: true)
        }
    }

    func row(_ a: String, _ b: String, _ c: String, _ d: String, _ e: String, header: Bool = false) -> some View {
        HStack {
            Text(a).frame(maxWidth: .infinity, alignment: .leading)
            Text(b).frame(width: 74, alignment: .trailing)
            Text(c).frame(width: 84, alignment: .trailing)
            Text(d).frame(width: 84, alignment: .trailing)
            Text(e).frame(width: 96, alignment: .trailing)
        }
        .font(header ? .subheadline.bold() : .body.monospacedDigit())
        .padding(.vertical, 6)
        .background(header ? MCIStyle.rowFill : Color.clear)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Command (source page 1)

struct MCICommandSection: View {
    @EnvironmentObject var store: MCIStore
    let incident: MCIIncident
    @State private var assignRole: String?
    @State private var newRole = ""

    var id: UUID { incident.id }
    var ro: Bool { incident.isClosed }

    var body: some View {
        let inc = incident
        VStack(alignment: .leading, spacing: 16) {
            MCISectionBox(title: "Incident") {
                MCIField(label: "Incident Name", text: store.text(id, \.name), readOnly: ro)
                MCITimeRow(label: "Date/Time (occurrence / start)", value: inc.occurrenceAt, tz: inc.timeZone, ref: inc.refDate,
                           readOnly: ro) { v, reason in setTime(\.occurrenceAt, "Occurrence", v, reason) }
                Text("Created on this iPad \(MCIFmt.full(inc.createdAt, tz: inc.timeZone)). Occurrence time is kept separately and is never filled in automatically.")
                    .font(.footnote).foregroundStyle(.secondary)
                MCILongText(label: "Location / Address", text: store.text(id, \.location), minHeight: 80, readOnly: ro)
                Group {
                Text("Incident Type (select all that apply)").font(.headline)
                MCIOptionGrid(options: MCISeeds.incidentTypes.map { MCIIDString($0) },
                              selected: nil, title: { t in (inc.types.contains(t.id) ? "✓ " : "") + t.id }, disabled: ro) { t in
                    store.update(id) { i in
                        if let k = i.types.firstIndex(of: t.id) { i.types.remove(at: k) } else { i.types.append(t.id) }
                    }
                }
                if inc.types.contains("Other") {
                    MCIField(label: "Other type", text: store.text(id, \.otherType), readOnly: ro)
                }
                Text("MCI Level").font(.headline)
                MCIOptionGrid(options: (["Unknown"] + store.data.settings.levels).map { MCIIDString($0) },
                              selected: MCIIDString(inc.level), title: { $0.id }, minWidth: 110, disabled: ro) { v in
                    let t = store.now()
                    let ini = store.initials
                    store.update(id) { i in
                        guard i.level != v.id else { return }
                        let old = i.level
                        i.level = v.id
                        i.log(i.id, "incident", "levelChanged", before: old, after: v.id, now: t, initials: ini)
                    }
                }
                Text("Levels are labels only. The app never sets or escalates a level from patient numbers.")
                    .font(.footnote).foregroundStyle(.secondary)
                }
                MCITimeRow(label: "Command Established", value: inc.commandEstablishedAt, tz: inc.timeZone, ref: inc.refDate,
                           readOnly: ro) { v, reason in setTime(\.commandEstablishedAt, "Command Established", v, reason) }
            }
            MCISectionBox(title: "Communications (operator-entered)") {
                MCIField(label: "Command Channel", text: store.text(id, \.commandChannel), readOnly: ro)
                MCIField(label: "Tactical / Ops", text: store.text(id, \.tacticalChannel), readOnly: ro)
                MCIField(label: "Medical / Hospital", text: store.text(id, \.medicalChannel), readOnly: ro)
                MCIField(label: "Air / Mutual Aid", text: store.text(id, \.airAidChannel), readOnly: ro)
                MCIField(label: "Command Post Location", text: store.text(id, \.commandPost), readOnly: ro)
            }
            MCISectionBox(title: "Scene Notes (added to the source fields)") {
                MCILongText(label: "Access / Egress", text: store.text(id, \.accessEgress), minHeight: 120, readOnly: ro)
                MCILongText(label: "Hazards", text: store.text(id, \.hazards), minHeight: 120, readOnly: ro)
                MCILongText(label: "Command Notes", text: store.text(id, \.commandNotes), minHeight: 200, readOnly: ro,
                            ink: MCIInkTarget(incidentID: id, recordID: id, fieldID: "commandNotes", title: "Command Notes"))
            }
            MCIChecklistBox(incident: inc)
            MCISectionBox(title: "Assignments") {
                Text("Empty means Unassigned. Reassigning relieves the current holder and keeps the history. Roles and reporting lines are local entries, not a fixed hierarchy.")
                    .font(.footnote).foregroundStyle(.secondary)
                ForEach(inc.roleNames, id: \.self) { role in roleRow(inc, role) }
                if !ro {
                    HStack {
                        TextField("Add a role", text: $newRole).textFieldStyle(.roundedBorder).frame(minHeight: 48)
                        Button("Add Role") {
                            let r = newRole.mciTrimmed
                            guard !r.isEmpty else { return }
                            store.update(id) { i in if !i.roleNames.contains(r) { i.roleNames.append(r) } }
                            newRole = ""
                        }
                        .buttonStyle(.borderedProminent).tint(MCIStyle.navy)
                    }
                }
            }
        }
        .sheet(item: Binding(get: { assignRole.map { MCIIDString($0) } }, set: { assignRole = $0?.id })) { r in
            MCIRoleSheet(incidentID: id, role: r.id).environmentObject(store)
        }
    }

    func setTime(_ kp: WritableKeyPath<MCIIncident, Date?>, _ field: String, _ v: Date?, _ reason: String) {
        let t = store.now()
        let ini = store.initials
        store.update(id) { i in
            let old = i[keyPath: kp]
            guard old != v else { return }
            i[keyPath: kp] = v
            i.log(i.id, "incident", "edit", field: field, before: old.map(MCIFmt.iso), after: v.map(MCIFmt.iso),
                  effective: v, now: t, initials: ini, note: reason)
        }
    }

    func roleRow(_ inc: MCIIncident, _ role: String) -> some View {
        let cur = inc.currentAssignment(role)
        let past = inc.roles.filter { $0.role == role && $0.relievedAt != nil }
        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(role).font(.headline)
                    if let cur {
                        Text("\(cur.person.mciNR)\(cur.agencyChannel.isEmpty ? "" : " · " + cur.agencyChannel)").font(.title3)
                        Text("Assigned \(MCIFmt.clock(cur.assignedAt, tz: inc.timeZone, ref: inc.refDate))\(cur.reportsTo.isEmpty ? "" : " · reports to " + cur.reportsTo)")
                            .font(.footnote).foregroundStyle(.secondary)
                    } else {
                        Text("Unassigned").font(.title3).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                if !ro {
                    Button(cur == nil ? "Assign…" : "Reassign…") { assignRole = role }
                        .buttonStyle(.borderedProminent).tint(MCIStyle.navy).frame(minHeight: 48)
                    if let cur {
                        Button("Relieve") {
                            let t = store.now()
                            let ini = store.initials
                            store.update(id) { $0.relieveRole(cur.id, at: t, now: t, initials: ini) }
                        }
                        .buttonStyle(.bordered).frame(minHeight: 48)
                    }
                }
            }
            if !past.isEmpty {
                Text("Earlier: " + past.map { "\($0.person.mciDash) (\(MCIFmt.clock($0.assignedAt, tz: inc.timeZone, ref: inc.refDate))–\(MCIFmt.clock($0.relievedAt, tz: inc.timeZone, ref: inc.refDate)))" }.joined(separator: "; "))
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Divider()
        }
    }
}

struct MCIIDString: Identifiable, Hashable {
    let id: String
    init(_ s: String) { id = s }
}

struct MCIRoleSheet: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.dismiss) private var dismiss
    let incidentID: UUID
    let role: String
    @State private var person = ""
    @State private var agency = ""
    @State private var reportsTo = ""
    @State private var notes = ""
    @State private var at = Date()
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Person / call sign") { TextField("Name or call sign", text: $person).frame(minHeight: 44) }
                Section("Optional") {
                    TextField("Agency / channel", text: $agency).frame(minHeight: 44)
                    TextField("Reports to (local)", text: $reportsTo).frame(minHeight: 44)
                    TextField("Notes", text: $notes).frame(minHeight: 44)
                }
                Section("Assigned at") {
                    DatePicker("Time", selection: $at, displayedComponents: [.date, .hourAndMinute])
                        .environment(\.timeZone, store.incident(incidentID)?.timeZone ?? .current)
                        .environment(\.locale, Locale(identifier: "en_GB"))
                }
                if let cur = store.incident(incidentID)?.currentAssignment(role) {
                    Section { Text("\(cur.person.mciNR) will be marked relieved at this time; the history is kept.") }
                }
            }
            .navigationTitle(role)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Assign") {
                        guard !saving else { return }
                        saving = true
                        let t = store.now()
                        let ini = store.initials
                        store.update(incidentID) {
                            $0.assignRole(role, person: person, agencyChannel: agency, reportsTo: reportsTo, at: at, notes: notes, now: t, initials: ini)
                        }
                        dismiss()
                    }
                    .disabled(person.mciTrimmed.isEmpty || saving)
                }
            }
        }
    }
}

struct MCIChecklistBox: View {
    @EnvironmentObject var store: MCIStore
    let incident: MCIIncident

    var body: some View {
        let inc = incident
        MCISectionBox(title: "Initial Actions Checklist") {
            Text("From the source board (template version \(inc.checklistTemplateVersion), kept with this incident). Entries are prompts from the source, not new directives.")
                .font(.footnote).foregroundStyle(.secondary)
            ForEach(inc.checklist) { item in
                VStack(alignment: .leading, spacing: 8) {
                    Text(item.text).font(.headline)
                    MCIOptionGrid(options: MCIChecklistState.allCases, selected: item.state, title: { $0.label }, minWidth: 140,
                                  disabled: inc.isClosed) { s in
                        let t = store.now()
                        let ini = store.initials
                        store.update(inc.id) { $0.setChecklist(item.id, s, at: t, now: t, initials: ini) }
                    }
                    if let at = item.completedAt {
                        Text("Completed \(MCIFmt.clock(at, tz: inc.timeZone, ref: inc.refDate))\(item.initials.isEmpty ? "" : " · " + item.initials)")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    TextField("Notes (optional)", text: store.record(inc.id, \.checklist, item.id, \.notes, fallback: ""))
                        .textFieldStyle(.roundedBorder).frame(minHeight: 44).disabled(inc.isClosed)
                    Divider()
                }
            }
        }
    }
}

struct MCIHandoverSheet: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.dismiss) private var dismiss
    let incidentID: UUID

    var body: some View {
        NavigationStack {
            ScrollView {
                if let inc = store.incident(incidentID) {
                    let text = inc.handoverSummary(now: Date())
                    VStack(alignment: .leading, spacing: 12) {
                        ShareLink(item: text) { MCIBigLabel(title: "Share Handover Text…", systemImage: "square.and.arrow.up") }
                            .buttonStyle(.bordered)
                        Text(text).font(.system(.body, design: .monospaced)).textSelection(.enabled)
                    }
                    .padding()
                }
            }
            .navigationTitle("Handover Summary")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}

// MARK: - Triage and counting (source page 2)

struct MCITriageSection: View {
    @EnvironmentObject var store: MCIStore
    let incident: MCIIncident
    let onSnapshot: () -> Void
    @State private var correcting: MCIIDBox?
    @State private var viewReference: MCIReferenceDoc?

    var body: some View {
        let inc = incident
        VStack(alignment: .leading, spacing: 16) {
            if !inc.isClosed {
                Button(action: onSnapshot) { MCIBigLabel(title: "Update Reported Count (new snapshot)", systemImage: "number") }
                    .buttonStyle(.borderedProminent).tint(MCIStyle.navy)
            }
            MCICountsPanel(incident: inc)
            MCISectionBox(title: "Running Count — Reported Snapshots") {
                if inc.snapshots.isEmpty { Text("No snapshots yet.").foregroundStyle(.secondary) }
                ForEach(inc.snapshots.sorted { $0.recordedAt > $1.recordedAt }) { s in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text("Observed \(MCIFmt.clock(s.observedAt, tz: inc.timeZone, ref: inc.refDate))").font(.headline)
                            if s.correctsID != nil { MCITag(text: "CORRECTION", color: MCIStyle.slate) }
                            Spacer()
                            Text(s.totalText).font(.headline)
                        }
                        Text(TriageCategory.allCases.map { "\($0.abbr) \(s.value($0).map(String.init) ?? "Unknown")" }.joined(separator: " · "))
                            .font(.body.monospacedDigit())
                        Text("Source \(s.reporter.mciNR) · recorded \(MCIFmt.full(s.recordedAt, tz: inc.timeZone))\(s.notes.isEmpty ? "" : " · " + s.notes)")
                            .font(.footnote).foregroundStyle(.secondary)
                        if !inc.isClosed {
                            Button("Record a Correction of This Snapshot…") { correcting = MCIIDBox(id: s.id) }
                                .buttonStyle(.bordered).frame(minHeight: 44)
                        }
                        Divider()
                    }
                }
            }
            MCIReferenceBox(onOpen: { viewReference = $0 })
        }
        .sheet(item: $correcting) { box in MCISnapshotSheet(incidentID: inc.id, correcting: box.id).environmentObject(store) }
        .fullScreenCover(item: $viewReference) { r in MCIReferenceViewer(doc: r).environmentObject(store) }
    }
}

struct MCISnapshotSheet: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.dismiss) private var dismiss
    let incidentID: UUID
    let correcting: UUID?
    @State private var values: [TriageCategory: Int?] = [:]
    @State private var observedAt = Date()
    @State private var reporter = ""
    @State private var notes = ""
    @State private var snapshotID = UUID()   // one ID per sheet: a double Save cannot add two
    @State private var loaded = false

    var known: Int { values.values.compactMap { $0 }.reduce(0, +) }
    var complete: Bool { TriageCategory.allCases.allSatisfy { (values[$0] ?? nil) != nil } }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text(correcting == nil
                         ? "Patients reportedly still on scene, as reported. This does not change the Patient Register, and adding patients never changes it."
                         : "This correction is saved as a new snapshot linked to the earlier one. The earlier snapshot is kept unchanged.")
                        .font(.callout)
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 330), spacing: 16)], spacing: 16) {
                        ForEach(TriageCategory.allCases) { c in
                            MCICountField(label: "\(c.abbr) \(c.name) (\(c.colorWord))",
                                          value: Binding(get: { values[c] ?? nil }, set: { values[c] = .some($0) }),
                                          accent: c.swatch, accentText: c.swatchText)
                        }
                    }
                    Text(complete ? "Total \(known)" : "Known subtotal \(known) — Incomplete (some categories Unknown)")
                        .font(.title2.bold())
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Observed at").font(.headline)
                        DatePicker("Observed at", selection: $observedAt, displayedComponents: [.date, .hourAndMinute])
                            .labelsHidden()
                            .environment(\.timeZone, store.incident(incidentID)?.timeZone ?? .current)
                            .environment(\.locale, Locale(identifier: "en_GB"))
                    }
                    TextField("Reported by / source", text: $reporter).textFieldStyle(.roundedBorder).frame(minHeight: 48)
                    TextField("Notes", text: $notes).textFieldStyle(.roundedBorder).frame(minHeight: 48)
                }
                .padding()
            }
            .navigationTitle(correcting == nil ? "Reported Scene Count" : "Correct Reported Count")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Record Snapshot") {
                        let t = store.now()
                        let ini = store.initials
                        let v = values
                        let sid = snapshotID
                        let obs = observedAt
                        let rep = reporter
                        let n = notes
                        let corr = correcting
                        store.update(incidentID) { $0.recordSnapshot(id: sid, values: v, observedAt: obs, reporter: rep, notes: n, correcting: corr, now: t, initials: ini) }
                        dismiss()
                    }
                    .font(.headline)
                }
            }
        }
        .onAppear {
            guard !loaded else { return }
            loaded = true
            let base = correcting.flatMap { cid in store.incident(incidentID)?.snapshots.first { $0.id == cid } }
                ?? store.incident(incidentID)?.latestSnapshot
            var v: [TriageCategory: Int?] = [:]
            for c in TriageCategory.allCases { v[c] = .some(base?.value(c)) }
            values = v
            if let base, correcting != nil { observedAt = base.observedAt ?? Date() }
        }
    }
}

struct MCIReferenceBox: View {
    @EnvironmentObject var store: MCIStore
    let onOpen: (MCIReferenceDoc) -> Void

    var body: some View {
        MCISectionBox(title: "Triage Reference") {
            Text("REFERENCE ONLY — verify against agency protocol. Category selection in this app is always manual; there is no triage algorithm, suggestion or automatic category.")
                .font(.callout.bold())
            Text("The START / JumpSTART / SALT page from the Sumter EMS MCI Command Board PDF was not supplied to this build, so it is not reproduced here. Add that page or an agency-supplied PDF below (Settings → Approved References) to keep it available offline.")
                .font(.footnote).foregroundStyle(.secondary)
            if store.data.settings.references.isEmpty {
                Text("No reference documents added.").foregroundStyle(.secondary)
            }
            ForEach(store.data.settings.references) { r in
                Button { onOpen(r) } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(r.title.mciNR).font(.headline)
                        Text("Revision \(r.revision.mciNR) · effective \(r.effectiveDate.mciNR) · source \(r.source.mciNR)")
                            .font(.footnote)
                        Text(r.approvalRecord.mciTrimmed.isEmpty ? "No approval record entered" : "Approval record (operator-entered): \(r.approvalRecord)")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }
}

struct MCIReferenceViewer: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.dismiss) private var dismiss
    let doc: MCIReferenceDoc

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Text("REFERENCE ONLY — verify against agency protocol · \(doc.title) · rev \(doc.revision.mciNR)")
                    .font(.footnote.bold()).padding(8).frame(maxWidth: .infinity).background(Color.yellow.opacity(0.25))
                if FileManager.default.fileExists(atPath: store.referenceURL(doc).path) {
                    MCIPDFPreview(url: store.referenceURL(doc))
                } else {
                    Text("The document file is missing from this iPad.").padding().frame(maxHeight: .infinity)
                }
            }
            .navigationTitle(doc.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}

// MARK: - Hospitals, mutual aid and air (source page 3)

struct MCIHospitalsSection: View {
    @EnvironmentObject var store: MCIStore
    let incident: MCIIncident
    @State private var pollFor: MCIIDBox?
    @State private var editAid: MCIIDBox?
    @State private var editAir: MCIIDBox?
    @State private var newHospital = ""

    var body: some View {
        let inc = incident
        VStack(alignment: .leading, spacing: 16) {
            MCISectionBox(title: "Hospitals") {
                Text("Names imported from the supplied PDF; not independently verified as current facilities or capabilities. Capacity is what was last reported by phone/radio — this is not a live feed and is never reduced by transports.")
                    .font(.footnote).foregroundStyle(.secondary)
                ForEach(inc.hospitals) { h in MCIHospitalCard(incident: inc, hospital: h) { pollFor = MCIIDBox(id: h.id) } }
                let unknown = inc.patientsSent()[Optional<UUID>.none]
                if let unknown, !unknown.isEmpty {
                    Text("Destination Unknown: \(unknown.values.reduce(0, +)) departed — complete each departure in Transport.")
                        .font(.headline).foregroundStyle(MCIStyle.brick)
                }
                if !inc.isClosed {
                    HStack {
                        TextField("Add another facility for this incident", text: $newHospital)
                            .textFieldStyle(.roundedBorder).frame(minHeight: 48)
                        Button("Add") {
                            let n = newHospital.mciTrimmed
                            guard !n.isEmpty else { return }
                            store.update(inc.id) { $0.hospitals.append(MCIHospital(id: UUID(), directoryID: nil, name: n, capabilityNotes: "")) }
                            newHospital = ""
                        }
                        .buttonStyle(.borderedProminent).tint(MCIStyle.navy)
                    }
                }
            }
            MCISectionBox(title: "Mutual Aid — Ground") {
                Text("Each request is its own record, so repeat requests to one agency never overwrite. ETA is an entered estimate, not a promise.")
                    .font(.footnote).foregroundStyle(.secondary)
                ForEach(inc.aid.sorted { $0.createdAt > $1.createdAt }) { a in
                    Button { editAid = MCIIDBox(id: a.id) } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(a.agency).font(.headline)
                                Text("Units: \(a.unitsSent.mciNR) · ETA \(MCIFmt.clock(a.eta, tz: inc.timeZone, ref: inc.refDate)) · \(a.assignment.mciNR)")
                                    .font(.subheadline)
                            }
                            Spacer()
                            MCITag(text: a.status.label.uppercased(), color: MCIStyle.slate)
                        }
                        .frame(minHeight: 56).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    Divider()
                }
                if !inc.isClosed {
                    Text("New request").font(.headline)
                    MCIOptionGrid(options: (store.data.settings.groundAgencies + ["Other agency"]).map { MCIIDString($0) },
                                  selected: nil, title: { $0.id }, minWidth: 180) { a in
                        var newID: UUID?
                        let t = store.now()
                        let ini = store.initials
                        store.update(inc.id) { newID = $0.addAid(agency: a.id, now: t, initials: ini) }
                        if let newID { editAid = MCIIDBox(id: newID) }
                    }
                }
            }
            MCISectionBox(title: "Air Medical") {
                Text("Service names as written on the source. No availability, frequency or landing-zone advice is assumed.")
                    .font(.footnote).foregroundStyle(.secondary)
                ForEach(inc.air.sorted { $0.createdAt > $1.createdAt }) { a in
                    Button { editAir = MCIIDBox(id: a.id) } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(a.service).font(.headline)
                                Text("LZ/Freq \(a.lzFrequency.mciNR) · ETA \(MCIFmt.clock(a.eta, tz: inc.timeZone, ref: inc.refDate)) · \(a.patientIDs.compactMap { inc.patient($0)?.number }.joined(separator: ", ").mciNR) → \(a.destination.mciNR)")
                                    .font(.subheadline)
                            }
                            Spacer()
                            MCITag(text: a.status.label.uppercased(), color: MCIStyle.slate)
                        }
                        .frame(minHeight: 56).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    Divider()
                }
                if !inc.isClosed {
                    MCIOptionGrid(options: (store.data.settings.airServices + ["Other service"]).map { MCIIDString($0) },
                                  selected: nil, title: { "Request " + $0.id }, minWidth: 180) { a in
                        var newID: UUID?
                        let t = store.now()
                        let ini = store.initials
                        store.update(inc.id) { newID = $0.addAir(service: a.id, now: t, initials: ini) }
                        if let newID { editAir = MCIIDBox(id: newID) }
                    }
                }
            }
        }
        .sheet(item: $pollFor) { box in MCIPollSheet(incidentID: inc.id, hospitalID: box.id).environmentObject(store) }
        .sheet(item: $editAid) { box in MCIAidEditor(incidentID: inc.id, aidID: box.id).environmentObject(store) }
        .sheet(item: $editAir) { box in MCIAirEditor(incidentID: inc.id, airID: box.id).environmentObject(store) }
    }
}

struct MCIHospitalCard: View {
    @EnvironmentObject var store: MCIStore
    let incident: MCIIncident
    let hospital: MCIHospital
    let onPoll: () -> Void

    var body: some View {
        let inc = incident
        let poll = inc.latestPoll(hospital.id)
        let sent = inc.patientsSent()[hospital.id] ?? [:]
        let reminder = store.data.settings.pollReminderMinutes
        let stale: Bool = {
            guard let reminder, let at = poll?.observedAt else { return false }
            return Date().timeIntervalSince(at) > Double(reminder * 60)
        }()
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(hospital.name).font(.mciHeading(.title3))
                Spacer()
                if stale { MCITag(text: "NEEDS UPDATE (local reminder)") }
                if !inc.isClosed {
                    Button("Record Bed Poll…", action: onPoll).buttonStyle(.borderedProminent).tint(MCIStyle.navy).frame(minHeight: 48)
                }
            }
            if let p = poll {
                Text("LAST REPORTED AVAILABLE — observed \(MCIFmt.full(p.observedAt, tz: inc.timeZone)) (\(MCIFmt.age(of: p.observedAt, now: Date())))")
                    .font(.caption.bold())
                HStack(spacing: 8) {
                    bed("Immediate", p.immediate, .immediate)
                    bed("Delayed", p.delayed, .delayed)
                    bed("Minor", p.minor, .minor)
                    VStack(alignment: .leading) {
                        Text("Divert").font(.caption.bold())
                        Text(p.divert.label).font(.headline).foregroundStyle(p.divert == .yes ? MCIStyle.brick : .primary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                Text("By \(p.reporter.mciNR) via \(p.method.mciNR) · \(p.contactNotes.mciDash)").font(.footnote).foregroundStyle(.secondary)
            } else {
                Text("No bed poll recorded. Capacity and divert: Unknown.").foregroundStyle(.secondary)
            }
            Text("PATIENTS SENT (valid departures, by category at departure): " +
                 (sent.isEmpty ? "none" : sent.sorted { $0.key < $1.key }.map { "\(TriageCategory(rawValue: $0.key)?.abbr ?? "UNK") \($0.value)" }.joined(separator: " · ")))
                .font(.subheadline.bold())
            TextField("Capability notes (manual)", text: store.record(inc.id, \.hospitals, hospital.id, \.capabilityNotes, fallback: ""))
                .textFieldStyle(.roundedBorder).frame(minHeight: 44).disabled(inc.isClosed)
            Divider()
        }
    }

    func bed(_ label: String, _ v: Int?, _ c: TriageCategory) -> some View {
        VStack(alignment: .leading) {
            Text(label).font(.caption.bold())
            Text(v.map(String.init) ?? "Unknown").font(.title3.bold().monospacedDigit())
        }
        .padding(6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .leading) { Rectangle().fill(c.swatch).frame(width: 4) }
    }
}

struct MCIPollSheet: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.dismiss) private var dismiss
    let incidentID: UUID
    let hospitalID: UUID
    @State private var immediate: Int?
    @State private var delayed: Int?
    @State private var minor: Int?
    @State private var divert: MCIDivert = .unknown
    @State private var contact = ""
    @State private var reporter = ""
    @State private var method = ""
    @State private var observedAt = Date()
    @State private var pollID = UUID()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text(store.incident(incidentID)?.hospital(hospitalID)?.name ?? "Hospital").font(.mciHeading(.title2))
                    Text("Leave a count blank for Unknown. Enter 0 only when 0 was reported.").font(.callout)
                    MCICountField(label: "Beds available — Immediate", value: $immediate, accent: TriageCategory.immediate.swatch)
                    MCICountField(label: "Beds available — Delayed", value: $delayed, accent: TriageCategory.delayed.swatch, accentText: .black)
                    MCICountField(label: "Beds available — Minor", value: $minor, accent: TriageCategory.minor.swatch)
                    Text("Divert").font(.headline)
                    MCIOptionGrid(options: MCIDivert.allCases, selected: divert, title: { $0.label }) { divert = $0 }
                    Group {
                    TextField("Contact / notes", text: $contact).textFieldStyle(.roundedBorder).frame(minHeight: 48)
                    TextField("Reported by", text: $reporter).textFieldStyle(.roundedBorder).frame(minHeight: 48)
                    TextField("Contact method (radio, phone…)", text: $method).textFieldStyle(.roundedBorder).frame(minHeight: 48)
                    DatePicker("Poll observed at", selection: $observedAt, displayedComponents: [.date, .hourAndMinute])
                        .environment(\.timeZone, store.incident(incidentID)?.timeZone ?? .current)
                        .environment(\.locale, Locale(identifier: "en_GB"))
                    }
                }
                .padding()
            }
            .navigationTitle("Bed Poll")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save Poll") {
                        let p = MCIHospitalPoll(id: pollID, hospitalID: hospitalID, immediate: immediate, delayed: delayed, minor: minor,
                                                divert: divert, contactNotes: contact, reporter: reporter, method: method,
                                                observedAt: observedAt, recordedAt: store.now())
                        let ini = store.initials
                        store.update(incidentID) { $0.addPoll(p, initials: ini) }
                        dismiss()
                    }
                    .font(.headline)
                }
            }
        }
    }
}

struct MCIAidEditor: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.dismiss) private var dismiss
    let incidentID: UUID
    let aidID: UUID
    @State private var message: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                if let inc = store.incident(incidentID), let a = inc.aid.first(where: { $0.id == aidID }) {
                    let ro = inc.isClosed
                    VStack(alignment: .leading, spacing: 14) {
                        MCIField(label: "Agency", text: store.record(incidentID, \.aid, aidID, \.agency, fallback: ""), readOnly: ro)
                        Text("Status").font(.headline)
                        MCIOptionGrid(options: MCIRequestStatus.allCases, selected: a.status, title: { $0.label }, minWidth: 140, disabled: ro) { s in
                            let t = store.now()
                            let ini = store.initials
                            store.update(incidentID) { $0.setAidStatus(aidID, s, now: t, initials: ini) }
                        }
                        MCITimeRow(label: "Contacted", value: a.contactedAt, tz: inc.timeZone, ref: inc.refDate, readOnly: ro) { v, _ in
                            store.update(incidentID) { i in if let k = i.aid.firstIndex(where: { $0.id == aidID }) { i.aid[k].contactedAt = v } }
                        }
                        MCIField(label: "Units / Resources Sent", text: store.record(incidentID, \.aid, aidID, \.unitsSent, fallback: ""), readOnly: ro)
                        MCITimeRow(label: "ETA (estimate)", value: a.eta, tz: inc.timeZone, ref: inc.refDate, readOnly: ro) { v, _ in
                            store.update(incidentID) { i in if let k = i.aid.firstIndex(where: { $0.id == aidID }) { i.aid[k].eta = v } }
                        }
                        MCIField(label: "ETA source", text: store.record(incidentID, \.aid, aidID, \.etaSource, fallback: ""), readOnly: ro)
                        MCIField(label: "Assignment / Status", text: store.record(incidentID, \.aid, aidID, \.assignment, fallback: ""), readOnly: ro)
                        MCILongText(label: "Notes", text: store.record(incidentID, \.aid, aidID, \.notes, fallback: ""), minHeight: 120, readOnly: ro)
                        Group {
                            if let r = inc.resources.first(where: { $0.aidRequestID == aidID }) {
                                Text("Linked staging resource: \(r.identifier.mciDash) — \(r.status.label)").font(.headline)
                            } else if !ro {
                                Button {
                                    var rid: UUID?
                                    let t = store.now()
                                    let ini = store.initials
                                    store.update(incidentID) { rid = $0.stageAidArrival(aidID, now: t, initials: ini) }
                                    message = rid == nil ? "Could not stage." : "Arrived and added to Staging as one linked resource."
                                } label: { MCIBigLabel(title: "Mark Arrived and Add to Staging", systemImage: "parkingsign") }
                                    .buttonStyle(.borderedProminent).tint(MCIStyle.navy)
                            }
                            if let message { Text(message).font(.callout) }
                            MCIHistoryList(incident: inc, recordIDs: [aidID])
                        }
                    }
                    .padding()
                }
            }
            .navigationTitle("Mutual Aid Request")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { store.flush(); dismiss() } } }
        }
    }
}

struct MCIAirEditor: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.dismiss) private var dismiss
    let incidentID: UUID
    let airID: UUID

    var body: some View {
        NavigationStack {
            ScrollView {
                if let inc = store.incident(incidentID), let a = inc.air.first(where: { $0.id == airID }) {
                    let ro = inc.isClosed
                    VStack(alignment: .leading, spacing: 14) {
                        MCIField(label: "Service", text: store.record(incidentID, \.air, airID, \.service, fallback: ""), readOnly: ro)
                        Text("Requested status").font(.headline)
                        MCIOptionGrid(options: MCIRequestStatus.allCases, selected: a.status, title: { $0.label }, minWidth: 140, disabled: ro) { s in
                            let t = store.now()
                            let ini = store.initials
                            store.update(incidentID) { $0.setAirStatus(airID, s, now: t, initials: ini) }
                        }
                        MCITimeRow(label: "Requested", value: a.requestedAt, tz: inc.timeZone, ref: inc.refDate, readOnly: ro) { v, _ in
                            store.update(incidentID) { i in if let k = i.air.firstIndex(where: { $0.id == airID }) { i.air[k].requestedAt = v } }
                        }
                        MCIField(label: "LZ / Frequency (operator-entered)", text: store.record(incidentID, \.air, airID, \.lzFrequency, fallback: ""), readOnly: ro)
                        MCITimeRow(label: "ETA (estimate)", value: a.eta, tz: inc.timeZone, ref: inc.refDate, readOnly: ro) { v, _ in
                            store.update(incidentID) { i in if let k = i.air.firstIndex(where: { $0.id == airID }) { i.air[k].eta = v } }
                        }
                        Text("Patients on this flight").font(.headline)
                        ForEach(inc.activePatients) { p in
                            let on = a.patientIDs.contains(p.id)
                            Button {
                                store.update(incidentID) { i in
                                    guard let k = i.air.firstIndex(where: { $0.id == airID }) else { return }
                                    if let x = i.air[k].patientIDs.firstIndex(of: p.id) { i.air[k].patientIDs.remove(at: x) } else { i.air[k].patientIDs.append(p.id) }
                                }
                            } label: {
                                HStack {
                                    Image(systemName: on ? "checkmark.square.fill" : "square").font(.title2)
                                    Text("\(p.number) · tag \(p.tag.mciDash) · \(mciCategoryShort(p.category))")
                                    Spacer()
                                }
                                .frame(minHeight: 48).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain).disabled(ro)
                        }
                        Group {
                            MCIField(label: "Destination", text: store.record(incidentID, \.air, airID, \.destination, fallback: ""), readOnly: ro)
                            MCILongText(label: "Notes", text: store.record(incidentID, \.air, airID, \.notes, fallback: ""), minHeight: 120, readOnly: ro)
                            Text("Linking a patient here does not record a departure. Use Record Departure in Transport.")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                    .padding()
                }
            }
            .navigationTitle("Air Request")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { store.flush(); dismiss() } } }
        }
    }
}

// MARK: - Transport (source page 4)

enum MCILocationFilter: String, CaseIterable, Identifiable {
    case all, onScene, departed, unknown, error
    var id: String { rawValue }
    var label: String {
        switch self {
        case .all: return "All"
        case .onScene: return "On Scene"
        case .departed: return "Departed"
        case .unknown: return "Location Unknown"
        case .error: return "Entered in Error"
        }
    }
}

struct MCITransportSection: View {
    @EnvironmentObject var store: MCIStore
    let incident: MCIIncident
    let onAddPatient: () -> Void
    let onOpenPatient: (UUID) -> Void
    @State private var search = ""
    @State private var locationFilter: MCILocationFilter = .all
    @State private var categoryFilter = "all"

    var filtered: [MCIPatient] {
        let inc = incident
        let q = search.mciTrimmed.lowercased()
        return inc.patients.filter { p in
            let loc = inc.location(of: p)
            switch locationFilter {
            case .all: if p.enteredInError { return false }
            case .onScene: if p.enteredInError || loc != .onScene { return false }
            case .departed: if p.enteredInError || !(loc == .departed || loc == .arrivalConfirmed) { return false }
            case .unknown: if p.enteredInError || loc != .unknown { return false }
            case .error: if !p.enteredInError { return false }
            }
            if categoryFilter != "all" && (p.category?.rawValue ?? MCIUnclassified.key) != categoryFilter { return false }
            if q.isEmpty { return true }
            let d = inc.validDeparture(for: p.id)
            let hay = [p.number, p.tag, p.complaint, inc.hospital(d?.hospitalID)?.name ?? "",
                       inc.resource(d?.resourceID)?.identifier ?? "", d?.unitText ?? ""].joined(separator: " ").lowercased()
            return hay.contains(q)
        }
    }

    var body: some View {
        let inc = incident
        VStack(alignment: .leading, spacing: 14) {
            if !inc.isClosed {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 260), spacing: 10)], spacing: 10) {
                    Button(action: onAddPatient) { MCIBigLabel(title: "Add On-scene Patient", systemImage: "person.badge.plus") }
                        .buttonStyle(.borderedProminent).tint(MCIStyle.navy)
                    Button {
                        var newID: UUID?
                        let t = store.now()
                        let ini = store.initials
                        store.update(inc.id) { newID = $0.addPatient(now: t, initials: ini, retrospective: true) }
                        if let newID { onOpenPatient(newID) }
                    } label: { MCIBigLabel(title: "Add Already-Departed Patient", systemImage: "clock.arrow.circlepath") }
                        .buttonStyle(.bordered)
                }
            }
            MCIRegisterTable(register: inc.register())
            let unknownDest = inc.sentTotal(to: nil)
            if unknownDest > 0 {
                Text("Destination Unknown: \(unknownDest) — kept as its own tally until completed.").font(.headline).foregroundStyle(MCIStyle.brick)
            }
            TextField("Search patient number, tag, complaint, unit or destination", text: $search)
                .textFieldStyle(.roundedBorder).frame(minHeight: 48)
                .textInputAutocapitalization(.never)
            Picker("Location", selection: $locationFilter) {
                ForEach(MCILocationFilter.allCases) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            Picker("Category", selection: $categoryFilter) {
                Text("All categories").tag("all")
                ForEach(MCIRegister.keys, id: \.self) { Text(MCIRegister.label($0)).tag($0) }
            }
            .pickerStyle(.menu)
            MCISectionBox(title: "Patients (\(filtered.count) shown)") {
                if filtered.isEmpty { Text("No patients match.").foregroundStyle(.secondary) }
                ForEach(filtered) { p in
                    Button { store.flush(); onOpenPatient(p.id) } label: { MCIPatientRow(incident: inc, patient: p) }
                        .buttonStyle(.plain)
                        .accessibilityHint("Opens patient \(p.number)")
                    Divider()
                }
            }
        }
    }
}

struct MCIPatientRow: View {
    let incident: MCIIncident
    let patient: MCIPatient

    var body: some View {
        let inc = incident
        let p = patient
        let d = inc.validDeparture(for: p.id)
        let dup = !inc.duplicateTags(of: p).isEmpty
        return HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(p.number).font(.mciHeading(.title2))
                Text("Tag \(p.tag.mciDash)").font(.subheadline)
            }
            .frame(width: 110, alignment: .leading)
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    MCICategoryBadge(category: p.category)
                    Text(inc.location(of: p).label.uppercased()).font(.caption.bold())
                    if dup { MCITag(text: "DUPLICATE TAG?") }
                    if d?.needsCompletion == true { MCITag(text: "COMPLETE DEPARTURE") }
                    if p.enteredInError { MCITag(text: "ENTERED IN ERROR", color: Color(white: 0.4)) }
                }
                Text("\(p.ageText) · \(p.sex.label) · \(p.complaint.mciNR)").lineLimit(2)
                if let d {
                    Text("Out \(MCIFmt.clock(d.departedAt, tz: inc.timeZone, ref: inc.refDate)) · \(inc.resource(d.resourceID)?.identifier ?? d.unitText.mciNR) → \(inc.hospital(d.hospitalID)?.name ?? "Unknown destination") · at departure \(mciCategoryShort(d.categoryAtDeparture))")
                        .font(.subheadline)
                }
            }
            Spacer()
        }
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

enum MCIDepartureFix: String, Identifiable {
    case destination, unit, category, time, void
    var id: String { rawValue }
}

struct MCIPatientEditor: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.dismiss) private var dismiss
    let incidentID: UUID
    let patientID: UUID
    let onAddAnother: () -> Void
    @State private var categoryReason = ""
    @State private var showDeparture = false
    @State private var fix: MCIDepartureFix?
    @State private var errorReason = ""
    @State private var errorMessage: String?
    @State private var confirmError = false
    @State private var ageText = ""

    var body: some View {
        NavigationStack {
            Group {
                if let inc = store.incident(incidentID), let p = inc.patient(patientID) {
                    editor(inc, p)
                } else {
                    Text("Patient not found.")
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) { MCISaveStatus() }
                ToolbarItem(placement: .navigationBarLeading) {
                    Button { store.flush(); dismiss(); onAddAnother() } label: { Label("Add Another", systemImage: "person.badge.plus") }
                        .disabled(store.incident(incidentID)?.isClosed ?? true)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { store.flush(); dismiss() }.font(.headline).accessibilityLabel("Done, return to incident")
                }
            }
        }
        .sheet(isPresented: $showDeparture) { MCIDepartureSheet(incidentID: incidentID, patientID: patientID).environmentObject(store) }
        .sheet(item: $fix) { f in MCIDepartureFixSheet(incidentID: incidentID, patientID: patientID, fix: f).environmentObject(store) }
        .onAppear { ageText = store.incident(incidentID)?.patient(patientID)?.ageValue.map(String.init) ?? "" }
    }

    func editor(_ inc: MCIIncident, _ p: MCIPatient) -> some View {
        let ro = inc.isClosed || p.enteredInError
        let d = inc.validDeparture(for: p.id)
        let dups = inc.duplicateTags(of: p)
        return VStack(spacing: 0) {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("PATIENT \(p.number)").font(.mciHeading(.largeTitle)).foregroundStyle(.white)
                    Text("Tag \(p.tag.mciDash) · \(inc.location(of: p).label)").font(.headline).foregroundStyle(.white.opacity(0.9))
                }
                MCICategoryBadge(category: p.category)
                Spacer()
                if d == nil && !ro {
                    Button { store.flush(); showDeparture = true } label: {
                        Label("Record Departure", systemImage: "arrow.right.circle.fill").font(.headline).frame(minHeight: 48)
                    }
                    .buttonStyle(.borderedProminent).tint(MCIStyle.brick)
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 10)
            .background(MCIStyle.navy)
            .accessibilityElement(children: .contain)
            MCISaveFailureBanner()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if p.enteredInError {
                        Text("ENTERED IN ERROR — excluded from all counts. Reason: \(p.errorReason)")
                            .font(.headline).padding(10).frame(maxWidth: .infinity, alignment: .leading).background(Color.yellow.opacity(0.25))
                    }
                    MCISectionBox(title: "Category (manual selection)") {
                        Text("Selection is manual. No vitals-based suggestion, automatic category or treatment advice. Changing the current category never changes the category recorded at departure.")
                            .font(.footnote).foregroundStyle(.secondary)
                        TextField("Reason for change (optional)", text: $categoryReason).textFieldStyle(.roundedBorder).frame(minHeight: 44)
                            .disabled(ro)
                        MCICategoryPicker(selected: p.category, disabled: ro) { c in
                            let t = store.now()
                            let ini = store.initials
                            let reason = categoryReason
                            store.update(incidentID) { $0.setCategory(patientID, c, reason: reason, now: t, initials: ini) }
                            categoryReason = ""
                        }
                    }
                    MCISectionBox(title: "Identification") {
                        MCIField(label: "Triage Tag Number", text: store.record(incidentID, \.patients, patientID, \.tag, fallback: ""), readOnly: ro)
                        if !dups.isEmpty {
                            Label("Same tag (ignoring case, spaces and dashes) as \(dups.map(\.number).joined(separator: ", ")). Not merged — check, then correct the tag or mark a duplicate.",
                                  systemImage: "exclamationmark.triangle").foregroundStyle(MCIStyle.brick)
                        }
                        Text("Patient number \(p.number) and the internal record stay the same if the tag is corrected. No name or date of birth is collected.")
                            .font(.footnote).foregroundStyle(.secondary)
                        ageEditor(p, ro: ro)
                        Text("Sex").font(.headline)
                        MCIOptionGrid(options: MCISex.allCases, selected: p.sex, title: { $0.label }, minWidth: 100, disabled: ro) { v in
                            store.update(incidentID) { i in if let k = i.patientIndex(patientID) { i.patients[k].sex = v } }
                        }
                    }
                    MCILongText(label: "Chief Complaint / Injury", text: store.record(incidentID, \.patients, patientID, \.complaint, fallback: ""),
                                minHeight: 120, readOnly: ro)
                    departureBox(inc, p, d, ro: ro)
                    MCILongText(label: "Notes", text: store.record(incidentID, \.patients, patientID, \.notes, fallback: ""), minHeight: 200, readOnly: ro,
                                ink: MCIInkTarget(incidentID: incidentID, recordID: patientID, fieldID: "patientNotes", title: "Patient \(p.number) — Notes"))
                    errorBox(inc, p, d)
                    MCISectionBox(title: "History") {
                        MCIHistoryList(incident: inc, recordIDs: Set([p.id] + inc.departures.filter { $0.patientID == p.id }.map(\.id)))
                    }
                }
                .padding()
                .frame(maxWidth: 1000)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .id(p.id)
    }

    func ageEditor(_ p: MCIPatient, ro: Bool) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Age (optional)").font(.headline)
            HStack(spacing: 12) {
                TextField("Unknown", text: $ageText)
                    .keyboardType(.numberPad)
                    .font(.title3)
                    .padding(.horizontal, 12)
                    .frame(width: 120, height: 56)
                    .background(MCIStyle.rowFill)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .disabled(ro)
                    .onChange(of: ageText) { t in
                        let digits = t.filter(\.isNumber)
                        if digits != t { ageText = digits; return }
                        let v: Int? = digits.isEmpty ? nil : Int(digits)
                        store.update(incidentID, debounce: true) { i in if let k = i.patientIndex(patientID) { i.patients[k].ageValue = v } }
                    }
                Picker("Unit", selection: store.record(incidentID, \.patients, patientID, \.ageUnit, fallback: .years, debounce: false)) {
                    Text("Years").tag(MCIAgeUnit.years)
                    Text("Months").tag(MCIAgeUnit.months)
                }
                .pickerStyle(.segmented).frame(maxWidth: 220).disabled(ro)
                Toggle("Approximate", isOn: store.record(incidentID, \.patients, patientID, \.ageApprox, fallback: false, debounce: false))
                    .frame(maxWidth: 220, minHeight: 48).disabled(ro)
            }
        }
    }

    @ViewBuilder
    func departureBox(_ inc: MCIIncident, _ p: MCIPatient, _ d: MCIDeparture?, ro: Bool) -> some View {
        MCISectionBox(title: "Transport", accent: MCIStyle.brick) {
            if let d {
                let dest = inc.hospital(d.hospitalID)?.name ?? "Unknown destination"
                let unit = inc.resource(d.resourceID)?.identifier ?? d.unitText.mciNR
                Text("DEPARTED \(MCIFmt.full(d.departedAt, tz: inc.timeZone))").font(.title3.bold())
                Text("\(unit) → \(dest)").font(.title3)
                Text("Category at departure: \(mciCategoryLabel(d.categoryAtDeparture))").font(.headline)
                if d.needsCompletion {
                    Label("Missing information is recorded as Unknown and flagged for completion.", systemImage: "exclamationmark.triangle")
                        .foregroundStyle(MCIStyle.brick)
                }
                if let a = d.arrivalConfirmedAt {
                    Text("Arrival confirmed \(MCIFmt.full(a, tz: inc.timeZone))")
                }
                if !inc.isClosed {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 200), spacing: 10)], spacing: 10) {
                        Button { fix = .destination } label: { MCIBigLabel(title: "Correct Destination…", systemImage: "cross.case") }.buttonStyle(.bordered)
                        Button { fix = .unit } label: { MCIBigLabel(title: "Correct Transport Unit…", systemImage: "car") }.buttonStyle(.bordered)
                        Button { fix = .category } label: { MCIBigLabel(title: "Correct Category at Departure…", systemImage: "tag") }.buttonStyle(.bordered)
                        Button { fix = .time } label: { MCIBigLabel(title: "Correct Time Out…", systemImage: "clock") }.buttonStyle(.bordered)
                        if d.arrivalConfirmedAt == nil {
                            Button {
                                let t = store.now()
                                let ini = store.initials
                                store.update(incidentID) { $0.confirmArrival(d.id, at: t, now: t, initials: ini) }
                            } label: { MCIBigLabel(title: "Confirm Arrival Now", systemImage: "checkmark.seal") }.buttonStyle(.bordered)
                        }
                        Button(role: .destructive) { fix = .void } label: { MCIBigLabel(title: "Void Departure…", systemImage: "xmark.circle") }.buttonStyle(.bordered)
                    }
                }
            } else {
                Text(p.sceneLocation == .unknown ? "No departure recorded. Location: Unknown." : "No departure recorded. Location: On Scene.")
                    .font(.headline)
                if !ro {
                    MCIOptionGrid(options: [MCILocation.onScene, MCILocation.unknown], selected: p.sceneLocation, title: { $0.label }, minWidth: 150) { l in
                        let t = store.now()
                        let ini = store.initials
                        store.update(incidentID) { $0.setSceneLocation(patientID, l, now: t, initials: ini) }
                    }
                    Button { store.flush(); showDeparture = true } label: { MCIBigLabel(title: "Record Departure", systemImage: "arrow.right.circle.fill") }
                        .buttonStyle(.borderedProminent).tint(MCIStyle.brick)
                }
            }
            let voided = inc.departures.filter { $0.patientID == p.id && $0.voided }
            ForEach(voided) { v in
                Text("Voided departure (\(inc.hospital(v.hospitalID)?.name ?? "Unknown"), \(MCIFmt.clock(v.departedAt, tz: inc.timeZone, ref: inc.refDate))) — \(v.voidReason)")
                    .font(.footnote).foregroundStyle(.secondary).strikethrough()
            }
        }
    }

    @ViewBuilder
    func errorBox(_ inc: MCIIncident, _ p: MCIPatient, _ d: MCIDeparture?) -> some View {
        if !inc.isClosed {
            MCISectionBox(title: "Corrections") {
                if p.enteredInError {
                    Button {
                        let t = store.now()
                        let ini = store.initials
                        store.update(incidentID) { $0.restoreFromError(patientID, now: t, initials: ini) }
                    } label: { MCIBigLabel(title: "Undo Entered in Error", systemImage: "arrow.uturn.backward") }
                        .buttonStyle(.borderedProminent).tint(MCIStyle.navy)
                } else {
                    Text("Use Category above to change a category. Use this only for a record that should not exist (for example a duplicate). It is never deleted; it is excluded from counts and kept in history.")
                        .font(.footnote).foregroundStyle(.secondary)
                    if d != nil {
                        Text("This patient has a valid departure. Void the departure first so counts are reconciled.").foregroundStyle(MCIStyle.brick)
                    }
                    TextField("Reason (required), e.g. Duplicate of P-004", text: $errorReason).textFieldStyle(.roundedBorder).frame(minHeight: 48)
                    HStack(spacing: 12) {
                        Button { confirmError = true } label: { MCIBigLabel(title: "Mark Entered in Error…", systemImage: "exclamationmark.octagon") }
                            .buttonStyle(.bordered)
                            .disabled(errorReason.mciTrimmed.isEmpty || d != nil)
                        let dups = inc.duplicateTags(of: p)
                        if let first = dups.first {
                            Button { errorReason = "Duplicate of \(first.number)"; confirmError = true } label: {
                                MCIBigLabel(title: "Remove as Duplicate of \(first.number)…", systemImage: "doc.on.doc")
                            }
                            .buttonStyle(.bordered)
                            .disabled(d != nil)
                        }
                    }
                    if let errorMessage { Text(errorMessage).foregroundStyle(MCIStyle.brick) }
                }
            }
            .confirmationDialog("Mark \(p.number) as Entered in Error? It will be excluded from counts. You can undo this.",
                                isPresented: $confirmError, titleVisibility: .visible) {
                Button("Mark Entered in Error", role: .destructive) {
                    var result = MCIErrorMarkResult.notFound
                    let t = store.now()
                    let ini = store.initials
                    let reason = errorReason
                    store.update(incidentID) { result = $0.markEnteredInError(patientID, reason: reason, now: t, initials: ini) }
                    switch result {
                    case .marked: errorMessage = nil; errorReason = ""
                    case .needsReason: errorMessage = "Enter a reason."
                    case .blockedByDeparture: errorMessage = "Void this patient's departure first."
                    case .notFound: errorMessage = "Patient not found."
                    }
                }
            }
        }
    }
}

struct MCIUnitChoice: Identifiable, Hashable {
    let id: String
    let resourceID: UUID?
    let label: String
}

struct MCIDepartureSheet: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.dismiss) private var dismiss
    let incidentID: UUID
    let patientID: UUID
    @State private var departureID = UUID()   // stable ID: retry or double tap cannot add a second departure
    @State private var hospitalID: UUID?
    @State private var destinationChosen = false
    @State private var unitChoice: MCIUnitChoice?
    @State private var unitText = ""
    @State private var category: TriageCategory?
    @State private var categoryChosen = false
    @State private var timeKnown = true
    @State private var departedAt = Date()
    @State private var notes = ""
    @State private var result: MCIDepartureResult?
    @State private var loaded = false

    var body: some View {
        NavigationStack {
            ScrollView {
                if let inc = store.incident(incidentID), let p = inc.patient(patientID) {
                    content(inc, p)
                }
            }
            .navigationTitle("Record Departure")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Record Departure") { record() }.font(.headline).disabled(result == .recorded)
                }
            }
        }
        .onAppear {
            guard !loaded else { return }
            loaded = true
            category = store.incident(incidentID)?.patient(patientID)?.category
            categoryChosen = category != nil
        }
    }

    func content(_ inc: MCIIncident, _ p: MCIPatient) -> some View {
        let units: [MCIUnitChoice] = inc.resources.filter { $0.status != .released }
            .map { MCIUnitChoice(id: $0.id.uuidString, resourceID: $0.id, label: "\($0.identifier.mciDash) (\($0.status.label))") }
            + [MCIUnitChoice(id: "typed", resourceID: nil, label: "Other / type below"),
               MCIUnitChoice(id: "unknown", resourceID: nil, label: "Unknown unit")]
        let poll = hospitalID.flatMap { inc.latestPoll($0) }
        return VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("PATIENT \(p.number) · TAG \(p.tag.mciDash)").font(.mciHeading(.title2))
                MCICategoryBadge(category: p.category)
            }
            Text("Destination").font(.headline)
            MCIOptionGrid(options: inc.hospitals.map { MCIIDString($0.id.uuidString) } + [MCIIDString("unknown")],
                          selected: destinationChosen ? MCIIDString(hospitalID?.uuidString ?? "unknown") : nil,
                          title: { o in inc.hospitals.first { $0.id.uuidString == o.id }?.name ?? "Unknown destination" },
                          minWidth: 200) { o in
                hospitalID = UUID(uuidString: o.id)
                destinationChosen = true
            }
            if destinationChosen, hospitalID != nil {
                if let poll {
                    Text("Last reported (\(MCIFmt.age(of: poll.observedAt, now: Date()))): I \(poll.immediate.map(String.init) ?? "Unknown") · D \(poll.delayed.map(String.init) ?? "Unknown") · M \(poll.minor.map(String.init) ?? "Unknown") · Divert \(poll.divert.label). Not live capacity.")
                        .font(.callout).foregroundStyle(poll.divert == .yes ? MCIStyle.brick : .primary)
                } else {
                    Text("No bed poll for this facility: capacity and divert Unknown. You can still record this destination.")
                        .font(.callout).foregroundStyle(MCIStyle.brick)
                }
            }
            Text("Transport Unit").font(.headline)
            MCIOptionGrid(options: units, selected: unitChoice, title: { $0.label }, minWidth: 200) { unitChoice = $0 }
            if unitChoice?.id == "typed" {
                TextField("Unit / call sign", text: $unitText).textFieldStyle(.roundedBorder).frame(minHeight: 48)
            }
            Group {
                Text("Category at departure").font(.headline)
                Text("Starts from the current category; change only if different at departure. UNK records it as Unknown.")
                    .font(.footnote).foregroundStyle(.secondary)
                MCICategoryPicker(selected: category) { c in category = c; categoryChosen = true }
                Text("Time Out").font(.headline)
                Toggle("Departure time known", isOn: $timeKnown).frame(minHeight: 48)
                if timeKnown {
                    DatePicker("Time Out", selection: $departedAt, displayedComponents: [.date, .hourAndMinute])
                        .environment(\.timeZone, inc.timeZone)
                        .environment(\.locale, Locale(identifier: "en_GB"))
                }
                TextField("Notes (optional)", text: $notes).textFieldStyle(.roundedBorder).frame(minHeight: 48)
                if let result, result != .recorded { Text(result.message).foregroundStyle(MCIStyle.brick) }
                Button { record() } label: { MCIBigLabel(title: "Record Departure", systemImage: "arrow.right.circle.fill") }
                    .buttonStyle(.borderedProminent).tint(MCIStyle.brick).disabled(result == .recorded)
                Text("Anything left unchosen is recorded as Unknown and flagged for completion. The departure is never blocked for missing information.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .padding()
    }

    func record() {
        let t = store.now()
        let ini = store.initials
        let did = departureID
        let hid = destinationChosen ? hospitalID : nil
        let rid = unitChoice?.resourceID
        let ut = unitChoice?.id == "typed" ? unitText : ""
        let cat = category
        let dep: Date? = timeKnown ? departedAt : nil
        let retro = (store.incident(incidentID)?.patient(patientID)?.sceneLocation ?? .onScene) == .unknown
        let n = notes
        var r = MCIDepartureResult.notFound
        store.update(incidentID) {
            r = $0.recordDeparture(id: did, patientID: patientID, hospitalID: hid, resourceID: rid, unitText: ut, category: cat,
                                   departedAt: dep, retrospective: retro, notes: n, now: t, initials: ini)
        }
        result = r
        if r == .recorded || r == .alreadyRecorded { dismiss() }
    }
}

struct MCIDepartureFixSheet: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.dismiss) private var dismiss
    let incidentID: UUID
    let patientID: UUID
    let fix: MCIDepartureFix
    @State private var reason = ""
    @State private var hospitalChoice: MCIIDString?
    @State private var unitChoice: MCIIDString?
    @State private var unitText = ""
    @State private var category: TriageCategory?
    @State private var time = Date()
    @State private var loaded = false

    var title: String {
        switch fix {
        case .destination: return "Correct Destination"
        case .unit: return "Correct Transport Unit"
        case .category: return "Correct Category at Departure"
        case .time: return "Correct Time Out"
        case .void: return "Void Departure"
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                if let inc = store.incident(incidentID), let d = inc.validDeparture(for: patientID) {
                    VStack(alignment: .leading, spacing: 16) {
                        Text(fix == .void
                             ? "Voiding keeps the original departure in history and recalculates counts from the remaining valid departures. The patient returns to their earlier location."
                             : "The original value stays in history.")
                            .font(.callout)
                        fields(inc, d)
                        TextField("Reason (required)", text: $reason).textFieldStyle(.roundedBorder).frame(minHeight: 48)
                    }
                    .padding()
                    .onAppear {
                        guard !loaded else { return }
                        loaded = true
                        category = d.categoryAtDeparture
                        time = d.departedAt ?? Date()
                        hospitalChoice = MCIIDString(d.hospitalID?.uuidString ?? "unknown")
                        unitChoice = MCIIDString(d.resourceID?.uuidString ?? (d.unitText.isEmpty ? "unknown" : "typed"))
                        unitText = d.unitText
                    }
                } else {
                    Text("No valid departure to correct.").padding()
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(fix == .void ? "Void" : "Save Correction") { save() }.disabled(reason.mciTrimmed.isEmpty)
                }
            }
        }
    }

    @ViewBuilder
    func fields(_ inc: MCIIncident, _ d: MCIDeparture) -> some View {
        switch fix {
        case .destination:
            MCIOptionGrid(options: inc.hospitals.map { MCIIDString($0.id.uuidString) } + [MCIIDString("unknown")],
                          selected: hospitalChoice, title: { o in inc.hospitals.first { $0.id.uuidString == o.id }?.name ?? "Unknown destination" },
                          minWidth: 200) { hospitalChoice = $0 }
        case .unit:
            MCIOptionGrid(options: inc.resources.map { MCIIDString($0.id.uuidString) } + [MCIIDString("typed"), MCIIDString("unknown")],
                          selected: unitChoice,
                          title: { o in inc.resources.first { $0.id.uuidString == o.id }?.identifier.mciDash ?? (o.id == "typed" ? "Other / type below" : "Unknown unit") },
                          minWidth: 200) { unitChoice = $0 }
            if unitChoice?.id == "typed" {
                TextField("Unit / call sign", text: $unitText).textFieldStyle(.roundedBorder).frame(minHeight: 48)
            }
        case .category:
            MCICategoryPicker(selected: category) { category = $0 }
        case .time:
            DatePicker("Time Out", selection: $time, displayedComponents: [.date, .hourAndMinute])
                .datePickerStyle(.graphical)
                .environment(\.timeZone, inc.timeZone)
                .environment(\.locale, Locale(identifier: "en_GB"))
        case .void:
            Text("Departure: \(inc.hospital(d.hospitalID)?.name ?? "Unknown destination") at \(MCIFmt.full(d.departedAt, tz: inc.timeZone))")
                .font(.headline)
        }
    }

    func save() {
        guard let d = store.incident(incidentID)?.validDeparture(for: patientID) else { dismiss(); return }
        let t = store.now()
        let ini = store.initials
        let r = reason
        let did = d.id
        switch fix {
        case .destination:
            let h = hospitalChoice.flatMap { UUID(uuidString: $0.id) }
            store.update(incidentID) { $0.correctDepartureHospital(did, h, reason: r, now: t, initials: ini) }
        case .unit:
            let rid = unitChoice.flatMap { UUID(uuidString: $0.id) }
            let text = unitChoice?.id == "typed" ? unitText : ""
            store.update(incidentID) { $0.correctDepartureUnit(did, resourceID: rid, unitText: text, reason: r, now: t, initials: ini) }
        case .category:
            let c = category
            store.update(incidentID) { $0.correctDepartureCategory(did, c, reason: r, now: t, initials: ini) }
        case .time:
            let tm = time
            store.update(incidentID) { $0.correctDepartureTime(did, tm, reason: r, now: t, initials: ini) }
        case .void:
            store.update(incidentID) { $0.voidDeparture(did, reason: r, now: t, initials: ini) }
        }
        dismiss()
    }
}

// MARK: - Staging (source page 4)

struct MCIStagingSection: View {
    @EnvironmentObject var store: MCIStore
    let incident: MCIIncident
    @State private var newIdentifier = ""
    @State private var editing: MCIIDBox?

    var body: some View {
        let inc = incident
        let dups = inc.duplicateResources(identifier: newIdentifier, excluding: nil)
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Available in staging: \(inc.availableResourceCount)").font(.title2.bold())
                Spacer()
                Text("Derived from recorded statuses").font(.footnote).foregroundStyle(.secondary)
            }
            if !inc.isClosed {
                MCISectionBox(title: "Add Resource") {
                    TextField("Unit / resource identifier (e.g. Lee 12)", text: $newIdentifier)
                        .textFieldStyle(.roundedBorder).frame(minHeight: 48)
                    if !dups.isEmpty {
                        Label("Possible duplicate of \(dups.map { $0.identifier }.joined(separator: ", ")). Open the existing one instead, or add anyway if it is a different resource.",
                              systemImage: "exclamationmark.triangle").foregroundStyle(MCIStyle.brick)
                    }
                    Button {
                        var newID: UUID?
                        let t = store.now()
                        let ini = store.initials
                        let ident = newIdentifier.mciTrimmed
                        store.update(inc.id) { newID = $0.addResource(identifier: ident, agency: "", aidRequestID: nil, timeIn: t, now: t, initials: ini) }
                        newIdentifier = ""
                        if let newID { editing = MCIIDBox(id: newID) }
                    } label: { MCIBigLabel(title: dups.isEmpty ? "Add Resource (Time In now)" : "Add Anyway", systemImage: "plus") }
                        .buttonStyle(.borderedProminent).tint(MCIStyle.navy)
                        .disabled(newIdentifier.mciTrimmed.isEmpty)
                }
            }
            ForEach(MCIResourceStatus.allCases) { st in
                let list = inc.resources.filter { $0.status == st }
                if !list.isEmpty {
                    MCISectionBox(title: "\(st.label) (\(list.count))", accent: st == .available ? MCIStyle.navy : MCIStyle.slate) {
                        ForEach(list) { r in
                            Button { editing = MCIIDBox(id: r.id) } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(r.identifier.mciDash).font(.mciHeading(.title3))
                                        Text("\(r.type.mciNR) · \(r.agency.mciNR) · in \(MCIFmt.clock(r.timeIn, tz: inc.timeZone, ref: inc.refDate)) · \(r.assignment.mciNR)")
                                            .font(.subheadline)
                                    }
                                    Spacer()
                                    if r.aidRequestID != nil { MCITag(text: "MUTUAL AID", color: MCIStyle.slate) }
                                }
                                .frame(minHeight: 56).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            Divider()
                        }
                    }
                }
            }
        }
        .sheet(item: $editing) { box in MCIResourceEditor(incidentID: inc.id, resourceID: box.id).environmentObject(store) }
    }
}

struct MCIResourceEditor: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.dismiss) private var dismiss
    let incidentID: UUID
    let resourceID: UUID

    var body: some View {
        NavigationStack {
            ScrollView {
                if let inc = store.incident(incidentID), let r = inc.resources.first(where: { $0.id == resourceID }) {
                    let ro = inc.isClosed
                    let dups = inc.duplicateResources(identifier: r.identifier, excluding: r.id)
                    VStack(alignment: .leading, spacing: 14) {
                        MCIField(label: "Unit / Resource", text: store.record(incidentID, \.resources, resourceID, \.identifier, fallback: ""), readOnly: ro)
                        if !dups.isEmpty {
                            Label("Same identifier as another resource. Check it is not the same vehicle recorded twice.", systemImage: "exclamationmark.triangle")
                                .foregroundStyle(MCIStyle.brick)
                        }
                        Text("Status / Released").font(.headline)
                        MCIOptionGrid(options: MCIResourceStatus.allCases, selected: r.status, title: { $0.label }, minWidth: 170, disabled: ro) { s in
                            let t = store.now()
                            let ini = store.initials
                            store.update(incidentID) { $0.setResourceStatus(resourceID, s, now: t, initials: ini) }
                        }
                        if let rel = r.releasedAt { Text("Released \(MCIFmt.full(rel, tz: inc.timeZone))").font(.callout) }
                        MCITimeRow(label: "Time In", value: r.timeIn, tz: inc.timeZone, ref: inc.refDate, readOnly: ro) { v, reason in
                            let t = store.now()
                            let ini = store.initials
                            store.update(incidentID) { i in
                                guard let k = i.resourceIndex(resourceID) else { return }
                                let old = i.resources[k].timeIn
                                i.resources[k].timeIn = v
                                i.log(resourceID, "resource", "edit", field: "Time In", before: old.map(MCIFmt.iso), after: v.map(MCIFmt.iso), now: t, initials: ini, note: reason)
                            }
                        }
                        MCIField(label: "Assignment", text: store.record(incidentID, \.resources, resourceID, \.assignment, fallback: ""), readOnly: ro)
                        Group {
                            MCIField(label: "Type", text: store.record(incidentID, \.resources, resourceID, \.type, fallback: ""), readOnly: ro)
                            MCIField(label: "Agency", text: store.record(incidentID, \.resources, resourceID, \.agency, fallback: ""), readOnly: ro)
                            MCIField(label: "Call sign / contact", text: store.record(incidentID, \.resources, resourceID, \.contact, fallback: ""), readOnly: ro)
                            MCIField(label: "Quantity / capacity notes", text: store.record(incidentID, \.resources, resourceID, \.capacityNotes, fallback: ""), readOnly: ro)
                            MCILongText(label: "Notes", text: store.record(incidentID, \.resources, resourceID, \.notes, fallback: ""), minHeight: 120, readOnly: ro)
                            if let aid = inc.aid.first(where: { $0.id == r.aidRequestID }) {
                                Text("Linked to mutual aid request: \(aid.agency) (\(aid.status.label))").font(.callout)
                            }
                            let transports = inc.departures.filter { $0.resourceID == resourceID && !$0.voided }
                            if !transports.isEmpty {
                                Text("Transports: " + transports.compactMap { inc.patient($0.patientID)?.number }.joined(separator: ", ")).font(.callout)
                            }
                            MCIHistoryList(incident: inc, recordIDs: [resourceID])
                        }
                    }
                    .padding()
                }
            }
            .navigationTitle("Resource")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { store.flush(); dismiss() } } }
        }
    }
}

// MARK: - Scene sketch companion

enum MCISketchBackground {
    /// Renders the chosen page of the operator-supplied Scene Sketch Cards PDF, unaltered.
    static func page(_ store: MCIStore, _ t: MCISketchTemplate) -> PDFPage? {
        guard let url = store.sketchPDFURL, let doc = PDFDocument(url: url), t.pageIndex < doc.pageCount else { return nil }
        return doc.page(at: t.pageIndex)
    }

    static func aspect(_ p: PDFPage) -> Double {
        let b = p.bounds(for: .mediaBox)
        let rotated = p.rotation % 180 != 0
        let w = rotated ? b.height : b.width
        let h = rotated ? b.width : b.height
        return w > 0 ? Double(h / w) : 0.773
    }

    static func image(_ store: MCIStore, _ t: MCISketchTemplate, width: CGFloat = 2048) -> UIImage? {
        guard let p = page(store, t) else { return nil }
        return p.thumbnail(of: CGSize(width: width, height: width * CGFloat(aspect(p))), for: .mediaBox)
    }

    static func fit(_ size: CGSize, in rect: CGRect) -> CGRect {
        guard size.width > 0, size.height > 0 else { return rect }
        let s = min(rect.width / size.width, rect.height / size.height)
        let w = size.width * s, h = size.height * s
        return CGRect(x: rect.midX - w / 2, y: rect.midY - h / 2, width: w, height: h)
    }
}

struct MCISketchSection: View {
    @EnvironmentObject var store: MCIStore
    let incident: MCIIncident
    @State private var drawTarget: MCIInkTarget?
    @State private var drawBackground: UIImage?
    @State private var details: MCIIDBox?
    @State private var showImporter = false
    @State private var importMessage: String?

    var body: some View {
        let inc = incident
        VStack(alignment: .leading, spacing: 16) {
            MCISectionBox(title: "Sketch Card Backgrounds") {
                if store.sketchPDFURL != nil {
                    Text("Using the Scene Sketch Cards PDF you supplied. Its pages are shown unaltered as locked backgrounds; erasing never removes them.")
                        .font(.callout)
                } else {
                    Text("The Scene Sketch Cards PDF is not on this iPad yet, so sketches use a blank page of the same proportions. Add the PDF (page 1 Roadway / MVC, page 2 Structure, page 3 Large Facility) to use the original cards as backgrounds.")
                        .font(.callout)
                }
                Button { showImporter = true } label: {
                    MCIBigLabel(title: store.sketchPDFURL == nil ? "Add Sketch Cards PDF…" : "Replace Sketch Cards PDF…", systemImage: "doc.richtext")
                }
                .buttonStyle(.bordered)
                if let importMessage { Text(importMessage).foregroundStyle(MCIStyle.brick) }
            }
            if !inc.isClosed {
                MCISectionBox(title: "New Sketch") {
                    MCIOptionGrid(options: MCISketchTemplate.allCases, selected: nil, title: { "Add " + $0.title }, minWidth: 220) { t in
                        let aspect = MCISketchBackground.page(store, t).map { MCISketchBackground.aspect($0) } ?? 0.773
                        let ini = store.initials
                        let tm = store.now()
                        store.update(inc.id) { $0.addSketch(t, aspect: aspect, author: ini, now: tm, initials: ini) }
                    }
                }
            }
            MCISectionBox(title: "Sketches (\(inc.sketches.count))") {
                if inc.sketches.isEmpty { Text("No sketches yet.").foregroundStyle(.secondary) }
                ForEach(inc.sketches) { s in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(s.title).font(.mciHeading(.title3))
                        Text("\(s.template.title) · by \(s.author.mciNR) · updated \(MCIFmt.full(s.updatedAt, tz: inc.timeZone))")
                            .font(.footnote).foregroundStyle(.secondary)
                        if !s.triageSnapshot.isEmpty { Text(s.triageSnapshot).font(.footnote) }
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 200), spacing: 10)], spacing: 10) {
                            Button {
                                store.flush()
                                drawBackground = MCISketchBackground.image(store, s.template)
                                drawTarget = MCIInkTarget(incidentID: inc.id, recordID: s.id, fieldID: "sketch", title: s.title,
                                                          width: CGFloat(s.canvasWidth), pageHeight: CGFloat(s.canvasHeight))
                            } label: { MCIBigLabel(title: inc.isClosed ? "View Sketch" : "Open Sketch", systemImage: "pencil.and.outline") }
                                .buttonStyle(.borderedProminent).tint(MCIStyle.navy)
                            Button { details = MCIIDBox(id: s.id) } label: { MCIBigLabel(title: "Card Details…", systemImage: "list.bullet.rectangle") }
                                .buttonStyle(.bordered)
                            if !inc.isClosed {
                                Button {
                                    let aspect = s.canvasWidth > 0 ? s.canvasHeight / s.canvasWidth : 0.773
                                    let ini = store.initials
                                    let tm = store.now()
                                    store.update(inc.id) { $0.addSketch(s.template, aspect: aspect, author: ini, now: tm, initials: ini) }
                                } label: { MCIBigLabel(title: "Add Sketch Page", systemImage: "doc.badge.plus") }
                                    .buttonStyle(.bordered)
                            }
                        }
                        Divider()
                    }
                }
                Text("Handwriting on a sketch is never read. It does not change counts, locations or cleared rooms. No GPS, maps or symbol recognition.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .fullScreenCover(item: $drawTarget) { t in
            MCIHandwritingEditor(target: t, readOnly: inc.isClosed, background: drawBackground, allowPages: false).environmentObject(store)
        }
        .sheet(item: $details) { box in MCISketchDetails(incidentID: inc.id, sketchID: box.id).environmentObject(store) }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [.pdf]) { result in
            switch result {
            case .success(let url): importMessage = store.importSketchPDF(url)
            case .failure(let e): importMessage = e.localizedDescription
            }
        }
    }
}

struct MCISketchDetails: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.dismiss) private var dismiss
    let incidentID: UUID
    let sketchID: UUID

    func field(_ key: String) -> Binding<String> {
        Binding(get: { self.store.incident(incidentID)?.sketches.first { $0.id == sketchID }?.fields[key] ?? "" },
                set: { v in
                    let t = store.now()
                    store.update(incidentID, debounce: true) { i in
                        if let k = i.sketches.firstIndex(where: { $0.id == sketchID }) { i.sketches[k].fields[key] = v; i.sketches[k].updatedAt = t }
                    }
                })
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                if let inc = store.incident(incidentID), let s = inc.sketches.first(where: { $0.id == sketchID }) {
                    let ro = inc.isClosed
                    VStack(alignment: .leading, spacing: 14) {
                        MCIField(label: "Sketch title", text: store.record(incidentID, \.sketches, sketchID, \.title, fallback: ""), readOnly: ro)
                        MCIField(label: "Author", text: store.record(incidentID, \.sketches, sketchID, \.author, fallback: ""), readOnly: ro)
                        Text("Card fields (\(s.template.title))").font(.mciHeading(.title3))
                        Text("Facility descriptors (ambulatory, non-ambulatory, bariatric) can overlap; they are not added up. Orientation labels are entered by hand and do not imply a verified compass direction.")
                            .font(.footnote).foregroundStyle(.secondary)
                        ForEach(s.template.fields, id: \.key) { f in MCIField(label: f.label, text: field(f.key), readOnly: ro) }
                        MCISectionBox(title: "Triage Snapshot on this Card") {
                            Text(s.triageSnapshot.isEmpty ? "None. Copy one in below; it is a dated copy, not a live tally." : s.triageSnapshot)
                            if !ro {
                                Button { copySnapshot(inc, reported: true) } label: { MCIBigLabel(title: "Copy Latest Reported Count", systemImage: "number") }
                                    .buttonStyle(.bordered).disabled(inc.latestSnapshot == nil)
                                Button { copySnapshot(inc, reported: false) } label: { MCIBigLabel(title: "Copy Patient Register Now", systemImage: "list.number") }
                                    .buttonStyle(.bordered)
                                if !s.triageSnapshot.isEmpty {
                                    Button("Clear Snapshot", role: .destructive) {
                                        store.update(incidentID) { i in if let k = i.sketches.firstIndex(where: { $0.id == sketchID }) { i.sketches[k].triageSnapshot = "" } }
                                    }
                                    .frame(minHeight: 48)
                                }
                            }
                        }
                        MCILongText(label: "Notes", text: store.record(incidentID, \.sketches, sketchID, \.notes, fallback: ""), minHeight: 120, readOnly: ro)
                        Text("Created \(MCIFmt.full(s.createdAt, tz: inc.timeZone)) · updated \(MCIFmt.full(s.updatedAt, tz: inc.timeZone)) · page \(s.template.pageIndex + 1) of the sketch cards")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    .padding()
                }
            }
            .navigationTitle("Sketch Card Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { store.flush(); dismiss() } } }
        }
    }

    func copySnapshot(_ inc: MCIIncident, reported: Bool) {
        let now = Date()
        let tz = inc.timeZone
        var text: String
        if reported, let s = inc.latestSnapshot {
            let vals = TriageCategory.allCases.map { "\($0.abbr) \(s.value($0).map(String.init) ?? "?")" }.joined(separator: " · ")
            text = "Reported Scene Count observed \(MCIFmt.full(s.observedAt, tz: tz)), source \(s.reporter.mciNR): \(vals) (\(s.totalText))"
        } else {
            let r = inc.register()
            let vals = MCIRegister.keys.map { "\(TriageCategory(rawValue: $0)?.abbr ?? "UNK") \(r.all[$0] ?? 0)" }.joined(separator: " · ")
            text = "Patient Register (tracked records): \(vals); \(r.onSceneTotal) on scene"
        }
        text += " — copied \(MCIFmt.full(now, tz: tz))"
        store.update(incidentID) { i in if let k = i.sketches.firstIndex(where: { $0.id == sketchID }) { i.sketches[k].triageSnapshot = text; i.sketches[k].updatedAt = now } }
    }
}

// MARK: - Incident Packet PDF

enum MCIPacketPDF {
    static func make(_ i: MCIIncident, store: MCIStore?, generatedAt: Date) -> Data {
        let bgs = backgrounds(store)
        let first = render(i, backgrounds: bgs, generatedAt: generatedAt, totalPages: 0)
        return render(i, backgrounds: bgs, generatedAt: generatedAt, totalPages: first.pages).data
    }

    static func backgrounds(_ store: MCIStore?) -> [MCISketchTemplate: UIImage] {
        var out: [MCISketchTemplate: UIImage] = [:]
        guard let store else { return out }
        for t in MCISketchTemplate.allCases { if let img = MCISketchBackground.image(store, t, width: 2400) { out[t] = img } }
        return out
    }

    static func render(_ i: MCIIncident, backgrounds: [MCISketchTemplate: UIImage], generatedAt: Date, totalPages: Int) -> (data: Data, pages: Int) {
        let format = UIGraphicsPDFRendererFormat()
        format.documentInfo = [kCGPDFContextTitle as String: "Incident Packet — \(i.displayName)",
                               kCGPDFContextCreator as String: "Sumter EMS Command — MCI Board"]
        let renderer = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 792, height: 612), format: format)
        var pages = 0
        let data = renderer.pdfData { ctx in
            let c = MCIPDFComposer(ctx: ctx, incident: i, backgrounds: backgrounds, generatedAt: generatedAt, totalPages: totalPages)
            c.compose()
            pages = c.pageNumber
        }
        return (data, pages)
    }
}

final class MCIPDFComposer {
    let ctx: UIGraphicsPDFRendererContext
    let inc: MCIIncident
    let backgrounds: [MCISketchTemplate: UIImage]
    let generatedAt: Date
    let totalPages: Int
    let pageRect = CGRect(x: 0, y: 0, width: 792, height: 612)
    let margin: CGFloat = 30
    var y: CGFloat = 0
    var pageNumber = 0
    var part = ""
    var continuedHeader: (() -> Void)?
    var continuations: [(title: String, text: String)] = []
    var continuationKeys = Set<String>()

    let bodyFont = UIFont.systemFont(ofSize: 10)
    let boldFont = UIFont.systemFont(ofSize: 10, weight: .semibold)
    let headFont = UIFont.systemFont(ofSize: 10, weight: .bold, width: .condensed)
    let barFont = UIFont.systemFont(ofSize: 14, weight: .bold, width: .condensed)
    let smallFont = UIFont.systemFont(ofSize: 8)

    init(ctx: UIGraphicsPDFRendererContext, incident: MCIIncident, backgrounds: [MCISketchTemplate: UIImage], generatedAt: Date, totalPages: Int) {
        self.ctx = ctx
        self.inc = incident
        self.backgrounds = backgrounds
        self.generatedAt = generatedAt
        self.totalPages = totalPages
    }

    var tz: TimeZone { inc.timeZone }
    var contentTop: CGFloat { margin + 42 }
    var bottom: CGFloat { pageRect.height - margin - 14 }
    var contentWidth: CGFloat { pageRect.width - margin * 2 }
    func clock(_ d: Date?) -> String { MCIFmt.clock(d, tz: tz, ref: inc.refDate) }

    func textHeight(_ text: String, _ font: UIFont, _ width: CGFloat) -> CGFloat {
        let r = (text as NSString).boundingRect(with: CGSize(width: max(width, 1), height: .greatestFiniteMagnitude),
                                                options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: [.font: font], context: nil)
        return ceil(r.height)
    }

    func drawText(_ text: String, _ font: UIFont, _ color: UIColor, _ rect: CGRect, align: NSTextAlignment = .left) {
        let p = NSMutableParagraphStyle()
        p.alignment = align
        p.lineBreakMode = .byWordWrapping
        (text as NSString).draw(with: rect, options: [.usesLineFragmentOrigin, .usesFontLeading],
                                attributes: [.font: font, .foregroundColor: color, .paragraphStyle: p], context: nil)
    }

    func newPage() {
        ctx.beginPage()
        pageNumber += 1
        let bar = CGRect(x: margin, y: margin - 12, width: contentWidth, height: 22)
        MCIStyle.uiNavy.setFill()
        UIRectFill(bar)
        drawText("SUMTER COUNTY EMS — MCI INCIDENT PACKET", barFont, .white, bar.insetBy(dx: 8, dy: 3))
        drawText(part.uppercased() + (inc.isTraining ? " · TRAINING" : ""), barFont, .white, bar.insetBy(dx: 8, dy: 3), align: .right)
        let ident = "\(inc.displayName) · \(inc.location.mciDash) · started \(MCIFmt.full(inc.createdAt, tz: tz)) · \(inc.isTraining ? "TRAINING — fictitious" : "Operational record")"
        drawText(String(ident.prefix(160)), boldFont, MCIStyle.uiNavy, CGRect(x: margin, y: bar.maxY + 4, width: contentWidth, height: 14))
        let foot = "\(inc.isTraining ? "TRAINING — FICTITIOUS DATA · " : "")Page \(pageNumber)\(totalPages > 0 ? " of \(totalPages)" : "") · Generated \(MCIFmt.full(generatedAt, tz: tz)) · Times in \(inc.timeZoneID), 24-hour · — = not recorded · Coordination record, not an ePCR"
        drawText(foot, smallFont, .darkGray, CGRect(x: margin, y: pageRect.height - margin - 4, width: contentWidth, height: 12))
        y = contentTop
        continuedHeader?()
    }

    func startPart(_ name: String) {
        part = name
        newPage()
    }

    func sectionBar(_ title: String) {
        if y + 60 > bottom { newPage() }
        let r = CGRect(x: margin, y: y, width: contentWidth, height: 18)
        MCIStyle.uiNavy.setFill()
        UIRectFill(r)
        drawText(title.uppercased(), headFont, .white, r.insetBy(dx: 6, dy: 3))
        y += 22
    }

    func note(_ text: String) {
        let h = textHeight(text, smallFont, contentWidth)
        if y + h > bottom { newPage() }
        drawText(text, smallFont, .darkGray, CGRect(x: margin, y: y, width: contentWidth, height: h))
        y += h + 6
    }

    func cell(_ text: String, _ ref: String, limit: Int = 320) -> String {
        let t = text.mciTrimmed
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
            MCIStyle.uiBrick.setFill()
            UIRectFill(CGRect(x: self.margin, y: self.y, width: self.contentWidth, height: h))
            var x = self.margin
            for (k, col) in columns.enumerated() {
                self.drawText(col.0, self.headFont, .white, CGRect(x: x + 3, y: self.y + 3, width: widths[k] - 6, height: h - 6))
                x += widths[k]
            }
            self.y += h
        }
        drawHeader()
        continuedHeader = { [unowned self] in
            self.drawText("\(title) (continued)", self.boldFont, MCIStyle.uiNavy, CGRect(x: self.margin, y: self.y, width: self.contentWidth, height: 14))
            self.y += 16
            drawHeader()
        }
        for (n, raw) in rows.enumerated() {
            let row = raw + Array(repeating: "", count: max(0, columns.count - raw.count))
            let h = (widths.indices.map { textHeight(row[$0], bodyFont, widths[$0] - 6) }.max() ?? 12) + 6
            if y + h > bottom { newPage() }
            if n % 2 == 1 {
                MCIStyle.uiRow.setFill()
                UIRectFill(CGRect(x: margin, y: y, width: contentWidth, height: h))
            }
            var x = margin
            for k in widths.indices {
                drawText(row[k], bodyFont, .black, CGRect(x: x + 3, y: y + 3, width: widths[k] - 6, height: h - 4))
                x += widths[k]
            }
            UIColor(white: 0.75, alpha: 1).setFill()
            UIRectFill(CGRect(x: margin, y: y + h - 0.5, width: contentWidth, height: 0.5))
            y += h
        }
        continuedHeader = nil
        y += 12
    }

    func flowing(_ text: String, title: String) {
        let para = NSMutableParagraphStyle()
        para.lineBreakMode = .byWordWrapping
        let attr = NSAttributedString(string: text.isEmpty ? "—" : text, attributes: [.font: bodyFont, .paragraphStyle: para])
        let setter = CTFramesetterCreateWithAttributedString(attr as CFAttributedString)
        var start = 0
        let total = attr.length
        while start < total {
            if bottom - y < 30 { newPage() }
            if start > 0 {
                drawText("\(title) (continued)", boldFont, MCIStyle.uiNavy, CGRect(x: margin, y: y, width: contentWidth, height: 14))
                y += 16
            }
            let avail = CGRect(x: margin, y: y, width: contentWidth, height: bottom - y)
            guard let cg = UIGraphicsGetCurrentContext() else { return }
            cg.saveGState()
            cg.textMatrix = .identity
            cg.translateBy(x: 0, y: pageRect.height)
            cg.scaleBy(x: 1, y: -1)
            let pathRect = CGRect(x: avail.minX, y: pageRect.height - avail.maxY, width: avail.width, height: avail.height)
            let frame = CTFramesetterCreateFrame(setter, CFRange(location: start, length: 0), CGPath(rect: pathRect, transform: nil), nil)
            CTFrameDraw(frame, cg)
            cg.restoreGState()
            let visible = CTFrameGetVisibleStringRange(frame)
            if visible.length <= 0 {
                if y <= contentTop + 20 { return }
                newPage()
                continue
            }
            let used = CTFramesetterSuggestFrameSizeWithConstraints(setter, visible, nil, CGSize(width: avail.width, height: .greatestFiniteMagnitude), nil)
            start += visible.length
            if start < total { newPage() } else { y += ceil(used.height) + 10 }
        }
    }

    func n(_ v: Int?) -> String { v.map(String.init) ?? "Unknown" }

    // Parts

    func compose() {
        commandPart()
        triagePart()
        hospitalsPart()
        transportPart()
        sketchPart()
        activityPart()
        continuationPart()
        inkPart()
    }

    func commandPart() {
        startPart("Command")
        var types = inc.types
        if !inc.otherType.mciTrimmed.isEmpty { types.append(inc.otherType) }
        table("Incident", [("Field", 0.24), ("Value", 0.76)], [
            ["Incident Name", cell(inc.name, "Incident name")],
            ["Local incident ID", inc.localNumber],
            ["Date/Time (occurrence / start)", MCIFmt.full(inc.occurrenceAt, tz: tz)],
            ["Created on this iPad", MCIFmt.full(inc.createdAt, tz: tz)],
            ["Location / Address", cell(inc.location, "Location")],
            ["Incident Type", types.isEmpty ? "—" : types.joined(separator: ", ")],
            ["MCI Level", inc.level],
            ["Command Established", MCIFmt.full(inc.commandEstablishedAt, tz: tz)],
            ["Record", inc.isTraining ? "TRAINING — fictitious" : "Operational"],
            ["State", inc.isClosed ? "Closed \(MCIFmt.full(inc.closedAt, tz: tz))" : "Open"],
            ["Provenance", inc.provenance ?? "Created on this iPad"],
        ])
        table("Communications", [("Channel", 0.3), ("Value (operator-entered)", 0.7)], [
            ["Command Channel", cell(inc.commandChannel, "Command channel")],
            ["Tactical / Ops", cell(inc.tacticalChannel, "Tactical channel")],
            ["Medical / Hospital", cell(inc.medicalChannel, "Medical channel")],
            ["Air / Mutual Aid", cell(inc.airAidChannel, "Air/aid channel")],
            ["Command Post Location", cell(inc.commandPost, "Command post")],
        ])
        table("Scene Notes (added to source fields)", [("Item", 0.2), ("Entry", 0.8)], [
            ["Access / Egress", cell(inc.accessEgress, "Access / Egress")],
            ["Hazards", cell(inc.hazards, "Hazards")],
            ["Command Notes", cell(inc.commandNotes, "Command Notes")],
        ])
        table("Initial Actions Checklist (template v\(inc.checklistTemplateVersion))", [("Action", 0.5), ("State", 0.14), ("Time", 0.12), ("Initials", 0.08), ("Notes", 0.16)],
              inc.checklist.map { c -> [String] in [c.text, c.state.label, clock(c.completedAt), c.initials.mciDash, cell(c.notes, "Checklist note: " + c.text)] })
        var roleRows: [[String]] = []
        for r in inc.roleNames {
            let list = inc.roles.filter { $0.role == r }.sorted { ($0.assignedAt ?? .distantPast) < ($1.assignedAt ?? .distantPast) }
            if list.isEmpty { roleRows.append([r, "Unassigned", "—", "—", "—", "—", "—"]) }
            for a in list {
                roleRows.append([r, a.person.mciDash, a.agencyChannel.mciDash, a.reportsTo.mciDash, clock(a.assignedAt),
                                 a.relievedAt == nil ? "Current" : "Relieved \(clock(a.relievedAt))", cell(a.notes, "\(r) note")])
            }
        }
        table("Assignments", [("Role", 0.2), ("Person / call sign", 0.18), ("Agency / channel", 0.13), ("Reports to", 0.12),
                              ("Assigned", 0.09), ("Status", 0.12), ("Notes", 0.16)], roleRows)
    }

    func triagePart() {
        startPart("Triage and Count History")
        note("Two separate count sources. A: Reported Scene Count — manual snapshots of patients reportedly still on scene. B: Patient Register — derived from individual tracked records. They are never added together. Unknown is not zero.")
        let snaps = inc.snapshots.sorted { $0.recordedAt < $1.recordedAt }
        table("A · Reported Scene Count — Running Count", [("Observed", 0.1), ("R", 0.07), ("Y", 0.07), ("G", 0.07), ("EXP", 0.07), ("DEC", 0.07),
                                                           ("Total", 0.17), ("Source", 0.12), ("Recorded", 0.1), ("Notes", 0.16)],
              snaps.map { s -> [String] in
                  var row: [String] = [clock(s.observedAt)]
                  for c in TriageCategory.allCases { row.append(n(s.value(c))) }
                  let total: String = s.totalText + (s.correctsID == nil ? "" : " (correction)")
                  row.append(total)
                  row.append(s.reporter.mciDash)
                  row.append(clock(s.recordedAt))
                  row.append(cell(s.notes, "Snapshot note " + clock(s.recordedAt)))
                  return row
              })
        let r = inc.register()
        var regRows: [[String]] = MCIRegister.keys.map { k -> [String] in
            [MCIRegister.label(k), String(r.all[k] ?? 0), String(r.onScene[k] ?? 0), String(r.departed[k] ?? 0), String(r.unknownLocation[k] ?? 0)]
        }
        regRows.append(["Total", String(r.allTotal), String(r.onSceneTotal), String(r.departedTotal), String(r.unknownTotal)])
        table("B · Patient Register — as of \(MCIFmt.full(generatedAt, tz: tz))", [("Category", 0.3), ("Tracked", 0.175), ("On scene", 0.175), ("Departed", 0.175), ("Location unknown", 0.175)],
              regRows)
        note("Entered-in-error records are excluded from B. Reference guidance is separate from entered data; triage categories in this record were selected manually.")
    }

    func hospitalsPart() {
        startPart("Hospitals and Aid")
        let polls = inc.polls.sorted { $0.recordedAt < $1.recordedAt }
        table("Hospital Bed Polls — Last Reported Available (not live capacity)",
              [("Facility", 0.2), ("Observed", 0.1), ("Imm", 0.07), ("Del", 0.07), ("Min", 0.07), ("Divert", 0.09), ("Reporter / method", 0.16), ("Contact / notes", 0.24)],
              polls.map { p -> [String] in
                  [inc.hospital(p.hospitalID)?.name ?? "?", clock(p.observedAt), n(p.immediate), n(p.delayed), n(p.minor), p.divert.label,
                   "\(p.reporter.mciDash) / \(p.method.mciDash)", cell(p.contactNotes, "Poll note \(clock(p.recordedAt))")]
              })
        let sent = inc.patientsSent()
        var sentRows: [[String]] = []
        let dests: [UUID?] = inc.hospitals.map { Optional($0.id) } + [nil]
        for h in dests {
            guard let d = sent[h] else { continue }
            var row: [String] = [inc.hospital(h)?.name ?? "UNKNOWN DESTINATION"]
            for c in TriageCategory.allCases { row.append(String(d[c.rawValue] ?? 0)) }
            row.append(String(d["unknownAtDeparture"] ?? 0))
            row.append(String(d.values.reduce(0, +)))
            sentRows.append(row)
        }
        table("Patients Sent — valid departures by category AT DEPARTURE (as of \(MCIFmt.full(generatedAt, tz: tz)))",
              [("Destination", 0.3), ("R", 0.08), ("Y", 0.08), ("G", 0.08), ("EXP", 0.08), ("DEC", 0.08), ("UNK", 0.1), ("Total", 0.2)],
              sentRows, empty: "No departures.")
        table("Capability Notes (manual)", [("Facility", 0.3), ("Notes", 0.7)],
              inc.hospitals.filter { !$0.capabilityNotes.isEmpty }.map { h -> [String] in [h.name, cell(h.capabilityNotes, h.name + " capability")] })
        table("Mutual Aid — Ground", [("Agency", 0.16), ("Status", 0.1), ("Contacted", 0.09), ("Units sent", 0.15), ("ETA (estimate)", 0.12),
                                      ("Assignment", 0.16), ("Notes", 0.22)],
              inc.aid.sorted { $0.createdAt < $1.createdAt }.map { a -> [String] in
                  let eta: String = a.etaSource.isEmpty ? clock(a.eta) : clock(a.eta) + " (" + a.etaSource + ")"
                  return [a.agency, a.status.label, clock(a.contactedAt), cell(a.unitsSent, a.agency + " units"), eta,
                          cell(a.assignment, a.agency + " assignment"), cell(a.notes, a.agency + " notes")]
              })
        table("Air Medical", [("Service", 0.13), ("Status", 0.1), ("Requested", 0.09), ("LZ / Frequency", 0.16), ("ETA", 0.08),
                              ("Patients", 0.12), ("Destination", 0.14), ("Notes", 0.18)],
              inc.air.sorted { $0.createdAt < $1.createdAt }.map { a -> [String] in
                  let pts: String = a.patientIDs.compactMap { inc.patient($0)?.number }.joined(separator: ", ").mciDash
                  return [a.service, a.status.label, clock(a.requestedAt), cell(a.lzFrequency, a.service + " LZ"), clock(a.eta),
                          pts, cell(a.destination, a.service + " destination"), cell(a.notes, a.service + " notes")]
              })
    }

    func transportPart() {
        startPart("Transport and Staging")
        var rows: [[String]] = []
        for p in inc.patients where !p.enteredInError {
            let d = inc.validDeparture(for: p.id)
            var catOut = "—", unit = "—", dest = "—", out = "—"
            if let d {
                catOut = mciCategoryShort(d.categoryAtDeparture)
                unit = inc.resource(d.resourceID)?.identifier ?? d.unitText.mciDash
                dest = inc.hospital(d.hospitalID)?.name ?? "UNKNOWN"
                out = clock(d.departedAt)
            }
            var loc = inc.location(of: p).label
            if d?.needsCompletion == true { loc += " (incomplete)" }
            let row: [String] = [p.number, p.tag.mciDash, mciCategoryShort(p.category), catOut, p.ageText + " / " + p.sex.label,
                                 cell(p.complaint, p.number + " complaint"), unit, dest, out, loc, cell(p.notes, p.number + " notes")]
            rows.append(row)
        }
        table("Transport Log", [("Pt #", 0.06), ("Tag", 0.07), ("Current cat.", 0.09), ("Cat. at departure", 0.09), ("Age / Sex", 0.08),
                                ("Chief Complaint / Injury", 0.15), ("Transport Unit", 0.09), ("Destination", 0.12), ("Time Out", 0.07),
                                ("Location", 0.08), ("Notes", 0.10)], rows, empty: "No patients.")
        let voided = inc.departures.filter(\.voided)
        table("Voided Departures (kept for history, excluded from counts)", [("Patient", 0.12), ("Destination", 0.25), ("Time Out", 0.12), ("Voided", 0.12), ("Reason", 0.39)],
              voided.map { d -> [String] in [inc.patient(d.patientID)?.number ?? "?", inc.hospital(d.hospitalID)?.name ?? "Unknown", clock(d.departedAt), clock(d.voidedAt), cell(d.voidReason, "Void reason " + String(d.id.uuidString.prefix(6)))] },
              empty: "None.")
        table("Entered in Error (excluded from counts)", [("Patient", 0.15), ("Tag", 0.15), ("Reason", 0.7)],
              inc.patients.filter(\.enteredInError).map { p -> [String] in [p.number, p.tag.mciDash, cell(p.errorReason, p.number + " error reason")] }, empty: "None.")
        table("Staging", [("Unit / Resource", 0.14), ("Type", 0.09), ("Agency", 0.11), ("Time In", 0.08), ("Assignment", 0.15),
                          ("Status / Released", 0.15), ("Contact", 0.1), ("Notes", 0.18)],
              inc.resources.sorted { $0.createdAt < $1.createdAt }.map { r -> [String] in
                  let status: String = r.releasedAt == nil ? r.status.label : r.status.label + " " + clock(r.releasedAt)
                  return [r.identifier.mciDash, r.type.mciDash, r.agency.mciDash, clock(r.timeIn), cell(r.assignment, r.identifier + " assignment"),
                          status, r.contact.mciDash, cell(r.notes, r.identifier + " notes")]
              })
        note("Available in staging (derived from recorded statuses): \(inc.availableResourceCount).")
    }

    func sketchPart() {
        guard !inc.sketches.isEmpty else { return }
        for s in inc.sketches {
            startPart("Scene Sketch")
            var rows: [[String]] = s.template.fields.map { f -> [String] in [f.label, s.fields[f.key]?.mciDash ?? "—"] }
            rows.insert(["Sketch", s.title], at: 0)
            rows.append(["Author", s.author.mciDash])
            rows.append(["Triage snapshot (copied, not live)", s.triageSnapshot.mciDash])
            rows.append(["Updated", MCIFmt.full(s.updatedAt, tz: tz)])
            table("\(s.template.title) — card details", [("Field", 0.3), ("Value", 0.7)], rows)
            if !s.notes.isEmpty { flowing(s.notes, title: "\(s.title) notes") }
            newPage()
            let w = CGFloat(s.canvasWidth), h = CGFloat(s.canvasHeight)
            let area = CGRect(x: margin, y: y, width: contentWidth, height: bottom - y)
            let rect = MCISketchBackground.fit(CGSize(width: w, height: h), in: area)
            UIColor.white.setFill()
            UIRectFill(rect)
            if let bg = backgrounds[s.template] {
                bg.draw(in: MCISketchBackground.fit(bg.size, in: rect))
            } else {
                drawText("Sketch card PDF not on this iPad — blank page", smallFont, .gray, CGRect(x: rect.minX + 4, y: rect.minY + 4, width: rect.width, height: 12))
            }
            if let ink = inc.inks.first(where: { $0.recordID == s.id }), let drawing = try? PKDrawing(data: ink.drawing) {
                var img = UIImage()
                UITraitCollection(userInterfaceStyle: .light).performAsCurrent {
                    img = drawing.image(from: CGRect(x: 0, y: 0, width: w, height: h), scale: 3)
                }
                img.draw(in: rect)
            }
            UIColor.gray.setStroke()
            UIBezierPath(rect: rect).stroke()
            y = rect.maxY + 6
        }
    }

    func activityPart() {
        startPart("Activity")
        table("Activity Log", [("Recorded", 0.15), ("Effective", 0.15), ("Record", 0.16), ("Change", 0.46), ("Initials", 0.08)],
              inc.events.sorted { $0.recordedAt < $1.recordedAt }.map { e -> [String] in
                  [MCIFmt.full(e.recordedAt, tz: tz), MCIFmt.full(e.effectiveAt, tz: tz), inc.recordLabel(e.recordID),
                   cell(inc.describe(e), "Activity " + String(e.id.uuidString.prefix(8))), e.initials.mciDash]
              }, empty: "No activity.")
    }

    func continuationPart() {
        guard !continuations.isEmpty else { return }
        startPart("Continued Text")
        for item in continuations {
            if y + 40 > bottom { newPage() }
            drawText(item.title, boldFont, MCIStyle.uiNavy, CGRect(x: margin, y: y, width: contentWidth, height: 14))
            y += 16
            flowing(item.text, title: item.title)
        }
    }

    func inkTitle(_ k: MCIInk) -> String {
        let names = ["commandNotes": "Command Notes", "patientNotes": "Notes"]
        return "\(inc.recordLabel(k.recordID)) — \(names[k.fieldID] ?? k.fieldID)"
    }

    func inkPart() {
        let sketchIDs = Set(inc.sketches.map(\.id))
        for k in inc.inks.filter({ !sketchIDs.contains($0.recordID) }).sorted(by: { inkTitle($0) < inkTitle($1) }) {
            let title = inkTitle(k)
            let drawing: PKDrawing
            do { drawing = try PKDrawing(data: k.drawing) } catch {
                startPart("Handwriting")
                note("\(title): this handwriting attachment could not be read. It is preserved unchanged in backups.")
                continue
            }
            if drawing.strokes.isEmpty { continue }
            let w = CGFloat(k.width), ph = CGFloat(k.pageHeight)
            let pages = max(k.pageCount, Int(ceil(drawing.bounds.maxY / ph)))
            for p in 0..<pages {
                startPart("Handwriting")
                sectionBar("\(title) — handwriting page \(p + 1) of \(pages)")
                var img = UIImage()
                UITraitCollection(userInterfaceStyle: .light).performAsCurrent {
                    img = drawing.image(from: CGRect(x: 0, y: CGFloat(p) * ph, width: w, height: ph), scale: 2)
                }
                let rect = MCISketchBackground.fit(CGSize(width: w, height: ph), in: CGRect(x: margin, y: y, width: contentWidth, height: bottom - y))
                UIColor.white.setFill()
                UIRectFill(rect)
                img.draw(in: rect)
                UIColor.gray.setStroke()
                UIBezierPath(rect: rect).stroke()
                y = rect.maxY + 6
            }
        }
    }
}

struct MCIExportSheet: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.dismiss) private var dismiss
    let snapshot: MCIIncident
    @State private var pdfURL: URL?
    @State private var backupURL: URL?
    @State private var errorText: String?

    var baseName: String {
        "Sumter-\(snapshot.isTraining ? "TRAINING-" : "")\(snapshot.localNumber)-\(MCIFmt.fileStamp(Date(), tz: snapshot.timeZone))"
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                Text("The Incident Packet contains operational information. Share or store it only as agency policy allows. Nothing is sent anywhere unless you choose Share.")
                    .font(.footnote).foregroundStyle(.secondary)
                HStack(spacing: 12) {
                    Button { generate() } label: { MCIBigLabel(title: "Generate Incident Packet Preview", systemImage: "doc.richtext") }
                        .buttonStyle(.borderedProminent).tint(MCIStyle.navy)
                    if let pdfURL {
                        ShareLink(item: pdfURL) { MCIBigLabel(title: "Share or Save PDF…", systemImage: "square.and.arrow.up") }
                            .buttonStyle(.bordered)
                    }
                }
                if let errorText { Text(errorText).foregroundStyle(MCIStyle.brick) }
                if let pdfURL {
                    MCIPDFPreview(url: pdfURL).frame(maxWidth: .infinity, maxHeight: .infinity).border(Color.secondary.opacity(0.4))
                } else {
                    Text("Generate a preview to check every page before sharing.").foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                Divider()
                HStack(spacing: 12) {
                    Button { makeBackup() } label: { MCIBigLabel(title: "Create Editable Backup File", systemImage: "externaldrive") }
                        .buttonStyle(.bordered)
                    if let backupURL {
                        ShareLink(item: backupURL) { MCIBigLabel(title: "Share or Save Backup…", systemImage: "square.and.arrow.up") }
                            .buttonStyle(.bordered)
                    }
                }
                Text("The backup holds every record, link, history entry and handwriting/sketch ink. Reference PDFs and the sketch card PDF are not inside it; add those again on another iPad.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            .padding()
            .navigationTitle("Export — \(snapshot.displayName)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }

    func write(_ data: Data, _ name: String) throws -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("MCIExports", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent(name)
        if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
        try data.write(to: url, options: [.atomic, .completeFileProtection])
        return url
    }

    func generate() {
        let data = MCIPacketPDF.make(snapshot, store: store, generatedAt: Date())
        do { pdfURL = try write(data, "\(baseName)-Incident-Packet.pdf"); errorText = nil } catch {
            errorText = "The PDF could not be written: \(error.localizedDescription)"
        }
    }

    func makeBackup() {
        do {
            let data = try MCIBackupCodec.encode(snapshot, exportedAt: Date())
            backupURL = try write(data, "\(baseName)-backup.json")
            errorText = nil
        } catch {
            errorText = "The backup could not be written: \(error.localizedDescription)"
        }
    }
}

// MARK: - Settings

struct MCISettingsView: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.dismiss) private var dismiss
    @State private var tzText = ""
    @State private var message: String?
    @State private var levelsText = ""
    @State private var checklistText = ""
    @State private var rolesText = ""
    @State private var groundText = ""
    @State private var airText = ""
    @State private var reminderText = ""
    @State private var newHospital = ""
    @State private var showRefImporter = false
    @State private var showSketchImporter = false
    @State private var refMeta = MCIReferenceDoc(id: UUID(), title: "", revision: "", effectiveDate: "", source: "", approvalRecord: "", fileName: "", addedAt: Date())
    @State private var results: [MCICheckResult] = []
    @State private var loaded = false

    func lines(_ s: String) -> [String] { s.split(separator: "\n").map { String($0).mciTrimmed }.filter { !$0.isEmpty } }

    var body: some View {
        NavigationStack {
            Form {
                Group {
                    Section("Operational time zone for new incidents") {
                        Text("Current: \(store.data.settings.defaultTimeZoneID)")
                        TextField("e.g. America/New_York", text: $tzText).textInputAutocapitalization(.never).autocorrectionDisabled()
                        Button("Apply") {
                            if let tz = TimeZone(identifier: tzText.mciTrimmed) {
                                store.updateSettings { $0.defaultTimeZoneID = tz.identifier }
                                message = "New incidents will use \(tz.identifier)."
                            } else { message = "Not a recognised time zone identifier." }
                        }
                    }
                    Section {
                        TextField("Initials (optional)", text: Binding(get: { store.data.settings.initials },
                                                                       set: { v in store.updateSettings(debounce: true) { $0.initials = v } }))
                        Toggle("Keep screen awake while an incident is open",
                               isOn: Binding(get: { store.data.settings.keepAwake }, set: { v in store.updateSettings { $0.keepAwake = v } }))
                    } header: { Text("Operator") } footer: { Text("Initials are a label on activity entries, not a sign-in.") }
                    if let message { Section { Text(message) } }
                }
                Group {
                    Section {
                        TextField("One level per line", text: $levelsText, axis: .vertical).lineLimit(3...8)
                        Button("Save MCI Levels") { store.updateSettings { $0.levels = lines(levelsText) }; message = "Levels saved." }
                    } header: { Text("MCI levels") } footer: { Text("Labels only. No patient-number thresholds or automatic escalation.") }
                    Section {
                        TextField("One action per line", text: $checklistText, axis: .vertical).lineLimit(6...20)
                        Button("Save Checklist Template (new version)") {
                            store.updateSettings { s in s.checklist = lines(checklistText); s.checklistVersion += 1 }
                            message = "Checklist template saved as version \(store.data.settings.checklistVersion). Existing incidents keep their own copy."
                        }
                    } header: { Text("Initial actions checklist template (v\(store.data.settings.checklistVersion))") } footer: {
                        Text("Agency review of these entries happens here, outside an incident. Each incident keeps the version it started with.")
                    }
                    Section("Assignment roles for new incidents") {
                        TextField("One role per line", text: $rolesText, axis: .vertical).lineLimit(6...20)
                        Button("Save Roles") { store.updateSettings { $0.roles = lines(rolesText) }; message = "Roles saved for new incidents." }
                    }
                }
                Group {
                    Section {
                        ForEach(store.data.settings.hospitals) { h in
                            HStack {
                                TextField("Name", text: Binding(get: { store.data.settings.hospitals.first { $0.id == h.id }?.name ?? "" },
                                                                set: { v in store.updateSettings(debounce: true) { s in if let k = s.hospitals.firstIndex(where: { $0.id == h.id }) { s.hospitals[k].name = v } } }))
                                Toggle("Active", isOn: Binding(get: { store.data.settings.hospitals.first { $0.id == h.id }?.active ?? false },
                                                               set: { v in store.updateSettings { s in if let k = s.hospitals.firstIndex(where: { $0.id == h.id }) { s.hospitals[k].active = v } } }))
                                    .frame(maxWidth: 140)
                            }
                        }
                        HStack {
                            TextField("Add facility", text: $newHospital)
                            Button("Add") {
                                let n = newHospital.mciTrimmed
                                guard !n.isEmpty else { return }
                                store.updateSettings { $0.hospitals.append(MCIDirectoryEntry(id: UUID(), name: n, active: true)) }
                                newHospital = ""
                            }
                        }
                    } header: { Text("Hospital directory") } footer: {
                        Text("Seeded from the supplied PDF; not independently verified. Renaming or deactivating here never changes names stored in earlier incidents.")
                    }
                    Section("Mutual aid agencies (one per line)") {
                        TextField("Agencies", text: $groundText, axis: .vertical).lineLimit(4...12)
                        Button("Save Agencies") { store.updateSettings { $0.groundAgencies = lines(groundText) }; message = "Agencies saved." }
                    }
                    Section("Air services (one per line)") {
                        TextField("Services", text: $airText, axis: .vertical).lineLimit(2...6)
                        Button("Save Air Services") { store.updateSettings { $0.airServices = lines(airText) }; message = "Air services saved." }
                    }
                    Section {
                        TextField("Minutes (blank = off)", text: $reminderText).keyboardType(.numberPad)
                        Button("Save Reminder") {
                            let v = Int(reminderText.filter(\.isNumber))
                            store.updateSettings { $0.pollReminderMinutes = v }
                            message = v == nil ? "Bed-poll reminder off." : "Polls older than \(v!) minutes show Needs Update."
                        }
                    } header: { Text("Bed-poll reminder") } footer: { Text("A local reminder only, not a medical or agency standard.") }
                }
                Group {
                    Section {
                        Button(store.sketchPDFURL == nil ? "Add Scene Sketch Cards PDF…" : "Replace Scene Sketch Cards PDF…") { showSketchImporter = true }
                    } header: { Text("Scene sketch cards") } footer: { Text("Pages 1–3: Roadway / MVC, Structure A/B/C/D, Large Facility / Nursing Home. Shown unaltered as locked backgrounds.") }
                    Section {
                        TextField("Title", text: $refMeta.title)
                        TextField("Revision", text: $refMeta.revision)
                        TextField("Effective date", text: $refMeta.effectiveDate)
                        TextField("Source", text: $refMeta.source)
                        TextField("Approval record (who/when, operator-entered)", text: $refMeta.approvalRecord)
                        Button("Choose PDF and Add Reference…") { showRefImporter = true }.disabled(refMeta.title.mciTrimmed.isEmpty)
                        ForEach(store.data.settings.references) { r in
                            Text("\(r.title) · rev \(r.revision.mciNR) · \(r.approvalRecord.mciTrimmed.isEmpty ? "no approval record" : "approval record entered")")
                        }
                    } header: { Text("Approved references (optional)") } footer: {
                        Text("Approval details are what you type; they are a record, not proof of institutional approval. Missing approval never blocks the board.")
                    }
                    Section {
                        Button("Run Built-in Checks") { results = MCIChecks.run() }.frame(minHeight: 48)
                        if !results.isEmpty {
                            let passed = results.filter(\.passed).count
                            Text("\(passed) of \(results.count) passed").font(.headline)
                                .foregroundStyle(passed == results.count ? Color.green : MCIStyle.brick)
                        }
                        ForEach(results) { r in
                            VStack(alignment: .leading, spacing: 2) {
                                Label(r.name, systemImage: r.passed ? "checkmark.circle.fill" : "xmark.octagon.fill")
                                    .foregroundStyle(r.passed ? Color.green : MCIStyle.brick)
                                if !r.detail.isEmpty { Text(r.detail).font(.footnote) }
                            }
                        }
                    } header: { Text("Built-in checks") } footer: { Text("Run the incident rules on throwaway fictitious data in memory. Saved incidents are not touched.") }
                    Section("About this data") {
                        Text("Stored only on this iPad in this app's Documents folder with iOS file protection. No network, cloud or account. iPad backups (iCloud or computer) may include app data depending on your settings. This is a coordination board — not an ePCR, triage decision tool, dispatch interface or verified hospital-capacity service — and is not certified, agency-approved or NIMS/ICS-compliance software.")
                            .font(.footnote)
                    }
                }
            }
            .navigationTitle("MCI Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { store.flush(); dismiss() } } }
            .fileImporter(isPresented: $showRefImporter, allowedContentTypes: [.pdf]) { result in
                if case .success(let url) = result {
                    var meta = refMeta
                    meta.id = UUID()
                    meta.addedAt = Date()
                    message = store.importReference(url, meta: meta) ?? "Reference added."
                    refMeta = MCIReferenceDoc(id: UUID(), title: "", revision: "", effectiveDate: "", source: "", approvalRecord: "", fileName: "", addedAt: Date())
                }
            }
            .background(EmptyView().fileImporter(isPresented: $showSketchImporter, allowedContentTypes: [.pdf]) { result in
                if case .success(let url) = result { message = store.importSketchPDF(url) ?? "Sketch cards PDF added." }
            })
        }
        .onAppear {
            guard !loaded else { return }
            loaded = true
            let s = store.data.settings
            levelsText = s.levels.joined(separator: "\n")
            checklistText = s.checklist.joined(separator: "\n")
            rolesText = s.roles.joined(separator: "\n")
            groundText = s.groundAgencies.joined(separator: "\n")
            airText = s.airServices.joined(separator: "\n")
            reminderText = s.pollReminderMinutes.map(String.init) ?? ""
        }
    }
}

// MARK: - Built-in checks (run on the iPad from Settings)

struct MCICheckResult: Identifiable {
    let id = UUID()
    let name: String
    let passed: Bool
    let detail: String
}

enum MCIChecks {
    static func run() -> [MCICheckResult] {
        var out: [MCICheckResult] = []
        func check(_ name: String, _ ok: Bool, _ detail: String = "") {
            out.append(MCICheckResult(name: name, passed: ok, detail: ok ? "" : detail))
        }
        let base = Date(timeIntervalSince1970: 1_793_700_000)
        func at(_ m: Double) -> Date { base.addingTimeInterval(m * 60) }
        let settings = MCISettings()

        var inc = MCIIncident.new(now: base, settings: settings, training: true)
        check("New incident works immediately with a local ID and no details",
              !inc.localNumber.isEmpty && inc.name.isEmpty && inc.occurrenceAt == nil && inc.level == "Unknown")
        check("Checklist, roles and hospitals are seeded from the source",
              inc.checklist.count == 12 && inc.roleNames.count == 11 && inc.hospitals.count == 6
                && inc.checklist.allSatisfy { $0.state == .pending } && inc.roles.isEmpty)

        // Reported count vs register
        var twelve: [TriageCategory: Int?] = [:]
        twelve[.immediate] = .some(3); twelve[.delayed] = .some(4); twelve[.minor] = .some(5)
        twelve[.expectant] = .some(0); twelve[.deceased] = .some(0)
        let snapID = UUID()
        inc.recordSnapshot(id: snapID, values: twelve, observedAt: at(1), reporter: "Triage", notes: "", correcting: nil, now: at(1), initials: "")
        let again = inc.recordSnapshot(id: snapID, values: twelve, observedAt: at(1), reporter: "Triage", notes: "", correcting: nil, now: at(1), initials: "")
        check("Double Save of a snapshot records it once", !again && inc.snapshots.count == 1)
        var ids: [UUID] = []
        for k in 0..<5 { ids.append(inc.addPatient(now: at(2 + Double(k)), initials: "")) }
        let reg = inc.register()
        check("Reported 12 and register 5 stay separate (never 17)",
              reg.allTotal == 5 && reg.onSceneTotal == 5 && inc.latestSnapshot?.knownSubtotal == 12,
              "register \(reg.allTotal), snapshot \(inc.latestSnapshot?.knownSubtotal ?? -1)")
        check("New patients are Not classified, never Minor by default",
              reg.all[MCIUnclassified.key] == 5 && reg.all[TriageCategory.minor.rawValue] == nil)

        var partial: [TriageCategory: Int?] = [:]
        partial[.immediate] = .some(2); partial[.delayed] = .some(1); partial[.minor] = .some(0)
        partial[.expectant] = .some(nil); partial[.deceased] = .some(nil)
        inc.recordSnapshot(id: UUID(), values: partial, observedAt: at(8), reporter: "", notes: "", correcting: snapID, now: at(8), initials: "")
        let snap = inc.latestSnapshot
        check("Incomplete snapshot shows known subtotal and Incomplete; Unknown is not zero",
              snap?.isComplete == false && snap?.knownSubtotal == 3 && snap?.value(.expectant) == nil
                && snap?.value(.minor) == 0 && (snap?.totalText.contains("Incomplete") ?? false))
        check("Correction is a new snapshot linked to the earlier one",
              inc.snapshots.count == 2 && snap?.correctsID == snapID && inc.snapshots.first { $0.id == snapID }?.knownSubtotal == 12)

        let cats: [TriageCategory] = [.immediate, .delayed, .minor, .expectant, .deceased]
        for (k, c) in cats.enumerated() { inc.setCategory(ids[k], c, reason: "", now: at(10), initials: "") }
        let reg2 = inc.register()
        check("Expectant and Deceased are counted separately",
              reg2.all[TriageCategory.expectant.rawValue] == 1 && reg2.all[TriageCategory.deceased.rawValue] == 1)

        // Departure
        let h1 = inc.hospitals[0].id
        let h2 = inc.hospitals[1].id
        let dep = UUID()
        let r1 = inc.recordDeparture(id: dep, patientID: ids[0], hospitalID: h1, resourceID: nil, unitText: "Medic 101",
                                     category: .immediate, departedAt: at(12), retrospective: false, notes: "", now: at(12), initials: "")
        let r2 = inc.recordDeparture(id: dep, patientID: ids[0], hospitalID: h1, resourceID: nil, unitText: "Medic 101",
                                     category: .immediate, departedAt: at(12), retrospective: false, notes: "", now: at(12), initials: "")
        let r3 = inc.recordDeparture(id: UUID(), patientID: ids[0], hospitalID: h1, resourceID: nil, unitText: "Medic 101",
                                     category: .immediate, departedAt: at(13), retrospective: false, notes: "", now: at(13), initials: "")
        let reg3 = inc.register()
        let sent = inc.patientsSent()
        check("One departure: 4 on scene, 1 departed, 1 sent to that hospital",
              r1 == .recorded && reg3.onSceneTotal == 4 && reg3.departedTotal == 1 && sent[h1]?[TriageCategory.immediate.rawValue] == 1
                && inc.sentTotal(to: h1) == 1)
        check("Double tap / retry cannot add a second departure",
              r2 == .alreadyRecorded && r3 == .patientAlreadyDeparted && inc.departures.count == 1 && inc.register().departedTotal == 1)
        check("A departure never rewrites the reported snapshot", inc.snapshots.first { $0.id == snapID }?.knownSubtotal == 12)

        inc.setCategory(ids[0], .delayed, reason: "Re-triage", now: at(14), initials: "")
        check("Re-triage does not change category at departure",
              inc.departures[0].categoryAtDeparture == .immediate && inc.patientsSent()[h1]?[TriageCategory.immediate.rawValue] == 1)

        inc.correctDepartureHospital(dep, h2, reason: "Wrong facility tapped", now: at(15), initials: "")
        check("Correcting destination moves the count without adding a patient",
              inc.sentTotal(to: h1) == 0 && inc.sentTotal(to: h2) == 1 && inc.register().allTotal == 5 && inc.register().departedTotal == 1)

        let voided = inc.voidDeparture(dep, reason: "Recorded on wrong patient", now: at(16), initials: "")
        check("Voiding reverses derived counts and keeps history",
              voided && inc.register().onSceneTotal == 5 && inc.sentTotal(to: h2) == 0 && inc.departures.count == 1
                && inc.events.contains { $0.action == "departureVoided" })

        let retro = inc.recordDeparture(id: UUID(), patientID: ids[1], hospitalID: nil, resourceID: nil, unitText: "",
                                        category: nil, departedAt: nil, retrospective: true, notes: "", now: at(17), initials: "")
        check("Urgent departure with unknowns is allowed and flagged; unknown destination kept separate",
              retro == .recorded && inc.validDeparture(for: ids[1])?.needsCompletion == true && inc.sentTotal(to: nil) == 1
                && !inc.reconciliationIssues.isEmpty)

        // Duplicate tags and entered in error
        if let a = inc.patientIndex(ids[2]), let b = inc.patientIndex(ids[3]) {
            inc.patients[a].tag = "A-12"
            inc.patients[b].tag = "a 12"
        }
        let dupList = inc.patient(ids[2]).map { inc.duplicateTags(of: $0) } ?? []
        check("Duplicate tags warn (normalised) without merging", dupList.map(\.id) == [ids[3]] && inc.patients.count == 5)
        let blocked = inc.markEnteredInError(ids[1], reason: "Duplicate", now: at(18), initials: "")
        let noReason = inc.markEnteredInError(ids[3], reason: " ", now: at(18), initials: "")
        let marked = inc.markEnteredInError(ids[3], reason: "Duplicate of P-003", now: at(18), initials: "")
        check("Entered in Error needs a reason and is blocked by a valid departure",
              blocked == .blockedByDeparture && noReason == .needsReason && marked == .marked)
        check("Entered in Error is excluded from counts but kept",
              inc.register().allTotal == 4 && inc.patients.count == 5 && inc.duplicateTags(of: inc.patient(ids[2])!).isEmpty)
        inc.restoreFromError(ids[3], now: at(19), initials: "")
        check("Entered in Error can be undone", inc.register().allTotal == 5)

        // Hospitals
        let pollID = UUID()
        let poll = MCIHospitalPoll(id: pollID, hospitalID: h1, immediate: nil, delayed: 0, minor: 4, divert: .unknown, contactNotes: "",
                                   reporter: "Med Comms", method: "Radio", observedAt: at(20), recordedAt: at(20))
        inc.addPoll(poll, initials: "")
        let dupPoll = inc.addPoll(poll, initials: "")
        _ = inc.recordDeparture(id: UUID(), patientID: ids[4], hospitalID: h1, resourceID: nil, unitText: "Medic 102",
                                category: .deceased, departedAt: at(21), retrospective: false, notes: "", now: at(21), initials: "")
        let lp = inc.latestPoll(h1)
        check("Blank capacity is Unknown, explicit 0 is 0, and transports never change a poll",
              lp?.immediate == nil && lp?.delayed == 0 && lp?.minor == 4 && !dupPoll && inc.polls.count == 1)
        check("Poll with no time has unknown age", MCIFmt.age(of: nil, now: at(30)) == "age unknown")

        // Mutual aid → staging → transport
        let aidID = inc.addAid(agency: "Lee County EMS", now: at(22), initials: "")
        let res1 = inc.stageAidArrival(aidID, now: at(30), initials: "")
        let res2 = inc.stageAidArrival(aidID, now: at(31), initials: "")
        check("Aid arrival links one staging resource, never a copy",
              res1 != nil && res1 == res2 && inc.resources.count == 1 && inc.availableResourceCount == 1
                && inc.aid[0].status == .arrived && inc.resources[0].aidRequestID == aidID)
        let p6 = inc.addPatient(now: at(32), initials: "")
        _ = inc.recordDeparture(id: UUID(), patientID: p6, hospitalID: h2, resourceID: res1, unitText: "", category: .minor,
                                departedAt: at(33), retrospective: false, notes: "", now: at(33), initials: "")
        check("A resource used for transport is no longer counted available",
              inc.resources[0].status == .transporting && inc.availableResourceCount == 0)
        check("Duplicate resource identifiers are flagged", !inc.duplicateResources(identifier: "lee county ems", excluding: nil).isEmpty)
        _ = inc.addAid(agency: "Lee County EMS", now: at(34), initials: "")
        check("Repeat requests to one agency stay separate", inc.aid.count == 2)

        // Roles and checklist
        inc.assignRole("Incident Commander", person: "Unit A (fictitious)", agencyChannel: "", reportsTo: "", at: at(35), notes: "", now: at(35), initials: "")
        inc.assignRole("Incident Commander", person: "Unit B (fictitious)", agencyChannel: "", reportsTo: "", at: at(40), notes: "", now: at(40), initials: "")
        check("Reassignment relieves the previous holder and keeps history",
              inc.currentAssignment("Incident Commander")?.person == "Unit B (fictitious)" && inc.roles.count == 2
                && inc.roles.first { $0.person == "Unit A (fictitious)" }?.relievedAt == at(40))
        let item = inc.checklist[0].id
        inc.setChecklist(item, .completed, at: at(41), now: at(41), initials: "")
        inc.setChecklist(item, .pending, at: at(42), now: at(42), initials: "")
        check("Reversing a checklist item keeps both changes in history",
              inc.checklist[0].completedAt == nil && inc.events.filter { $0.recordID == item }.count == 2)

        // Multi-day time display
        let nextDay = inc.createdAt.addingTimeInterval(26 * 3600)
        check("Times on a later day show their date", MCIFmt.clock(nextDay, tz: inc.timeZone, ref: inc.refDate).contains("/"))

        // Sketch and ink
        let sk = inc.addSketch(.roadway, aspect: 0.773, author: "", now: at(43), initials: "")
        let pt = { (x: CGFloat, y: CGFloat) in
            PKStrokePoint(location: CGPoint(x: x, y: y), timeOffset: 0, size: CGSize(width: 4, height: 4), opacity: 1, force: 1, azimuth: 0, altitude: .pi / 2)
        }
        let stroke = PKStroke(ink: PKInk(.pen, color: .black), path: PKStrokePath(controlPoints: [pt(20, 20), pt(500, 400)], creationDate: base),
                              transform: .identity, mask: nil)
        inc.inks.append(MCIInk(id: UUID(), recordID: sk, fieldID: "sketch", drawing: PKDrawing(strokes: [stroke]).dataRepresentation(),
                               pageCount: 1, width: 1024, pageHeight: 792, updatedAt: at(43)))
        check("Sketch stores template, page and fixed canvas size",
              inc.sketches.first { $0.id == sk }.map { $0.template == .roadway && $0.canvasWidth == 1024 && $0.canvasHeight == 792 } ?? false)

        // Overflow content for the packet
        let long = String(repeating: "Long complaint text for pagination checks. ", count: 24) + "MARKER-END"
        for k in 0..<20 {
            let id = inc.addPatient(now: at(50 + Double(k)), initials: "")
            if let i = inc.patientIndex(id) { inc.patients[i].complaint = k == 0 ? long : "Fictitious complaint \(k)" }
            _ = inc.recordDeparture(id: UUID(), patientID: id, hospitalID: inc.hospitals[k % 6].id, resourceID: nil, unitText: "T-\(k)",
                                    category: cats[k % 5], departedAt: at(60 + Double(k)), retrospective: false, notes: "", now: at(60 + Double(k)), initials: "")
        }
        if let i = inc.patients.indices.last { inc.patients[i].tag = "LAST-PATIENT-MARKER" }
        check("More than 20 patients and 14 departures are tracked", inc.activePatients.count >= 26 && inc.departures.filter { !$0.voided }.count > 14)

        let pdf = MCIPacketPDF.make(inc, store: nil, generatedAt: at(120))
        if let doc = PDFDocument(data: pdf) {
            let text = doc.string ?? ""
            check("Incident Packet paginates", doc.pageCount >= 6, "Pages: \(doc.pageCount)")
            check("Packet includes the end of a 1,000-character complaint", text.contains("MARKER-END"))
            check("Packet includes the last patient row", text.contains("LAST-PATIENT-MARKER"))
            check("Packet keeps reported count and register separate",
                  text.contains("Reported Scene Count") && text.contains("Patient Register") && text.contains("AT DEPARTURE"))
            check("Packet pages are numbered with a total", text.contains("of \(doc.pageCount)"))
        } else {
            check("Incident Packet opens", false, "The generated PDF could not be read.")
        }

        // Backup round trip
        do {
            let data = try MCIBackupCodec.encode(inc, exportedAt: at(130))
            let b = try MCIBackupCodec.decode(data)
            let problems = MCIBackupCodec.validate(b.incident)
            let copy = MCIBackupCodec.restoredCopy(b, now: at(131), initials: "")
            check("Backup validates", problems.isEmpty, problems.joined(separator: "; "))
            check("Restored copy is separate, read-only and has new IDs",
                  copy.id != inc.id && copy.isClosed && Set(copy.patients.map(\.id)).isDisjoint(with: Set(inc.patients.map(\.id))))
            let sentA = inc.patientsSent().values.map { $0.values.reduce(0, +) }.reduce(0, +)
            let sentB = copy.patientsSent().values.map { $0.values.reduce(0, +) }.reduce(0, +)
            check("Restored copy keeps links, counts and ink",
                  MCIBackupCodec.validate(copy).isEmpty && copy.register() == inc.register() && sentA == sentB
                    && copy.inks.count == inc.inks.count && copy.resources[0].aidRequestID == copy.aid.first { $0.agency == "Lee County EMS" && $0.status == .arrived }?.id)
        } catch {
            check("Backup round trip", false, "\(error)")
        }
        var rejected = false
        do { _ = try MCIBackupCodec.decode(Data("{\"not\": \"a backup\"}".utf8)) } catch { rejected = true }
        check("Unreadable backup is rejected without changes", rejected)

        // Closing
        inc.close(now: at(140), initials: "")
        let closedResult = inc.recordDeparture(id: UUID(), patientID: ids[2], hospitalID: h1, resourceID: nil, unitText: "", category: nil,
                                               departedAt: nil, retrospective: false, notes: "", now: at(141), initials: "")
        check("Closing keeps every patient and blocks new departures",
              inc.isClosed && closedResult == .closed && inc.patients.count == 26)
        return out
    }
}

// MARK: - App entry (MyApp.swift shows ContentView)

struct ContentView: View {
    var body: some View { MCIRootView() }
}
