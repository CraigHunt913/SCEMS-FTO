// MCIStagingSection.swift
// Sumter EMS Command — MCI Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

// MARK: - Staging (source page 4)

struct MCIStagingSection: View {
    @EnvironmentObject var store: MCIStore
    let incident: MCIIncident
    @State private var newIdentifier = ""
    @State private var editing: MCIIDBox?

    var body: some View {
        let inc = incident
        let dups = inc.duplicateResources(identifier: newIdentifier, excluding: nil)
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Available in staging: \(inc.availableResourceCount)").font(.title2.bold())
                Spacer()
                Text("Derived from recorded statuses").font(.footnote).foregroundStyle(.secondary)
            }
            if !inc.isClosed {
                MCISectionBox(title: "Add Resource — tap a unit") {
                    MCIOptionGrid(options: store.data.settings.unitList.map { MCIIDString($0) }, selected: nil,
                                  title: { $0.id }, minWidth: 150) { u in addOrOpen(u.id, inc) }
                    Text("A unit already in staging opens instead of being added twice. Agencies and other units: type below or set up Pick Lists in Settings.")
                        .font(.footnote).foregroundStyle(.secondary)
                    TextField("Other unit / resource (optional typing)", text: $newIdentifier)
                        .textFieldStyle(.roundedBorder).frame(minHeight: 48)
                    if !dups.isEmpty {
                        Label("Possible duplicate of \(dups.map { $0.identifier }.joined(separator: ", ")). Open the existing one instead, or add anyway if it is a different resource.",
                              systemImage: "exclamationmark.triangle").foregroundStyle(MCIStyle.brick)
                    }
                    Button {
                        var newID: UUID?
                        let t = store.now()
                        let ini = store.initials
                        let ident = newIdentifier.mciTrimmed
                        store.update(inc.id) { newID = $0.addResource(identifier: ident, agency: "", aidRequestID: nil, timeIn: t, now: t, initials: ini) }
                        newIdentifier = ""
                        if let newID { editing = MCIIDBox(id: newID) }
                    } label: { MCIBigLabel(title: dups.isEmpty ? "Add Resource (Time In now)" : "Add Anyway", systemImage: "plus") }
                        .buttonStyle(.borderedProminent).tint(MCIStyle.navy)
                        .disabled(newIdentifier.mciTrimmed.isEmpty)
                }
            }
            ForEach(MCIResourceStatus.allCases) { st in
                let list = inc.resources.filter { $0.status == st }
                if !list.isEmpty {
                    MCISectionBox(title: "\(st.label) (\(list.count))", accent: st == .available ? MCIStyle.navy : MCIStyle.slate) {
                        ForEach(list) { r in
                            Button { editing = MCIIDBox(id: r.id) } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(r.identifier.mciDash).font(.mciHeading(.title3))
                                        Text("\(r.type.mciNR) · \(r.agency.mciNR) · in \(MCIFmt.clock(r.timeIn, tz: inc.timeZone, ref: inc.refDate)) · \(r.assignment.mciNR)")
                                            .font(.subheadline)
                                    }
                                    Spacer()
                                    if r.aidRequestID != nil { MCITag(text: "MUTUAL AID", color: MCIStyle.slate) }
                                }
                                .frame(minHeight: 56).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            Divider()
                        }
                    }
                }
            }
        }
        .sheet(item: $editing) { box in MCIResourceEditor(incidentID: inc.id, resourceID: box.id).environmentObject(store) }
    }

    /// Tapping a saved unit adds it with Time In now, or opens the existing record so it is never duplicated.
    func addOrOpen(_ name: String, _ inc: MCIIncident) {
        if let existing = inc.duplicateResources(identifier: name, excluding: nil).first {
            editing = MCIIDBox(id: existing.id)
            return
        }
        var newID: UUID?
        let t = store.now()
        let ini = store.initials
        store.update(inc.id) { newID = $0.addResource(identifier: name, agency: "Sumter County EMS", aidRequestID: nil, timeIn: t, now: t, initials: ini) }
        if let newID { editing = MCIIDBox(id: newID) }
    }
}

struct MCIResourceEditor: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.dismiss) private var dismiss
    let incidentID: UUID
    let resourceID: UUID

    var body: some View {
        NavigationStack {
            ScrollView {
                if let inc = store.incident(incidentID), let r = inc.resources.first(where: { $0.id == resourceID }) {
                    let ro = inc.isClosed
                    let dups = inc.duplicateResources(identifier: r.identifier, excluding: r.id)
                    VStack(alignment: .leading, spacing: 14) {
                        MCIPickField(label: "Unit / Resource", text: store.record(incidentID, \.resources, resourceID, \.identifier, fallback: ""),
                                     choices: store.data.settings.unitList, readOnly: ro)
                        if !dups.isEmpty {
                            Label("Same identifier as another resource. Check it is not the same vehicle recorded twice.", systemImage: "exclamationmark.triangle")
                                .foregroundStyle(MCIStyle.brick)
                        }
                        Text("Status / Released").font(.headline)
                        MCIOptionGrid(options: MCIResourceStatus.allCases, selected: r.status, title: { $0.label }, minWidth: 170, disabled: ro) { s in
                            let t = store.now()
                            let ini = store.initials
                            store.update(incidentID) { $0.setResourceStatus(resourceID, s, now: t, initials: ini) }
                        }
                        if let rel = r.releasedAt { Text("Released \(MCIFmt.full(rel, tz: inc.timeZone))").font(.callout) }
                        MCITimeRow(label: "Time In", value: r.timeIn, tz: inc.timeZone, ref: inc.refDate, readOnly: ro) { v, reason in
                            let t = store.now()
                            let ini = store.initials
                            store.update(incidentID) { i in
                                guard let k = i.resourceIndex(resourceID) else { return }
                                let old = i.resources[k].timeIn
                                i.resources[k].timeIn = v
                                i.log(resourceID, "resource", "edit", field: "Time In", before: old.map(MCIFmt.iso), after: v.map(MCIFmt.iso), now: t, initials: ini, note: reason)
                            }
                        }
                        MCIPickField(label: "Assignment", text: store.record(incidentID, \.resources, resourceID, \.assignment, fallback: ""),
                                     choices: store.data.settings.assignmentList, readOnly: ro)
                        Group {
                            MCIPickField(label: "Type", text: store.record(incidentID, \.resources, resourceID, \.type, fallback: ""),
                                         choices: store.data.settings.resourceTypeList, readOnly: ro)
                            MCIPickField(label: "Agency", text: store.record(incidentID, \.resources, resourceID, \.agency, fallback: ""),
                                         choices: store.data.settings.agencyList, readOnly: ro)
                            MCIPickField(label: "Call sign / contact", text: store.record(incidentID, \.resources, resourceID, \.contact, fallback: ""),
                                         choices: store.data.settings.staffList, readOnly: ro)
                            MCIField(label: "Quantity / capacity notes", text: store.record(incidentID, \.resources, resourceID, \.capacityNotes, fallback: ""), readOnly: ro)
                            MCILongText(label: "Notes", text: store.record(incidentID, \.resources, resourceID, \.notes, fallback: ""), minHeight: 120, readOnly: ro)
                            if let aid = inc.aid.first(where: { $0.id == r.aidRequestID }) {
                                Text("Linked to mutual aid request: \(aid.agency) (\(aid.status.label))").font(.callout)
                            }
                            let transports = inc.departures.filter { $0.resourceID == resourceID && !$0.voided }
                            if !transports.isEmpty {
                                let numbers: [String] = transports.compactMap { inc.patient($0.patientID)?.number }
                                Text("Transports: \(numbers.joined(separator: ", "))").font(.callout)
                            }
                            MCIHistoryList(incident: inc, recordIDs: [resourceID])
                        }
                    }
                    .padding()
                }
            }
            .navigationTitle("Resource")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { store.flush(); dismiss() } } }
        }
    }
}
