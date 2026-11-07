// MCIRecords.swift
// Sumter EMS Command — MCI Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

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
    // Tap-to-pick lists. Optional so files saved before these existed still open.
    var pickStaff: [String]? = nil
    var pickUnits: [String]? = nil
    var pickAssignments: [String]? = nil
    var pickResourceTypes: [String]? = nil
}

extension MCISettings {
    static let defaultUnits: [String] = [
        "Medic 101", "Medic 102", "Medic 103", "Medic 104", "Medic 105", "Medic 106",
        "Medic 201", "Medic 202", "Medic 401", "ALS 1", "ALS 2",
    ]
    static let defaultAssignments: [String] = [
        "Triage", "Treatment", "Transport", "Staging", "Rehab", "Medical Communications",
        "Safety", "Standby", "Returned to service", "Released",
    ]
    static let defaultResourceTypes: [String] = [
        "ALS ambulance", "BLS ambulance", "Supervisor", "Bus / mass transport", "Fire apparatus",
        "Rescue", "Air medical", "Law enforcement", "Other",
    ]
    static let etaSources: [String] = ["Agency estimate", "Dispatch", "Unit by radio", "Phone"]

    var staffList: [String] { pickStaff ?? [] }
    var unitList: [String] { pickUnits ?? MCISettings.defaultUnits }
    var assignmentList: [String] { pickAssignments ?? MCISettings.defaultAssignments }
    var resourceTypeList: [String] { pickResourceTypes ?? MCISettings.defaultResourceTypes }
    var agencyList: [String] {
        var out: [String] = ["Sumter County EMS"]
        out.append(contentsOf: groundAgencies)
        return out
    }
}

struct MCIAppData: Codable {
    static let currentSchema = 1
    var schemaVersion = MCIAppData.currentSchema
    var incidents: [MCIIncident] = []
    var settings = MCISettings()
}
