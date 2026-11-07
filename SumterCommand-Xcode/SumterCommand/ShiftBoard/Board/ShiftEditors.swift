// ShiftEditors.swift
// Sumter EMS Command — Shift Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

// MARK: - Header, system and roster editors

struct HeaderEditor: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    let shiftID: UUID
    @State private var tzText = ""
    @State private var tzMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                if let s = store.shift(shiftID) {
                    Section("Header") {
                        DatePicker("Date", selection: Binding(
                            get: { TimeFormat.pickerDate(fromNoon: s.operationalDate, in: s.timeZone) },
                            set: { v in store.update(shiftID) { r in r.operationalDate = TimeFormat.noon(ofPicked: v, in: r.timeZone) } }),
                                   displayedComponents: .date)
                        TextField("Shift", text: store.shiftText(shiftID, \.shiftLabel)).frame(minHeight: 44)
                        TextField("Supervisor", text: store.shiftText(shiftID, \.supervisor)).frame(minHeight: 44)
                        TextField("Sheet (reference)", text: store.shiftText(shiftID, \.sheetRef)).frame(minHeight: 44)
                    }
                    .disabled(s.isReadOnly)
                    Section("Operational time zone") {
                        Text("Current: \(s.timeZoneID)")
                        TextField("e.g. America/New_York", text: $tzText)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                        Button("Change Time Zone for This Shift") {
                            if let tz = TimeZone(identifier: tzText.trimmed) {
                                store.update(shiftID) { r in r.timeZoneID = tz.identifier }
                                tzMessage = "Changed. Stored times are unchanged; they are now displayed in \(tz.identifier)."
                            } else {
                                tzMessage = "Not a recognised time zone identifier."
                            }
                        }
                        .disabled(s.isReadOnly)
                        if let tzMessage { Text(tzMessage).font(.footnote) }
                    }
                }
            }
            .navigationTitle("Shift Header")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { store.flush(); dismiss() } }
            }
        }
    }
}

struct SystemEditor: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    let shiftID: UUID

    var body: some View {
        NavigationStack {
            ScrollView {
                if let s = store.shift(shiftID) {
                    VStack(alignment: .leading, spacing: 18) {
                        Text("These are manual observations. Nothing here is looked up or invented; each records when it was last changed.")
                            .font(.callout).foregroundStyle(.secondary)
                        observation(s, "Status Level", \.statusLevel, \.statusLevelUpdatedAt)
                        observation(s, "Weather", \.weather, \.weatherUpdatedAt)
                        LongTextEditor(label: "Hospital Divert",
                                       text: store.systemText(shiftID, \.hospitalDivert, stamp: \.hospitalDivertUpdatedAt),
                                       minHeight: 120, readOnly: s.isReadOnly)
                        Text("Hospital Divert updated: \(TimeFormat.full(s.system.hospitalDivertUpdatedAt, tz: s.timeZone))")
                            .font(.footnote).foregroundStyle(.secondary)
                        if let m = s.system.onDutyNotesInherited, !m.reviewed {
                            HStack {
                                Text("On-Duty Notes carried forward from the shift of \(TimeFormat.day(m.fromDate, tz: s.timeZone)). Review before treating as current.")
                                Spacer()
                                Button("Mark Reviewed") {
                                    let t = store.now()
                                    let initials = store.data.settings.initials
                                    store.update(shiftID) { r in
                                        r.system.onDutyNotesInherited?.reviewed = true
                                        r.log(batch: UUID(), record: r.id, kind: "shift", action: "reviewed", field: "On-Duty Notes",
                                              before: nil, after: nil, effective: t, now: t, initials: initials)
                                    }
                                }
                                .buttonStyle(.borderedProminent).tint(Theme.navy).frame(minHeight: 48)
                                .disabled(s.isReadOnly)
                            }
                            .padding(10).background(Color.yellow.opacity(0.2))
                        }
                        LongTextEditor(label: "On-Duty Notes", text: store.systemText(shiftID, \.onDutyNotes, stamp: nil),
                                       minHeight: 200, readOnly: s.isReadOnly,
                                       ink: InkTarget(shiftID: shiftID, recordID: s.id, fieldID: "onDutyNotes",
                                                      title: "System — On-Duty Notes"))
                    }
                    .padding()
                }
            }
            .navigationTitle("System Status")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .status) { SaveStatusView() }
                ToolbarItem(placement: .confirmationAction) { Button("Done") { store.flush(); dismiss() } }
            }
        }
    }

    func observation(_ s: ShiftRecord, _ label: String, _ kp: WritableKeyPath<SystemStatus, String>,
                     _ stamp: WritableKeyPath<SystemStatus, Date?>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            LabeledTextField(label: label, text: store.systemText(shiftID, kp, stamp: stamp), readOnly: s.isReadOnly)
            Text("Updated: \(TimeFormat.full(s.system[keyPath: stamp], tz: s.timeZone))")
                .font(.footnote).foregroundStyle(.secondary)
        }
    }
}

struct RosterEditor: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    let shiftID: UUID
    @State private var newUnitNames: [UUID: String] = [:]
    @State private var newStationNumber = ""
    @State private var newStationName = ""

    var body: some View {
        NavigationStack {
            Form {
                if let s = store.shift(shiftID) {
                    Section {
                        Text("Changes apply to this shift. Units keep their internal IDs, so reordering or renaming never moves notes, runs or handwriting to another unit. Removing a unit hides it from the board and counts; its history stays.")
                            .font(.footnote)
                    }
                    ForEach(s.orderedStations) { st in
                        Section {
                            TextField("Station number", text: store.stationText(shiftID, st.id, \.number))
                            TextField("Station name", text: store.stationText(shiftID, st.id, \.name))
                            HStack {
                                Button("Move Station Up") { store.update(shiftID) { $0.moveStation(st.id, by: -1) } }
                                    .buttonStyle(.bordered)
                                Button("Move Station Down") { store.update(shiftID) { $0.moveStation(st.id, by: 1) } }
                                    .buttonStyle(.bordered)
                            }
                            ForEach(s.stationUnits(st.id, includeRetired: true)) { u in unitRow(u) }
                            HStack {
                                TextField("New unit", text: Binding(get: { newUnitNames[st.id] ?? "" },
                                                                    set: { newUnitNames[st.id] = $0 }))
                                Button("Add Unit") {
                                    let name = (newUnitNames[st.id] ?? "").trimmed
                                    guard !name.isEmpty else { return }
                                    store.update(shiftID) { $0.addUnit(stationID: st.id, name: name) }
                                    newUnitNames[st.id] = ""
                                }
                                .buttonStyle(.borderedProminent).tint(Theme.navy)
                            }
                        } header: {
                            Text("Station \(st.number) / \(st.name)")
                        }
                    }
                    Section("Add Station") {
                        TextField("Number", text: $newStationNumber)
                        TextField("Name", text: $newStationName)
                        Button("Add Station") {
                            guard !newStationNumber.trimmed.isEmpty else { return }
                            let n = newStationNumber.trimmed, nm = newStationName.trimmed
                            store.update(shiftID) { $0.addStation(number: n, name: nm) }
                            newStationNumber = ""; newStationName = ""
                        }
                    }
                }
            }
            .navigationTitle("Roster and Stations")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { store.flush(); dismiss() } }
            }
        }
    }

    func unitRow(_ u: RosterUnit) -> some View {
        HStack(spacing: 10) {
            TextField("Unit", text: store.unitText(shiftID, u.id, \.name)).font(.title3)
            if u.retired { TagText(text: "REMOVED", color: Color(white: 0.4)) }
            Button { store.update(shiftID) { $0.moveUnit(u.id, by: -1) } } label: { Image(systemName: "arrow.up") }
                .buttonStyle(.bordered).accessibilityLabel("Move unit \(u.name) up")
            Button { store.update(shiftID) { $0.moveUnit(u.id, by: 1) } } label: { Image(systemName: "arrow.down") }
                .buttonStyle(.bordered).accessibilityLabel("Move unit \(u.name) down")
            Button(u.retired ? "Restore" : "Remove") {
                store.update(shiftID) { s in if let i = s.unitIndex(u.id) { s.units[i].retired.toggle() } }
            }
            .buttonStyle(.bordered)
        }
        .frame(minHeight: 52)
    }
}
