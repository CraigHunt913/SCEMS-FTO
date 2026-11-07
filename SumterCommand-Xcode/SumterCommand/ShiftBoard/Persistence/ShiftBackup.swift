// ShiftBackup.swift
// Sumter EMS Command — Shift Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

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
