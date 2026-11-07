// ShiftRecords.swift
// Sumter EMS Command — Shift Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

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
