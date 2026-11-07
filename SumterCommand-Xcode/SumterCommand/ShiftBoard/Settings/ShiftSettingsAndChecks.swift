// ShiftSettingsAndChecks.swift
// Sumter EMS Command — Shift Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

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
