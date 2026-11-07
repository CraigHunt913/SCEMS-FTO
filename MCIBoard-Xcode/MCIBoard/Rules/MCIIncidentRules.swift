// MCIIncidentRules.swift
// Sumter EMS Command — MCI Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

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
