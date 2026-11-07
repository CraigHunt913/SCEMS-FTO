// MCITransportSection.swift
// Sumter EMS Command — MCI Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

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
    @Environment(\.horizontalSizeClass) private var sizeClass
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
            if sizeClass == .compact {
                Picker("Location", selection: $locationFilter) {
                    ForEach(MCILocationFilter.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.menu)
            } else {
                Picker("Location", selection: $locationFilter) {
                    ForEach(MCILocationFilter.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
            }
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
    @Environment(\.horizontalSizeClass) private var sizeClass

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
            .frame(width: sizeClass == .compact ? 76 : 110, alignment: .leading)
            VStack(alignment: .leading, spacing: 4) {
                ViewThatFits(in: .horizontal) {
                    HStack { badges(inc, p, d, dup) }
                    VStack(alignment: .leading, spacing: 4) { badges(inc, p, d, dup) }
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

    @ViewBuilder
    func badges(_ inc: MCIIncident, _ p: MCIPatient, _ d: MCIDeparture?, _ dup: Bool) -> some View {
        MCICategoryBadge(category: p.category)
        Text(inc.location(of: p).label.uppercased()).font(.caption.bold())
        if dup { MCITag(text: "DUPLICATE TAG?") }
        if d?.needsCompletion == true { MCITag(text: "COMPLETE DEPARTURE") }
        if p.enteredInError { MCITag(text: "ENTERED IN ERROR", color: Color(white: 0.4)) }
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
            MCIAdaptiveStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("PATIENT \(p.number)").font(.mciHeading(.largeTitle)).foregroundStyle(.white)
                    Text("Tag \(p.tag.mciDash) · \(inc.location(of: p).label)").font(.headline).foregroundStyle(.white.opacity(0.9))
                }
                MCICategoryBadge(category: p.category)
                if d == nil && !ro {
                    Button { store.flush(); showDeparture = true } label: {
                        Label("Record Departure", systemImage: "arrow.right.circle.fill").font(.headline).frame(minHeight: 48)
                    }
                    .buttonStyle(.borderedProminent).tint(MCIStyle.brick)
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
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
            MCIAdaptiveStack(spacing: 12) {
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

    static func unitOptions(_ inc: MCIIncident, saved: [String] = []) -> [MCIIDString] {
        var out: [MCIIDString] = inc.resources.map { MCIIDString($0.id.uuidString) }
        for name in saved { out.append(MCIIDString("pick:\(name)")) }
        out.append(MCIIDString("typed"))
        out.append(MCIIDString("unknown"))
        return out
    }

    static func unit(_ id: String, in inc: MCIIncident) -> String {
        if let r = inc.resources.first(where: { $0.id.uuidString == id }) { return r.identifier.mciDash }
        if id.hasPrefix("pick:") { return String(id.dropFirst(5)) }
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
        let staged = Set(inc.resources.map { $0.identifier.mciTrimmed.lowercased() })
        for name in store.data.settings.unitList where !staged.contains(name.lowercased()) {
            units.append(MCIUnitChoice(id: "pick:\(name)", resourceID: nil, label: name))
        }
        units.append(MCIUnitChoice(id: "typed", resourceID: nil, label: "Other / type below"))
        units.append(MCIUnitChoice(id: "unknown", resourceID: nil, label: "Unknown unit"))
        let poll = hospitalID.flatMap { inc.latestPoll($0) }
        let destOptions: [MCIIDString] = MCIDestinationName.options(inc)
        let destSelected: MCIIDString? = destinationChosen ? MCIIDString(hospitalID?.uuidString ?? "unknown") : nil
        let destTitle: (MCIIDString) -> String = { o in MCIDestinationName.of(o.id, in: inc) }
        return VStack(alignment: .leading, spacing: 16) {
            MCIAdaptiveStack(spacing: 8) {
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
        var ut = ""
        if let c = unitChoice {
            if c.id == "typed" { ut = unitText } else if c.id.hasPrefix("pick:") { ut = c.label }
        }
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
            MCIOptionGrid(options: MCIDestinationName.unitOptions(inc, saved: store.data.settings.unitList), selected: unitChoice,
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
            var text = ""
            if let c = unitChoice {
                if c.id == "typed" { text = unitText } else if c.id.hasPrefix("pick:") { text = String(c.id.dropFirst(5)) }
            }
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
