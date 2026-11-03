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
/// "" when the text is empty, otherwise the prefix followed by the text.
func mciSuffix(_ text: String, _ prefix: String) -> String { text.isEmpty ? "" : "\(prefix)\(text)" }
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
        let approx: String = ageApprox ? "~" : ""
        let unit: String = ageUnit == .years ? "y" : "mo"
        return "\(approx)\(a) \(unit)"
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
    /// Boxes and labelled blanks printed on each card (Sumter_EMS_Scene_Sketch_Cards.pdf), in card order.
    /// Entries marked "added" are not printed on that card; they keep the incident identity with the sketch.
    var fields: [(key: String, label: String)] {
        switch self {
        case .roadway:
            let f: [(key: String, label: String)] = [
                ("incidentNumber", "Incident #"), ("dateTime", "Date / Time"),
                ("location", "Location / Address"), ("sketchedBy", "Sketched By"),
                ("mainRoad", "Main Rd / Hwy"), ("crossStreet", "Cross St"),
                ("directionOfTravel", "Direction of travel"),
                ("lanesBlocked", "Lanes blocked (card note)"), ("accessEgress", "Access / egress (card note)"),
            ]
            return f
        case .structure:
            let f: [(key: String, label: String)] = [
                ("incidentNumber", "Incident #"), ("dateTime", "Date / Time"),
                ("location", "Location / Address"), ("sketchedBy", "Sketched By"),
                ("sideAFaces", "Side A faces (confirm address side)"),
                ("roofDiv", "Roof · Div"), ("floor2Div", "2nd Flr · Div"), ("floor1Div", "1st Flr · Div"),
                ("exposureB", "Exposure B"), ("exposureD", "Exposure D"),
            ]
            return f
        case .facility:
            let f: [(key: String, label: String)] = [
                ("facility", "Facility"), ("residents", "Residents #"), ("staff", "Staff #"),
                ("ambulatory", "Ambulatory"), ("nonAmbulatory", "Non-Amb"), ("bariatric", "Bariatric"),
                ("wingLeft", "Wing / Hall (left)"), ("wingRight", "Wing / Hall (right)"),
                ("muster1", "M1 Muster"), ("muster2", "M2 Muster"),
                ("roomsCleared", "Rooms cleared (card note)"), ("evacRoutes", "Evacuation routes (card note)"),
                ("incidentNumber", "Incident # (added)"), ("dateTime", "Date / Time (added)"),
                ("location", "Location / Address (added)"), ("sketchedBy", "Sketched By (added)"),
            ]
            return f
        }
    }

    /// The card's own footer instruction, shown with the sketch.
    var cardNote: String {
        switch self {
        case .roadway: return "Mark vehicles, patients, apparatus, hazards, LZ · note lanes blocked and access / egress"
        case .structure: return "Side A is the address / front; B, C, D run clockwise · interior floors are divisions"
        case .facility: return "Mark rooms cleared, patient counts by triage color, muster points, and evacuation routes"
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
    static let incidentTypes: [String] = ["MCI", "MVC", "HazMat", "Fire", "Threat", "Other"]
    static let levels: [String] = ["1", "2", "3", "4", "5"]
    static let checklist: [String] = [
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
    static let roles: [String] = [
        "Incident Commander", "Safety Officer", "Public Information Officer", "Liaison Officer",
        "Operations Section Chief", "Medical Branch Director", "Triage Group Supervisor",
        "Treatment Group Supervisor", "Transport Group Supervisor", "Staging Area Manager",
        "Medical Communications Coordinator",
    ]
    static let hospitals: [String] = [
        "Prisma Health Tuomey, Sumter", "McLeod Regional, Florence", "MUSC Health, Florence",
        "Prisma Health Richland, Columbia", "McLeod Health Clarendon, Manning", "MUSC Health Kershaw, Camden",
    ]
    static let ground: [String] = [
        "Lee County EMS", "Kershaw County EMS", "Clarendon Fire / Rescue", "Timmonsville Rescue",
        "Florence County EMS", "Richland County EMS", "Guardian Ambulance", "Prisma Health Ambulance",
    ]
    static let air: [String] = ["Meducare 2", "AirReach", "LifeNet 2"]
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
        let prefix: String = training ? "TRN-" : ""
        let number = "\(prefix)MCI-\(stamp)"
        let checklist: [MCIChecklistItem] = settings.checklist.map { text -> MCIChecklistItem in
            MCIChecklistItem(id: UUID(), text: text, state: .pending, completedAt: nil, initials: "", notes: "")
        }
        let hospitals: [MCIHospital] = settings.hospitals.filter { $0.active }.map { entry -> MCIHospital in
            MCIHospital(id: UUID(), directoryID: entry.id, name: entry.name, capabilityNotes: "")
        }
        return MCIIncident(
            id: UUID(), localNumber: number, name: "", occurrenceAt: nil, createdAt: now,
            location: "", types: [], otherType: "", level: "Unknown", commandEstablishedAt: nil,
            timeZoneID: tz.identifier, isTraining: training, state: .open, closedAt: nil,
            commandChannel: "", tacticalChannel: "", medicalChannel: "", airAidChannel: "", commandPost: "",
            accessEgress: "", hazards: "", commandNotes: "",
            checklistTemplateVersion: settings.checklistVersion,
            checklist: checklist,
            roleNames: settings.roles, roles: [], snapshots: [], patients: [], departures: [],
            hospitals: hospitals,
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
        let names: [String: String] = ["patientAdded": "Patient added", "patientAddedRetrospective": "Patient added (already departed)",
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
                if !a.agencyChannel.mciTrimmed.isEmpty { who = "\(who) (\(a.agencyChannel))" }
            }
            lines.append("  \(r): \(who)")
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
        let groups: [[UUID]] = [i.patients.map(\.id), i.departures.map(\.id), i.hospitals.map(\.id), i.polls.map(\.id),
                                i.aid.map(\.id), i.air.map(\.id), i.resources.map(\.id), i.sketches.map(\.id),
                                i.snapshots.map(\.id), i.checklist.map(\.id), i.roles.map(\.id), i.events.map(\.id),
                                i.inks.map(\.id)]
        for g in groups { all.append(contentsOf: g) }
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
                    Text("\(incident.recordLabel(e.recordID)) · recorded \(MCIFmt.full(e.recordedAt, tz: incident.timeZone))\(mciSuffix(e.initials, " · "))")
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
                    if let shield = MCIShield.image {
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
                row(MCIRegister.label(k), String(r.all[k] ?? 0), String(r.onScene[k] ?? 0), String(r.departed[k] ?? 0), String(r.unknownLocation[k] ?? 0))
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
        let typeOptions: [MCIIDString] = MCISeeds.incidentTypes.map { MCIIDString($0) }
        let typeTitle: (MCIIDString) -> String = { t in inc.types.contains(t.id) ? "✓ \(t.id)" : t.id }
        var levelNames: [String] = ["Unknown"]
        levelNames.append(contentsOf: store.data.settings.levels)
        let levelOptions: [MCIIDString] = levelNames.map { MCIIDString($0) }
        let levelSelected: MCIIDString? = MCIIDString(inc.level)
        return VStack(alignment: .leading, spacing: 16) {
            MCISectionBox(title: "Incident") {
                MCIField(label: "Incident Name", text: store.text(id, \.name), readOnly: ro)
                MCITimeRow(label: "Date/Time (occurrence / start)", value: inc.occurrenceAt, tz: inc.timeZone, ref: inc.refDate,
                           readOnly: ro) { v, reason in setTime(\.occurrenceAt, "Occurrence", v, reason) }
                Text("Created on this iPad \(MCIFmt.full(inc.createdAt, tz: inc.timeZone)). Occurrence time is kept separately and is never filled in automatically.")
                    .font(.footnote).foregroundStyle(.secondary)
                MCILongText(label: "Location / Address", text: store.text(id, \.location), minHeight: 80, readOnly: ro)
                Group {
                Text("Incident Type (select all that apply)").font(.headline)
                MCIOptionGrid(options: typeOptions, selected: nil, title: typeTitle, disabled: ro) { t in
                    store.update(id) { i in
                        if let k = i.types.firstIndex(of: t.id) { i.types.remove(at: k) } else { i.types.append(t.id) }
                    }
                }
                if inc.types.contains("Other") {
                    MCIField(label: "Other type", text: store.text(id, \.otherType), readOnly: ro)
                }
                Text("MCI Level").font(.headline)
                MCIOptionGrid(options: levelOptions, selected: levelSelected, title: { $0.id }, minWidth: 110, disabled: ro) { v in
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
                ForEach(MCIRoleTiers.tiers(for: inc.roleNames), id: \.title) { tier in
                    Text(tier.title.uppercased()).font(.mciHeading(.subheadline)).foregroundStyle(MCIStyle.brick).padding(.top, 6)
                    ForEach(tier.roles, id: \.self) { role in roleRow(inc, role) }
                }
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
        let tz = inc.timeZone
        let ref = inc.refDate
        let earlierParts: [String] = past.map { a -> String in
            let from: String = MCIFmt.clock(a.assignedAt, tz: tz, ref: ref)
            let to: String = MCIFmt.clock(a.relievedAt, tz: tz, ref: ref)
            return "\(a.person.mciDash) (\(from)–\(to))"
        }
        let earlierText: String = earlierParts.joined(separator: "; ")
        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(role).font(.headline)
                    if let cur {
                        Text("\(cur.person.mciNR)\(mciSuffix(cur.agencyChannel, " · "))").font(.title3)
                        Text("Assigned \(MCIFmt.clock(cur.assignedAt, tz: inc.timeZone, ref: inc.refDate))\(mciSuffix(cur.reportsTo, " · reports to "))")
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
                Text("Earlier: \(earlierText)")
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
                        Text("Completed \(MCIFmt.clock(at, tz: inc.timeZone, ref: inc.refDate))\(mciSuffix(item.initials, " · "))")
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
                        Text("Source \(s.reporter.mciNR) · recorded \(MCIFmt.full(s.recordedAt, tz: inc.timeZone))\(mciSuffix(s.notes, " · "))")
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
            MCISourceReferenceView()
            Text("Agency-supplied reference PDFs (Settings → Approved references):").font(.headline)
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
        var agencyNames: [String] = store.data.settings.groundAgencies
        agencyNames.append("Other agency")
        let agencyOptions: [MCIIDString] = agencyNames.map { MCIIDString($0) }
        var airNames: [String] = store.data.settings.airServices
        airNames.append("Other service")
        let airOptions: [MCIIDString] = airNames.map { MCIIDString($0) }
        return VStack(alignment: .leading, spacing: 16) {
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
                    MCIOptionGrid(options: agencyOptions, selected: nil, title: { $0.id }, minWidth: 180) { a in
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
                    MCIOptionGrid(options: airOptions, selected: nil, title: { "Request \($0.id)" }, minWidth: 180) { a in
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
        let sentParts: [String] = sent.sorted { $0.key < $1.key }.map { pair -> String in
            let abbr: String = TriageCategory(rawValue: pair.key)?.abbr ?? "UNK"
            return "\(abbr) \(pair.value)"
        }
        let sentText: String = sentParts.isEmpty ? "none" : sentParts.joined(separator: " · ")
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
            Text("PATIENTS SENT (valid departures, by category at departure): \(sentText)")
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
            let destination: String = inc.hospital(d?.hospitalID)?.name ?? ""
            let unit: String = inc.resource(d?.resourceID)?.identifier ?? ""
            let unitText: String = d?.unitText ?? ""
            let parts: [String] = [p.number, p.tag, p.complaint, destination, unit, unitText]
            let hay: String = parts.joined(separator: " ").lowercased()
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

/// Labels for destination and unit choices, kept out of view code so it type-checks quickly.
enum MCIDestinationName {
    static func options(_ inc: MCIIncident) -> [MCIIDString] {
        var out: [MCIIDString] = inc.hospitals.map { MCIIDString($0.id.uuidString) }
        out.append(MCIIDString("unknown"))
        return out
    }

    static func of(_ id: String, in inc: MCIIncident) -> String {
        if let h = inc.hospitals.first(where: { $0.id.uuidString == id }) { return h.name }
        return "Unknown destination"
    }

    static func unitOptions(_ inc: MCIIncident) -> [MCIIDString] {
        var out: [MCIIDString] = inc.resources.map { MCIIDString($0.id.uuidString) }
        out.append(MCIIDString("typed"))
        out.append(MCIIDString("unknown"))
        return out
    }

    static func unit(_ id: String, in inc: MCIIncident) -> String {
        if let r = inc.resources.first(where: { $0.id.uuidString == id }) { return r.identifier.mciDash }
        return id == "typed" ? "Other / type below" : "Unknown unit"
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
        var units: [MCIUnitChoice] = []
        for r in inc.resources where r.status != .released {
            units.append(MCIUnitChoice(id: r.id.uuidString, resourceID: r.id, label: "\(r.identifier.mciDash) (\(r.status.label))"))
        }
        units.append(MCIUnitChoice(id: "typed", resourceID: nil, label: "Other / type below"))
        units.append(MCIUnitChoice(id: "unknown", resourceID: nil, label: "Unknown unit"))
        let poll = hospitalID.flatMap { inc.latestPoll($0) }
        let destOptions: [MCIIDString] = MCIDestinationName.options(inc)
        let destSelected: MCIIDString? = destinationChosen ? MCIIDString(hospitalID?.uuidString ?? "unknown") : nil
        let destTitle: (MCIIDString) -> String = { o in MCIDestinationName.of(o.id, in: inc) }
        return VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("PATIENT \(p.number) · TAG \(p.tag.mciDash)").font(.mciHeading(.title2))
                MCICategoryBadge(category: p.category)
            }
            Text("Destination").font(.headline)
            MCIOptionGrid(options: destOptions, selected: destSelected, title: destTitle, minWidth: 200) { o in
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
            MCIOptionGrid(options: MCIDestinationName.options(inc), selected: hospitalChoice,
                          title: { o in MCIDestinationName.of(o.id, in: inc) }, minWidth: 200) { hospitalChoice = $0 }
        case .unit:
            MCIOptionGrid(options: MCIDestinationName.unitOptions(inc), selected: unitChoice,
                          title: { o in MCIDestinationName.unit(o.id, in: inc) }, minWidth: 200) { unitChoice = $0 }
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
                                let numbers: [String] = transports.compactMap { inc.patient($0.patientID)?.number }
                                Text("Transports: \(numbers.joined(separator: ", "))").font(.callout)
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
                    MCIOptionGrid(options: MCISketchTemplate.allCases, selected: nil, title: { "Add \($0.title)" }, minWidth: 220) { t in
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
                        Text("Card: \(s.template.cardNote)").font(.callout)
                        Text("Facility descriptors (ambulatory, non-ambulatory, bariatric) can overlap; they are not added up. Orientation labels are entered by hand and do not imply a verified compass direction. Typed values here never change patient counts or locations.")
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

enum MCIPaper: String, CaseIterable, Identifiable {
    case tabloid, letter
    var id: String { rawValue }
    var label: String { self == .tabloid ? "11 × 17 (matches the board)" : "Letter 8.5 × 11" }
    var rect: CGRect { self == .tabloid ? CGRect(x: 0, y: 0, width: 1224, height: 792) : CGRect(x: 0, y: 0, width: 792, height: 612) }
}

enum MCIPacketPDF {
    static func make(_ i: MCIIncident, store: MCIStore?, generatedAt: Date, paper: MCIPaper = .tabloid) -> Data {
        let bgs = backgrounds(store)
        let first = render(i, backgrounds: bgs, generatedAt: generatedAt, totalPages: 0, paper: paper)
        return render(i, backgrounds: bgs, generatedAt: generatedAt, totalPages: first.pages, paper: paper).data
    }

    static func backgrounds(_ store: MCIStore?) -> [MCISketchTemplate: UIImage] {
        var out: [MCISketchTemplate: UIImage] = [:]
        guard let store else { return out }
        for t in MCISketchTemplate.allCases { if let img = MCISketchBackground.image(store, t, width: 2400) { out[t] = img } }
        return out
    }

    static func render(_ i: MCIIncident, backgrounds: [MCISketchTemplate: UIImage], generatedAt: Date, totalPages: Int,
                       paper: MCIPaper) -> (data: Data, pages: Int) {
        let format = UIGraphicsPDFRendererFormat()
        format.documentInfo = [kCGPDFContextTitle as String: "Incident Packet — \(i.displayName)",
                               kCGPDFContextCreator as String: "Sumter EMS Command — MCI Board"]
        let renderer = UIGraphicsPDFRenderer(bounds: paper.rect, format: format)
        var pages = 0
        let data = renderer.pdfData { ctx in
            let c = MCIPDFComposer(ctx: ctx, incident: i, backgrounds: backgrounds, generatedAt: generatedAt, totalPages: totalPages,
                                   pageRect: paper.rect)
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
    let pageRect: CGRect
    let margin: CGFloat = 30
    var y: CGFloat = 0
    var pageNumber = 0
    var part = ""
    var partTitle = ""
    var partFooter = ""
    let shield = MCIShield.image
    var continuedHeader: (() -> Void)?
    var continuations: [(title: String, text: String)] = []
    var continuationKeys = Set<String>()

    let bodyFont = UIFont.systemFont(ofSize: 10)
    let boldFont = UIFont.systemFont(ofSize: 10, weight: .semibold)
    let headFont = UIFont.systemFont(ofSize: 10, weight: .bold, width: .condensed)
    let barFont = UIFont.systemFont(ofSize: 14, weight: .bold, width: .condensed)
    let smallFont = UIFont.systemFont(ofSize: 8)

    init(ctx: UIGraphicsPDFRendererContext, incident: MCIIncident, backgrounds: [MCISketchTemplate: UIImage], generatedAt: Date, totalPages: Int,
         pageRect: CGRect) {
        self.pageRect = pageRect
        self.ctx = ctx
        self.inc = incident
        self.backgrounds = backgrounds
        self.generatedAt = generatedAt
        self.totalPages = totalPages
    }

    var tz: TimeZone { inc.timeZone }
    var contentTop: CGFloat { margin + 64 }
    var bottom: CGFloat { pageRect.height - margin - 26 }
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
        // Header in the source board's style: shield, small red agency line, large navy title, red rule.
        var textX = margin
        if let shield {
            let h: CGFloat = 40
            let w = h * shield.size.width / max(shield.size.height, 1)
            shield.draw(in: CGRect(x: margin, y: margin - 14, width: w, height: h))
            textX = margin + w + 8
        }
        let kicker = UIFont.systemFont(ofSize: 10, weight: .heavy, width: .expanded)
        let title = UIFont.systemFont(ofSize: 22, weight: .heavy, width: .condensed)
        drawText("SUMTER COUNTY EMS", kicker, MCIStyle.uiBrick, CGRect(x: textX, y: margin - 12, width: contentWidth, height: 13))
        drawText(partTitle, title, MCIStyle.uiNavy, CGRect(x: textX, y: margin - 1, width: contentWidth * 0.6, height: 28))
        let trainingLine: String = inc.isTraining ? "TRAINING — FICTITIOUS\n" : ""
        let started: String = MCIFmt.full(inc.createdAt, tz: tz)
        let rightLines = "\(trainingLine)\(inc.displayName)\nStarted \(started)"
        drawText(String(rightLines.prefix(200)), boldFont, MCIStyle.uiNavy,
                 CGRect(x: margin + contentWidth * 0.55, y: margin - 12, width: contentWidth * 0.45, height: 40), align: .right)
        MCIStyle.uiBrick.setFill()
        UIRectFill(CGRect(x: margin, y: margin + 31, width: contentWidth, height: 2))
        let recordKind: String = inc.isTraining ? "Training record" : "Operational record"
        let loc = "Location: \(inc.location.mciDash) · MCI Level \(inc.level) · \(recordKind)"
        drawText(String(loc.prefix(220)), smallFont, .darkGray, CGRect(x: margin, y: margin + 37, width: contentWidth, height: 12))
        // Footer: the source's footer note on the left, page number on the right.
        let footY = pageRect.height - margin - 16
        drawText(partFooter, UIFont.systemFont(ofSize: 8, weight: .bold, width: .condensed), .darkGray,
                 CGRect(x: margin, y: footY, width: contentWidth * 0.6, height: 12))
        let footFont = UIFont.systemFont(ofSize: 8, weight: .bold, width: .condensed)
        let ofTotal: String = totalPages > 0 ? " OF \(totalPages)" : ""
        let pageLabel = "PAGE \(pageNumber)\(ofTotal) · \(part.uppercased())"
        let pageRectRight = CGRect(x: margin + contentWidth * 0.6, y: footY, width: contentWidth * 0.4, height: 12)
        drawText(pageLabel, footFont, .darkGray, pageRectRight, align: .right)
        let trainingPrefix: String = inc.isTraining ? "TRAINING — FICTITIOUS DATA · " : ""
        let generated: String = MCIFmt.full(generatedAt, tz: tz)
        let gen = "\(trainingPrefix)Generated \(generated) · Times in \(inc.timeZoneID), 24-hour · — = not recorded · Coordination record, not an ePCR"
        drawText(gen, smallFont, .gray, CGRect(x: margin, y: footY + 11, width: contentWidth, height: 11))
        y = contentTop
        continuedHeader?()
    }

    func startPart(_ name: String, title: String? = nil, footer: String = "SUMTER COUNTY EMS : MCI INCIDENT PACKET") {
        part = name
        partTitle = title ?? "MCI \(name.uppercased())"
        partFooter = footer
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
        startPart("Command", title: "EMS MCI COMMAND BOARD", footer: "SUMTER COUNTY EMS : EMS MCI COMMAND BOARD")
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
              inc.checklist.map { c -> [String] in [c.text, c.state.label, clock(c.completedAt), c.initials.mciDash, cell(c.notes, "Checklist note: \(c.text)")] })
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
        startPart("Triage", title: "MCI TRIAGE & HOW TO TRIAGE", footer: "COLORS ARE START / SALT STANDARD · EXPECTANT (GRAY) IS SALT")
        note("Two separate count sources. A: Reported Scene Count — manual snapshots of patients reportedly still on scene. B: Patient Register — derived from individual tracked records. They are never added together. Unknown is not zero.")
        let snaps = inc.snapshots.sorted { $0.recordedAt < $1.recordedAt }
        table("A · Reported Scene Count — Running Count", [("Observed", 0.1), ("R", 0.07), ("Y", 0.07), ("G", 0.07), ("EXP", 0.07), ("DEC", 0.07),
                                                           ("Total", 0.17), ("Source", 0.12), ("Recorded", 0.1), ("Notes", 0.16)],
              snaps.map { s -> [String] in
                  var row: [String] = [clock(s.observedAt)]
                  for c in TriageCategory.allCases { row.append(n(s.value(c))) }
                  let total: String = s.correctsID == nil ? s.totalText : "\(s.totalText) (correction)"
                  row.append(total)
                  row.append(s.reporter.mciDash)
                  row.append(clock(s.recordedAt))
                  row.append(cell(s.notes, "Snapshot note \(clock(s.recordedAt))"))
                  return row
              })
        let r = inc.register()
        var regRows: [[String]] = MCIRegister.keys.map { k -> [String] in
            [MCIRegister.label(k), String(r.all[k] ?? 0), String(r.onScene[k] ?? 0), String(r.departed[k] ?? 0), String(r.unknownLocation[k] ?? 0)]
        }
        regRows.append(["Total", String(r.allTotal), String(r.onSceneTotal), String(r.departedTotal), String(r.unknownTotal)])
        table("B · Patient Register — as of \(MCIFmt.full(generatedAt, tz: tz))", [("Category", 0.3), ("Tracked", 0.175), ("On scene", 0.175), ("Departed", 0.175), ("Location unknown", 0.175)],
              regRows)
        note("Entered-in-error records are excluded from B. Triage categories in this record were selected manually.")
        sectionBar("How to Triage · source reference (not entered data) — REFERENCE ONLY, verify against agency protocol")
        for sys in MCISourceReference.systems {
            if y + 40 > bottom { newPage() }
            drawText("\(sys.title) · \(sys.subtitle)", boldFont, MCIStyle.uiNavy, CGRect(x: margin, y: y, width: contentWidth, height: 14))
            y += 16
            flowing(([sys.lead] + sys.steps).joined(separator: "\n"), title: sys.title)
        }
        note(MCISourceReference.sourceLine)
    }

    func hospitalsPart() {
        startPart("Hospitals & Mutual Aid", title: "MCI HOSPITALS & MUTUAL AID", footer: "POLL BEDS EARLY AND RE-POLL; BALANCE LOAD ACROSS FACILITIES")
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
              inc.hospitals.filter { !$0.capabilityNotes.isEmpty }.map { h -> [String] in [h.name, cell(h.capabilityNotes, "\(h.name) capability")] })
        table("Mutual Aid — Ground", [("Agency", 0.16), ("Status", 0.1), ("Contacted", 0.09), ("Units sent", 0.15), ("ETA (estimate)", 0.12),
                                      ("Assignment", 0.16), ("Notes", 0.22)],
              inc.aid.sorted { $0.createdAt < $1.createdAt }.map { a -> [String] in
                  let etaClock: String = clock(a.eta)
                  let eta: String = a.etaSource.isEmpty ? etaClock : "\(etaClock) (\(a.etaSource))"
                  return [a.agency, a.status.label, clock(a.contactedAt), cell(a.unitsSent, "\(a.agency) units"), eta,
                          cell(a.assignment, "\(a.agency) assignment"), cell(a.notes, "\(a.agency) notes")]
              })
        table("Air Medical", [("Service", 0.13), ("Status", 0.1), ("Requested", 0.09), ("LZ / Frequency", 0.16), ("ETA", 0.08),
                              ("Patients", 0.12), ("Destination", 0.14), ("Notes", 0.18)],
              inc.air.sorted { $0.createdAt < $1.createdAt }.map { a -> [String] in
                  let pts: String = a.patientIDs.compactMap { inc.patient($0)?.number }.joined(separator: ", ").mciDash
                  return [a.service, a.status.label, clock(a.requestedAt), cell(a.lzFrequency, "\(a.service) LZ"), clock(a.eta),
                          pts, cell(a.destination, "\(a.service) destination"), cell(a.notes, "\(a.service) notes")]
              })
    }

    func transportPart() {
        startPart("Transport & Staging", title: "MCI TRANSPORT & STAGING", footer: "CATEGORY: R IMMEDIATE · Y DELAYED · G MINOR · EXP EXPECTANT · DEC DECEASED · UNK NOT CLASSIFIED")
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
            let ageSex = "\(p.ageText) / \(p.sex.label)"
            let complaint = cell(p.complaint, "\(p.number) complaint")
            let notes = cell(p.notes, "\(p.number) notes")
            let row: [String] = [p.number, p.tag.mciDash, mciCategoryShort(p.category), catOut, ageSex,
                                 complaint, unit, dest, out, loc, notes]
            rows.append(row)
        }
        table("Transport Log", [("Pt #", 0.06), ("Tag", 0.07), ("Current cat.", 0.09), ("Cat. at departure", 0.09), ("Age / Sex", 0.08),
                                ("Chief Complaint / Injury", 0.15), ("Transport Unit", 0.09), ("Destination", 0.12), ("Time Out", 0.07),
                                ("Location", 0.08), ("Notes", 0.10)], rows, empty: "No patients.")
        let voided = inc.departures.filter(\.voided)
        table("Voided Departures (kept for history, excluded from counts)", [("Patient", 0.12), ("Destination", 0.25), ("Time Out", 0.12), ("Voided", 0.12), ("Reason", 0.39)],
              voided.map { d -> [String] in [inc.patient(d.patientID)?.number ?? "?", inc.hospital(d.hospitalID)?.name ?? "Unknown", clock(d.departedAt), clock(d.voidedAt), cell(d.voidReason, "Void reason \(d.id.uuidString.prefix(6))")] },
              empty: "None.")
        table("Entered in Error (excluded from counts)", [("Patient", 0.15), ("Tag", 0.15), ("Reason", 0.7)],
              inc.patients.filter(\.enteredInError).map { p -> [String] in [p.number, p.tag.mciDash, cell(p.errorReason, "\(p.number) error reason")] }, empty: "None.")
        table("Staging", [("Unit / Resource", 0.14), ("Type", 0.09), ("Agency", 0.11), ("Time In", 0.08), ("Assignment", 0.15),
                          ("Status / Released", 0.15), ("Contact", 0.1), ("Notes", 0.18)],
              inc.resources.sorted { $0.createdAt < $1.createdAt }.map { r -> [String] in
                  let releasedClock: String = clock(r.releasedAt)
                  let status: String = r.releasedAt == nil ? r.status.label : "\(r.status.label) \(releasedClock)"
                  return [r.identifier.mciDash, r.type.mciDash, r.agency.mciDash, clock(r.timeIn), cell(r.assignment, "\(r.identifier) assignment"),
                          status, r.contact.mciDash, cell(r.notes, "\(r.identifier) notes")]
              })
        note("Available in staging (derived from recorded statuses): \(inc.availableResourceCount).")
    }

    func sketchPart() {
        guard !inc.sketches.isEmpty else { return }
        for s in inc.sketches {
            startPart("Scene Sketch", title: "MCI SCENE SKETCH")
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
            var cardRect: CGRect? = nil
            if let bg = backgrounds[s.template] {
                let r = MCISketchBackground.fit(bg.size, in: rect)
                bg.draw(in: r)
                cardRect = r
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
            if let cardRect { drawCardValues(s, on: cardRect) }
            UIColor.gray.setStroke()
            UIBezierPath(rect: rect).stroke()
            y = rect.maxY + 6
        }
    }

    /// Writes typed card values into the card's own header boxes, and the rest into a labelled
    /// companion block in the card's blank lower area. Positions are the card PDF's (792 × 612 pt).
    func drawCardValues(_ s: MCISketch, on r: CGRect) {
        let sx = r.width / 792
        let sy = r.height / 612
        let boxX: [CGFloat] = [30.7, 216.1, 401.6, 587.1]
        let keys: [String] = s.template == .facility
            ? ["facility", "residents", "staff", "descriptors"]
            : ["incidentNumber", "dateTime", "location", "sketchedBy"]
        let headerFont = UIFont.systemFont(ofSize: max(6, 8 * sy), weight: .semibold)
        for (i, k) in keys.enumerated() {
            let value: String = k == "descriptors" ? facilityDescriptors(s) : (s.fields[k] ?? "").mciTrimmed
            if value.isEmpty { continue }
            let box = CGRect(x: r.minX + boxX[i] * sx, y: r.minY + 76 * sy, width: 178 * sx, height: 11 * sy)
            drawText(value, headerFont, MCIStyle.uiNavy, box)
        }
        var lines: [String] = []
        for f in s.template.fields {
            let v = (s.fields[f.key] ?? "").mciTrimmed
            if !v.isEmpty { lines.append("\(f.label): \(v)") }
        }
        if !s.triageSnapshot.isEmpty { lines.append("Triage snapshot (copied, not live): \(s.triageSnapshot)") }
        if lines.isEmpty { return }
        let top: CGFloat = s.template == .facility ? 480 : 462
        let block = CGRect(x: r.minX + 24 * sx, y: r.minY + top * sy, width: 744 * sx, height: (604 - top) * sy)
        let labelFont = UIFont.systemFont(ofSize: max(6, 7 * sy), weight: .bold)
        let bodyFontSmall = UIFont.systemFont(ofSize: max(6, 7 * sy))
        drawText("ENTERED IN THE APP — companion to this card (typed values; ink is never read)", labelFont, MCIStyle.uiBrick,
                 CGRect(x: block.minX, y: block.minY, width: block.width, height: 10 * sy))
        let body = lines.joined(separator: "   ·   ")
        drawText(body, bodyFontSmall, .black, CGRect(x: block.minX, y: block.minY + 11 * sy, width: block.width, height: block.height - 11 * sy))
    }

    func facilityDescriptors(_ s: MCISketch) -> String {
        var parts: [String] = []
        let a = (s.fields["ambulatory"] ?? "").mciTrimmed
        let n = (s.fields["nonAmbulatory"] ?? "").mciTrimmed
        let b = (s.fields["bariatric"] ?? "").mciTrimmed
        if !a.isEmpty { parts.append("Amb \(a)") }
        if !n.isEmpty { parts.append("Non-amb \(n)") }
        if !b.isEmpty { parts.append("Bariatric \(b)") }
        return parts.joined(separator: " / ")
    }

    func activityPart() {
        startPart("Activity", title: "MCI ACTIVITY LOG")
        table("Activity Log", [("Recorded", 0.15), ("Effective", 0.15), ("Record", 0.16), ("Change", 0.46), ("Initials", 0.08)],
              inc.events.sorted { $0.recordedAt < $1.recordedAt }.map { e -> [String] in
                  [MCIFmt.full(e.recordedAt, tz: tz), MCIFmt.full(e.effectiveAt, tz: tz), inc.recordLabel(e.recordID),
                   cell(inc.describe(e), "Activity \(e.id.uuidString.prefix(8))"), e.initials.mciDash]
              }, empty: "No activity.")
    }

    func continuationPart() {
        guard !continuations.isEmpty else { return }
        startPart("Continued Text", title: "MCI CONTINUED TEXT")
        for item in continuations {
            if y + 40 > bottom { newPage() }
            drawText(item.title, boldFont, MCIStyle.uiNavy, CGRect(x: margin, y: y, width: contentWidth, height: 14))
            y += 16
            flowing(item.text, title: item.title)
        }
    }

    func inkTitle(_ k: MCIInk) -> String {
        let names: [String: String] = ["commandNotes": "Command Notes", "patientNotes": "Notes"]
        return "\(inc.recordLabel(k.recordID)) — \(names[k.fieldID] ?? k.fieldID)"
    }

    func inkPart() {
        let sketchIDs = Set(inc.sketches.map(\.id))
        for k in inc.inks.filter({ !sketchIDs.contains($0.recordID) }).sorted(by: { inkTitle($0) < inkTitle($1) }) {
            let title = inkTitle(k)
            let drawing: PKDrawing
            do { drawing = try PKDrawing(data: k.drawing) } catch {
                startPart("Handwriting", title: "MCI HANDWRITTEN NOTES")
                note("\(title): this handwriting attachment could not be read. It is preserved unchanged in backups.")
                continue
            }
            if drawing.strokes.isEmpty { continue }
            let w = CGFloat(k.width), ph = CGFloat(k.pageHeight)
            let pages = max(k.pageCount, Int(ceil(drawing.bounds.maxY / ph)))
            for p in 0..<pages {
                startPart("Handwriting", title: "MCI HANDWRITTEN NOTES")
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
    @State private var paper: MCIPaper = .tabloid

    var baseName: String {
        "Sumter-\(snapshot.isTraining ? "TRAINING-" : "")\(snapshot.localNumber)-\(MCIFmt.fileStamp(Date(), tz: snapshot.timeZone))"
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                Text("The Incident Packet contains operational information. Share or store it only as agency policy allows. Nothing is sent anywhere unless you choose Share.")
                    .font(.footnote).foregroundStyle(.secondary)
                Picker("Paper", selection: $paper) {
                    ForEach(MCIPaper.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
                .onChange(of: paper) { _ in pdfURL = nil }
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
        let data = MCIPacketPDF.make(snapshot, store: store, generatedAt: Date(), paper: paper)
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
        func check(_ name: String, _ conditions: Bool..., detail: String = "") {
            let ok = conditions.allSatisfy { $0 }
            out.append(MCICheckResult(name: name, passed: ok, detail: ok ? "" : detail))
        }
        let base = Date(timeIntervalSince1970: 1_793_700_000)
        func at(_ m: Double) -> Date { base.addingTimeInterval(m * 60) }
        let settings = MCISettings()

        var inc = MCIIncident.new(now: base, settings: settings, training: true)
        check("New incident works immediately with a local ID and no details", !inc.localNumber.isEmpty, inc.name.isEmpty, inc.occurrenceAt == nil, inc.level == "Unknown")
        check("Checklist, roles and hospitals are seeded from the source", inc.checklist.count == 12, inc.roleNames.count == 11, inc.hospitals.count == 6, inc.checklist.allSatisfy { $0.state == .pending }, inc.roles.isEmpty)

        // Reported count vs register
        var twelve: [TriageCategory: Int?] = [:]
        twelve[.immediate] = .some(3); twelve[.delayed] = .some(4); twelve[.minor] = .some(5)
        twelve[.expectant] = .some(0); twelve[.deceased] = .some(0)
        let snapID = UUID()
        inc.recordSnapshot(id: snapID, values: twelve, observedAt: at(1), reporter: "Triage", notes: "", correcting: nil, now: at(1), initials: "")
        let again = inc.recordSnapshot(id: snapID, values: twelve, observedAt: at(1), reporter: "Triage", notes: "", correcting: nil, now: at(1), initials: "")
        check("Double Save of a snapshot records it once", !again, inc.snapshots.count == 1)
        var ids: [UUID] = []
        for k in 0..<5 { ids.append(inc.addPatient(now: at(2 + Double(k)), initials: "")) }
        let reg = inc.register()
        check("Reported 12 and register 5 stay separate (never 17)", reg.allTotal == 5, reg.onSceneTotal == 5, inc.latestSnapshot?.knownSubtotal == 12, detail: "register \(reg.allTotal), snapshot \(inc.latestSnapshot?.knownSubtotal ?? -1)")
        check("New patients are Not classified, never Minor by default", reg.all[MCIUnclassified.key] == 5, reg.all[TriageCategory.minor.rawValue] == nil)

        var partial: [TriageCategory: Int?] = [:]
        partial[.immediate] = .some(2); partial[.delayed] = .some(1); partial[.minor] = .some(0)
        partial[.expectant] = .some(nil); partial[.deceased] = .some(nil)
        inc.recordSnapshot(id: UUID(), values: partial, observedAt: at(8), reporter: "", notes: "", correcting: snapID, now: at(8), initials: "")
        let snap = inc.latestSnapshot
        check("Incomplete snapshot shows known subtotal and Incomplete; Unknown is not zero", snap?.isComplete == false, snap?.knownSubtotal == 3, snap?.value(.expectant) == nil, snap?.value(.minor) == 0, (snap?.totalText.contains("Incomplete") ?? false))
        check("Correction is a new snapshot linked to the earlier one", inc.snapshots.count == 2, snap?.correctsID == snapID, inc.snapshots.first { $0.id == snapID }?.knownSubtotal == 12)

        let cats: [TriageCategory] = [.immediate, .delayed, .minor, .expectant, .deceased]
        for (k, c) in cats.enumerated() { inc.setCategory(ids[k], c, reason: "", now: at(10), initials: "") }
        let reg2 = inc.register()
        check("Expectant and Deceased are counted separately", reg2.all[TriageCategory.expectant.rawValue] == 1, reg2.all[TriageCategory.deceased.rawValue] == 1)

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
        check("One departure: 4 on scene, 1 departed, 1 sent to that hospital", r1 == .recorded, reg3.onSceneTotal == 4, reg3.departedTotal == 1, sent[h1]?[TriageCategory.immediate.rawValue] == 1, inc.sentTotal(to: h1) == 1)
        check("Double tap / retry cannot add a second departure", r2 == .alreadyRecorded, r3 == .patientAlreadyDeparted, inc.departures.count == 1, inc.register().departedTotal == 1)
        check("A departure never rewrites the reported snapshot", inc.snapshots.first { $0.id == snapID }?.knownSubtotal == 12)

        inc.setCategory(ids[0], .delayed, reason: "Re-triage", now: at(14), initials: "")
        check("Re-triage does not change category at departure", inc.departures[0].categoryAtDeparture == .immediate, inc.patientsSent()[h1]?[TriageCategory.immediate.rawValue] == 1)

        inc.correctDepartureHospital(dep, h2, reason: "Wrong facility tapped", now: at(15), initials: "")
        check("Correcting destination moves the count without adding a patient", inc.sentTotal(to: h1) == 0, inc.sentTotal(to: h2) == 1, inc.register().allTotal == 5, inc.register().departedTotal == 1)

        let voided = inc.voidDeparture(dep, reason: "Recorded on wrong patient", now: at(16), initials: "")
        check("Voiding reverses derived counts and keeps history", voided, inc.register().onSceneTotal == 5, inc.sentTotal(to: h2) == 0, inc.departures.count == 1, inc.events.contains { $0.action == "departureVoided" })

        let retro = inc.recordDeparture(id: UUID(), patientID: ids[1], hospitalID: nil, resourceID: nil, unitText: "",
                                        category: nil, departedAt: nil, retrospective: true, notes: "", now: at(17), initials: "")
        check("Urgent departure with unknowns is allowed and flagged; unknown destination kept separate", retro == .recorded, inc.validDeparture(for: ids[1])?.needsCompletion == true, inc.sentTotal(to: nil) == 1, !inc.reconciliationIssues.isEmpty)

        // Duplicate tags and entered in error
        if let a = inc.patientIndex(ids[2]), let b = inc.patientIndex(ids[3]) {
            inc.patients[a].tag = "A-12"
            inc.patients[b].tag = "a 12"
        }
        let dupList = inc.patient(ids[2]).map { inc.duplicateTags(of: $0) } ?? []
        check("Duplicate tags warn (normalised) without merging", dupList.map(\.id) == [ids[3]], inc.patients.count == 5)
        let blocked = inc.markEnteredInError(ids[1], reason: "Duplicate", now: at(18), initials: "")
        let noReason = inc.markEnteredInError(ids[3], reason: " ", now: at(18), initials: "")
        let marked = inc.markEnteredInError(ids[3], reason: "Duplicate of P-003", now: at(18), initials: "")
        check("Entered in Error needs a reason and is blocked by a valid departure", blocked == .blockedByDeparture, noReason == .needsReason, marked == .marked)
        check("Entered in Error is excluded from counts but kept", inc.register().allTotal == 4, inc.patients.count == 5, inc.duplicateTags(of: inc.patient(ids[2])!).isEmpty)
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
        check("Blank capacity is Unknown, explicit 0 is 0, and transports never change a poll", lp?.immediate == nil, lp?.delayed == 0, lp?.minor == 4, !dupPoll, inc.polls.count == 1)
        check("Poll with no time has unknown age", MCIFmt.age(of: nil, now: at(30)) == "age unknown")

        // Mutual aid → staging → transport
        let aidID = inc.addAid(agency: "Lee County EMS", now: at(22), initials: "")
        let res1 = inc.stageAidArrival(aidID, now: at(30), initials: "")
        let res2 = inc.stageAidArrival(aidID, now: at(31), initials: "")
        check("Aid arrival links one staging resource, never a copy", res1 != nil, res1 == res2, inc.resources.count == 1, inc.availableResourceCount == 1, inc.aid[0].status == .arrived, inc.resources[0].aidRequestID == aidID)
        let p6 = inc.addPatient(now: at(32), initials: "")
        _ = inc.recordDeparture(id: UUID(), patientID: p6, hospitalID: h2, resourceID: res1, unitText: "", category: .minor,
                                departedAt: at(33), retrospective: false, notes: "", now: at(33), initials: "")
        check("A resource used for transport is no longer counted available", inc.resources[0].status == .transporting, inc.availableResourceCount == 0)
        check("Duplicate resource identifiers are flagged", !inc.duplicateResources(identifier: "lee county ems", excluding: nil).isEmpty)
        _ = inc.addAid(agency: "Lee County EMS", now: at(34), initials: "")
        check("Repeat requests to one agency stay separate", inc.aid.count == 2)

        // Roles and checklist
        inc.assignRole("Incident Commander", person: "Unit A (fictitious)", agencyChannel: "", reportsTo: "", at: at(35), notes: "", now: at(35), initials: "")
        inc.assignRole("Incident Commander", person: "Unit B (fictitious)", agencyChannel: "", reportsTo: "", at: at(40), notes: "", now: at(40), initials: "")
        check("Reassignment relieves the previous holder and keeps history", inc.currentAssignment("Incident Commander")?.person == "Unit B (fictitious)", inc.roles.count == 2, inc.roles.first { $0.person == "Unit A (fictitious)" }?.relievedAt == at(40))
        let item = inc.checklist[0].id
        inc.setChecklist(item, .completed, at: at(41), now: at(41), initials: "")
        inc.setChecklist(item, .pending, at: at(42), now: at(42), initials: "")
        check("Reversing a checklist item keeps both changes in history", inc.checklist[0].completedAt == nil, inc.events.filter { $0.recordID == item }.count == 2)

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
        check("Sketch stores template, page and fixed canvas size", inc.sketches.first { $0.id == sk }.map { $0.template == .roadway && $0.canvasWidth == 1024 && $0.canvasHeight == 792 } ?? false)

        let structureKeys = Set(MCISketchTemplate.structure.fields.map { $0.key })
        let facilityKeys = Set(MCISketchTemplate.facility.fields.map { $0.key })
        let roadKeys = Set(MCISketchTemplate.roadway.fields.map { $0.key })
        check("Sketch fields match the three cards",
              roadKeys.isSuperset(of: ["incidentNumber", "dateTime", "location", "sketchedBy", "mainRoad", "crossStreet"]),
              structureKeys.isSuperset(of: ["sideAFaces", "roofDiv", "floor2Div", "floor1Div", "exposureB", "exposureD"]),
              facilityKeys.isSuperset(of: ["facility", "residents", "staff", "ambulatory", "nonAmbulatory", "bariatric",
                                          "wingLeft", "wingRight", "muster1", "muster2"]))

        // Overflow content for the packet
        let long = String(repeating: "Long complaint text for pagination checks. ", count: 24) + "MARKER-END"
        for k in 0..<20 {
            let id = inc.addPatient(now: at(50 + Double(k)), initials: "")
            if let i = inc.patientIndex(id) { inc.patients[i].complaint = k == 0 ? long : "Fictitious complaint \(k)" }
            _ = inc.recordDeparture(id: UUID(), patientID: id, hospitalID: inc.hospitals[k % 6].id, resourceID: nil, unitText: "T-\(k)",
                                    category: cats[k % 5], departedAt: at(60 + Double(k)), retrospective: false, notes: "", now: at(60 + Double(k)), initials: "")
        }
        if let i = inc.patients.indices.last { inc.patients[i].tag = "LAST-PATIENT-MARKER" }
        check("More than 20 patients and 14 departures are tracked", inc.activePatients.count >= 26, inc.departures.filter { !$0.voided }.count > 14)

        let pdf = MCIPacketPDF.make(inc, store: nil, generatedAt: at(120))
        if let doc = PDFDocument(data: pdf) {
            let text = doc.string ?? ""
            check("Incident Packet paginates", doc.pageCount >= 6, detail: "Pages: \(doc.pageCount)")
            check("Packet includes the end of a 1,000-character complaint", text.contains("MARKER-END"))
            check("Packet includes the last patient row", text.contains("LAST-PATIENT-MARKER"))
            check("Packet keeps reported count and register separate", text.contains("Reported Scene Count"), text.contains("Patient Register"), text.contains("AT DEPARTURE"))
            check("Packet pages are numbered with a total", text.contains("OF \(doc.pageCount)"))
            check("Packet carries the source triage reference, labelled as reference only", text.contains("JUMPSTART"), text.contains("REFERENCE ONLY"))
            check("Packet is 11 × 17 like the board", doc.page(at: 0).map { $0.bounds(for: .mediaBox).width == 1224 } ?? false)
        } else {
            check("Incident Packet opens", false, detail: "The generated PDF could not be read.")
        }

        // Backup round trip
        do {
            let data = try MCIBackupCodec.encode(inc, exportedAt: at(130))
            let b = try MCIBackupCodec.decode(data)
            let problems = MCIBackupCodec.validate(b.incident)
            let copy = MCIBackupCodec.restoredCopy(b, now: at(131), initials: "")
            check("Backup validates", problems.isEmpty, detail: problems.joined(separator: "; "))
            check("Restored copy is separate, read-only and has new IDs", copy.id != inc.id, copy.isClosed, Set(copy.patients.map(\.id)).isDisjoint(with: Set(inc.patients.map(\.id))))
            let sentA = inc.patientsSent().values.map { $0.values.reduce(0, +) }.reduce(0, +)
            let sentB = copy.patientsSent().values.map { $0.values.reduce(0, +) }.reduce(0, +)
            check("Restored copy keeps links, counts and ink", MCIBackupCodec.validate(copy).isEmpty, copy.register() == inc.register(), sentA == sentB, copy.inks.count == inc.inks.count, copy.resources[0].aidRequestID == copy.aid.first { $0.agency == "Lee County EMS" && $0.status == .arrived }?.id)
        } catch {
            check("Backup round trip", false, detail: "\(error)")
        }
        var rejected = false
        do { _ = try MCIBackupCodec.decode(Data("{\"not\": \"a backup\"}".utf8)) } catch { rejected = true }
        check("Unreadable backup is rejected without changes", rejected)

        // Closing
        inc.close(now: at(140), initials: "")
        let closedResult = inc.recordDeparture(id: UUID(), patientID: ids[2], hospitalID: h1, resourceID: nil, unitText: "", category: nil,
                                               departedAt: nil, retrospective: false, notes: "", now: at(141), initials: "")
        check("Closing keeps every patient and blocks new departures", inc.isClosed, closedResult == .closed, inc.patients.count == 26)
        return out
    }
}

// MARK: - Source board content (from Sumter_EMS_MCI_Command_Board_11x17.pdf)

/// The ICS chart on page 1, shown as tiers. These are the source board's layout, not a required hierarchy.
enum MCIRoleTiers {
    static let layout: [(title: String, roles: [String])] = [
        ("Command", ["Incident Commander"]),
        ("Command Staff", ["Safety Officer", "Public Information Officer", "Liaison Officer"]),
        ("Operations", ["Operations Section Chief"]),
        ("Medical Branch", ["Medical Branch Director"]),
        ("Groups / Units", ["Triage Group Supervisor", "Treatment Group Supervisor", "Transport Group Supervisor",
                            "Staging Area Manager", "Medical Communications Coordinator"]),
    ]

    static func tiers(for names: [String]) -> [(title: String, roles: [String])] {
        var out: [(title: String, roles: [String])] = []
        var placed = Set<String>()
        for t in layout {
            let present = t.roles.filter { names.contains($0) }
            placed.formUnion(present)
            if !present.isEmpty { out.append((t.title, present)) }
        }
        let extra = names.filter { !placed.contains($0) }
        if !extra.isEmpty { out.append(("Added roles", extra)) }
        return out
    }
}

/// Page 2 "How to Triage", kept word for word from the source board. Reference only; never used as an algorithm.
enum MCISourceReference {
    struct System {
        let title: String
        let subtitle: String
        let lead: String
        let steps: [String]
    }

    static let sourceLine = "Source: Sumter County EMS · MCI Triage & How to Triage (board page 2). Colors are START / SALT standard · Expectant (gray) is SALT. Reference only — verify against agency protocol."

    static let systems: [System] = [
        System(title: "START", subtitle: "adults", lead: "RPM · 30-2-Can Do", steps: [
            "1. Walking? → MINOR, send to Green area.",
            "2. Respirations. None → open airway. Still none → DECEASED. Breathing only after airway → IMMEDIATE.",
            "3. Rate over 30/min → IMMEDIATE.",
            "4. Perfusion (rate under 30): no radial pulse or cap refill over 2 sec → IMMEDIATE.",
            "5. Mental status: cannot follow commands → IMMEDIATE; follows commands → DELAYED.",
        ]),
        System(title: "JUMPSTART", subtitle: "pediatric", lead: "Infant to about 8 yr", steps: [
            "1. Walking? → MINOR. Carried infants: assess fully.",
            "2. Breathing? Apneic → position airway. Breathes → IMMEDIATE; still apneic → check pulse.",
            "3. No pulse → DECEASED. Pulse → 5 rescue breaths: breathes → IMMEDIATE; no breathing → DECEASED.",
            "4. Rate under 15 or over 45 → IMMEDIATE; 15-45 → check pulse.",
            "5. No peripheral pulse → IMMEDIATE. Pulse → AVPU: P (inappropriate) or U → IMMEDIATE; A / V / P appropriate → DELAYED.",
        ]),
        System(title: "SALT", subtitle: "all ages, MUCC", lead: "Sort → Assess → Lifesaving → Treat/Transport", steps: [
            "1. Sort (global): Walk → assess last. Wave / purposeful → assess 2nd. Still or obvious threat → assess 1st.",
            "2. Lifesaving interventions (fast only): control major bleeding, open airway / 2 breaths (peds), needle chest decompression, auto-injector antidotes.",
            "3. Assign: not breathing after LSI → DECEASED. Life threat, likely survivable → IMMEDIATE. Life threat, unlikely with resources → EXPECTANT. Obeys + pulse + no distress + minor → MINOR / DELAYED by severity.",
        ]),
    ]
}

struct MCISourceReferenceView: View {
    @State private var expanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button { expanded.toggle() } label: {
                Label(expanded ? "Hide How to Triage (source board page 2)" : "Show How to Triage (source board page 2)",
                      systemImage: expanded ? "chevron.up" : "chevron.down")
                    .font(.headline).frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
            }
            .buttonStyle(.bordered)
            if expanded {
                Text("REFERENCE ONLY — verify against agency protocol. Shown word for word from the source board; not an interactive algorithm.")
                    .font(.callout.bold()).padding(8).frame(maxWidth: .infinity, alignment: .leading).background(Color.yellow.opacity(0.25))
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 300), alignment: .topLeading)], alignment: .leading, spacing: 12) {
                    ForEach(MCISourceReference.systems, id: \.title) { sys in
                        VStack(alignment: .leading, spacing: 6) {
                            Text("\(sys.title) · \(sys.subtitle)").font(.mciHeading(.title3)).foregroundStyle(.white)
                                .padding(.horizontal, 8).padding(.vertical, 4)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(sys.title == "START" ? MCIStyle.brick : (sys.title == "SALT" ? MCIStyle.slate : MCIStyle.navy))
                            Text(sys.lead).font(.headline)
                            ForEach(sys.steps, id: \.self) { Text($0).font(.callout) }
                        }
                        .padding(8)
                        .overlay(Rectangle().stroke(MCIStyle.navy.opacity(0.35)))
                    }
                }
                Text(MCISourceReference.sourceLine).font(.footnote).foregroundStyle(.secondary)
            }
        }
    }
}

/// The original shield embedded in the source PDF, with its transparency mask restored. Scaled uniformly; not redrawn.
enum MCIShield {
    static let image: UIImage? = {
        if let named = UIImage(named: "SumterShield") { return named }
        guard let data = Data(base64Encoded: base64, options: .ignoreUnknownCharacters) else { return nil }
        return UIImage(data: data)
    }()

    static let base64 = """
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
fUy4AAAAAElFTkSuQmCC
"""
}

// MARK: - App entry (MyApp.swift shows ContentView)

struct ContentView: View {
    var body: some View { MCIRootView() }
}
