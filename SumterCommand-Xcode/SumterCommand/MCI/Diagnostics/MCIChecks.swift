// MCIChecks.swift
// Sumter EMS Command — MCI Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

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

        let settingsData: Data? = try? JSONEncoder().encode(MCISettings())
        let reloaded: MCISettings? = settingsData.flatMap { try? JSONDecoder().decode(MCISettings.self, from: $0) }
        check("Pick lists have defaults and saved settings without them still load",
              MCISettings().unitList.count == 11, MCISettings().assignmentList.contains("Transport"),
              reloaded != nil, reloaded?.unitList.count == 11, reloaded?.staffList.isEmpty == true)

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
