// MCICommandSection.swift
// Sumter EMS Command — MCI Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

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

    /// Saved staff list first, then anyone already assigned in this incident.
    var staffChoices: [String] {
        var out: [String] = store.data.settings.staffList
        if let inc = store.incident(incidentID) {
            for r in inc.roles where !r.person.mciTrimmed.isEmpty { out.append(r.person) }
        }
        out.append(contentsOf: store.data.settings.unitList)
        return out
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Person / call sign") {
                    MCIPickField(label: "Person / call sign", text: $person, choices: staffChoices)
                }
                Section("Optional") {
                    MCIPickField(label: "Agency / channel", text: $agency, choices: store.data.settings.agencyList)
                    MCIPickField(label: "Reports to (local)", text: $reportsTo, choices: store.incident(incidentID)?.roleNames ?? [])
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
