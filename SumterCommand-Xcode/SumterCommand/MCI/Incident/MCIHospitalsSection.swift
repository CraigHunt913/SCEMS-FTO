// MCIHospitalsSection.swift
// Sumter EMS Command — MCI Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

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
            ViewThatFits(in: .horizontal) {
                HStack {
                    Text(hospital.name).font(.mciHeading(.title3))
                    Spacer()
                    headerActions(stale: stale, closed: inc.isClosed)
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text(hospital.name).font(.mciHeading(.title3))
                    HStack { headerActions(stale: stale, closed: inc.isClosed) }
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

    @ViewBuilder
    func headerActions(stale: Bool, closed: Bool) -> some View {
        if stale { MCITag(text: "NEEDS UPDATE (local reminder)") }
        if !closed {
            Button("Record Bed Poll…", action: onPoll).buttonStyle(.borderedProminent).tint(MCIStyle.navy).frame(minHeight: 48)
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
                        MCIPickField(label: "Units / Resources Sent", text: store.record(incidentID, \.aid, aidID, \.unitsSent, fallback: ""),
                                     choices: store.data.settings.unitList, readOnly: ro)
                        MCITimeRow(label: "ETA (estimate)", value: a.eta, tz: inc.timeZone, ref: inc.refDate, readOnly: ro) { v, _ in
                            store.update(incidentID) { i in if let k = i.aid.firstIndex(where: { $0.id == aidID }) { i.aid[k].eta = v } }
                        }
                        MCIPickField(label: "ETA source", text: store.record(incidentID, \.aid, aidID, \.etaSource, fallback: ""),
                                     choices: MCISettings.etaSources, readOnly: ro)
                        MCIPickField(label: "Assignment / Status", text: store.record(incidentID, \.aid, aidID, \.assignment, fallback: ""),
                                     choices: store.data.settings.assignmentList, readOnly: ro)
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
                            MCIPickField(label: "Destination", text: store.record(incidentID, \.air, airID, \.destination, fallback: ""),
                                         choices: inc.hospitals.map { $0.name }, readOnly: ro)
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
