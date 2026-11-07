// PendingEditorView.swift
// Sumter EMS Command — Shift Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

// MARK: - Holding call editor

struct PendingEditorView: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    let shiftID: UUID
    let pendingID: UUID
    @State private var showAssign = false
    @State private var confirmCancel = false
    @State private var cancelReason = ""

    var body: some View {
        NavigationStack {
            Group {
                if let shift = store.shift(shiftID), let p = shift.pending.first(where: { $0.id == pendingID }) {
                    content(shift, p)
                } else {
                    Text("Call not found.")
                }
            }
            .navigationTitle("Holding Call")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .status) { SaveStatusView() }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { store.flush(); dismiss() }.accessibilityLabel("Done, return to board")
                }
            }
        }
        .sheet(isPresented: $showAssign) {
            AssignSheet(shiftID: shiftID, pendingID: pendingID).environmentObject(store)
        }
    }

    func content(_ shift: ShiftRecord, _ p: PendingCall) -> some View {
        let readOnly = shift.isReadOnly
        let tz = shift.timeZone
        let initials = store.data.settings.initials
        return ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text("RUN \(p.runNumber.orDash)").font(.heading(.largeTitle))
                    TagText(text: p.state.label.uppercased(), color: p.state == .pending ? Theme.brick : Theme.navy)
                    Spacer()
                }
                TimeRow(label: "Time In", value: p.timeIn, tz: tz, ref: shift.operationalDate,
                        readOnly: readOnly || p.state == .cancelled,
                        onNow: {
                            let t = store.now()
                            store.update(shiftID) { s in s.setPendingTimeIn(pendingID, to: t, onlyIfEmpty: true, now: t, initials: initials, reason: "Now") }
                        },
                        onSet: { v, reason in
                            let t = store.now()
                            store.update(shiftID) { s in s.setPendingTimeIn(pendingID, to: v, onlyIfEmpty: false, now: t, initials: initials, reason: reason) }
                        })
                if p.state == .pending {
                    if let t = p.timeIn {
                        TimelineView(.periodic(from: .now, by: 30)) { ctx in
                            Text("Holding \(TimeFormat.elapsed(from: t, to: ctx.date))").font(.title3.bold())
                        }
                    } else {
                        Text("Holding time unknown until Time In is recorded.").foregroundStyle(.secondary)
                    }
                }
                Group {
                LabeledTextField(label: "Run Number", text: store.pendingText(shiftID, pendingID, \.runNumber), readOnly: readOnly)
                Text("Response Priority").font(.headline)
                OptionGrid(options: ResponsePriority.allCases, selected: p.priority, title: { $0.label }, disabled: readOnly) { v in
                    let t = store.now()
                    store.update(shiftID) { s in s.setPendingPriority(pendingID, v, now: t, initials: initials) }
                }
                Text("Determinant").font(.headline)
                OptionGrid(options: Determinant.allCases, selected: p.determinant, title: { $0.label }, minWidth: 120, disabled: readOnly) { v in
                    let t = store.now()
                    store.update(shiftID) { s in s.setPendingDeterminant(pendingID, v, now: t, initials: initials) }
                }
                }
                LongTextEditor(label: "Nature", text: store.pendingText(shiftID, pendingID, \.nature), minHeight: 120, readOnly: readOnly)
                LabeledTextField(label: "Location", text: store.pendingText(shiftID, pendingID, \.location), readOnly: readOnly)
                LongTextEditor(label: "Status / Notes", text: store.pendingText(shiftID, pendingID, \.statusNotes),
                               minHeight: 200, readOnly: readOnly,
                               ink: InkTarget(shiftID: shiftID, recordID: pendingID, fieldID: "pendingNotes",
                                              title: "Holding call \(p.runNumber.orDash) — Status / Notes"))
                SectionBox(title: "Assigned Units") {
                    let linked = p.assignedCallIDs.compactMap { cid in shift.calls.first { $0.id == cid } }
                    if linked.isEmpty { Text("None.").foregroundStyle(.secondary) }
                    ForEach(linked) { c in
                        Text("Unit \(shift.unit(c.unitID)?.name ?? "?") — run \(c.isOpen ? "active" : "closed")").font(.headline)
                    }
                    Text("Assigning copies Run Number, priority, determinant, nature and location into a new run for that unit. Later edits here do not change those runs.")
                        .font(.footnote).foregroundStyle(.secondary)
                    if !readOnly && p.state != .cancelled {
                        Button { store.flush(); showAssign = true } label: { BigButtonLabel(title: "Assign Unit…", systemImage: "arrow.right.circle") }
                            .buttonStyle(.borderedProminent).tint(Theme.navy)
                    }
                }
                if !readOnly && p.state != .cancelled {
                    Button(role: .destructive) { confirmCancel = true } label: { BigButtonLabel(title: "Cancel Call…", systemImage: "xmark.circle") }
                        .buttonStyle(.bordered)
                }
                HistorySection(shift: shift, recordIDs: [pendingID])
            }
            .padding()
            .frame(maxWidth: 1000)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .alert("Cancel this call?", isPresented: $confirmCancel) {
            TextField("Reason (optional)", text: $cancelReason)
            Button("Cancel Call", role: .destructive) {
                let t = store.now()
                let reason = cancelReason
                store.update(shiftID) { s in s.cancelPending(pendingID, reason: reason, now: t, initials: initials) }
            }
            Button("Keep Call", role: .cancel) {}
        } message: {
            Text("The call stays on the board marked Cancelled, with its history.")
        }
    }
}

struct AssignSheet: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    let shiftID: UUID
    let pendingID: UUID
    @State private var selected: UUID?
    @State private var closeExisting = false
    @State private var overrideNote = ""
    @State private var message: String?
    @State private var working = false

    var body: some View {
        NavigationStack {
            Group {
                if let s = store.shift(shiftID) { content(s) }
            }
            .navigationTitle("Assign Unit")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
    }

    func content(_ s: ShiftRecord) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let id = selected, let u = s.unit(id) {
                    requirements(s, u)
                    Divider()
                }
                ForEach(s.orderedStations) { st in
                    Text("STATION \(st.number) / \(st.name)").font(.heading(.headline))
                    ForEach(s.stationUnits(st.id)) { u in unitChoice(s, u) }
                }
            }
            .padding()
        }
    }

    func unitChoice(_ s: ShiftRecord, _ u: RosterUnit) -> some View {
        let isOn = selected == u.id
        let hasRun = s.activeCall(for: u.id)?.isOpen ?? false
        return Button {
            selected = u.id
            closeExisting = false
            overrideNote = ""
            message = nil
        } label: {
            HStack(spacing: 12) {
                Image(systemName: isOn ? "largecircle.fill.circle" : "circle").font(.title2)
                Text(u.name).font(.heading(.title2))
                StatusBadge(status: u.status)
                Text(u.onDuty ? "On duty" : "Not on duty").foregroundStyle(.secondary)
                if hasRun { TagText(text: "ACTIVE RUN", color: Theme.navy) }
                Spacer()
            }
            .frame(minHeight: 56)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }

    @ViewBuilder
    func requirements(_ s: ShiftRecord, _ u: RosterUnit) -> some View {
        let active = s.activeCall(for: u.id).flatMap { $0.isOpen ? $0 : nil }
        let needsOverride = s.assignNeedsOverride(u)
        VStack(alignment: .leading, spacing: 12) {
            Text("Assign unit \(u.name)").font(.heading(.title2))
            if let active {
                Text("Unit \(u.name) has an active run (Run \(active.runNumber.orDash)). It must be closed to take this call; it stays in history with its times.")
                Toggle("Close that run and assign this call", isOn: $closeExisting).frame(minHeight: 48)
            }
            if needsOverride {
                Text("Warning: unit \(u.name) is \(u.onDuty ? u.status.fullName : "not on duty"). Assigning it is an override and needs a documented reason.")
                    .foregroundStyle(Theme.brick)
                TextField("Override reason (required)", text: $overrideNote)
                    .textFieldStyle(.roundedBorder)
                    .frame(minHeight: 48)
            }
            if let message { Text(message).foregroundStyle(Theme.brick) }
            Button { assign(u) } label: { BigButtonLabel(title: "Assign \(u.name)", systemImage: "checkmark") }
                .buttonStyle(.borderedProminent).tint(Theme.navy)
                .disabled(working || (active != nil && !closeExisting) || (needsOverride && overrideNote.trimmed.isEmpty))
        }
    }

    func assign(_ u: RosterUnit) {
        guard !working else { return }
        working = true
        var result = AssignResult.notFound
        let t = store.now()
        let initials = store.data.settings.initials
        let note = overrideNote
        let close = closeExisting
        store.update(shiftID) { s in
            result = s.assign(pendingID: pendingID, unitID: u.id, overrideNote: note, closeExistingRun: close,
                              now: t, initials: initials)
        }
        if case .assigned = result {
            dismiss()
        } else {
            message = result.message
            working = false
        }
    }
}
