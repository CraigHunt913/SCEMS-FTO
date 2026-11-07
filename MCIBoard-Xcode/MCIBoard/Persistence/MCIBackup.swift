// MCIBackup.swift
// Sumter EMS Command — MCI Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

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
