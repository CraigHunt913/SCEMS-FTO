// UnitEditorView.swift
// Sumter EMS Command — Shift Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

// MARK: - Unit editor

struct UndoToken: Equatable {
    let batch: UUID
    let text: String
}

struct UnitEditorView: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    let shiftID: UUID
    @State var unitID: UUID
    @State private var lastAction: UndoToken?

    var shift: ShiftRecord? { store.shift(shiftID) }

    var orderedIDs: [UUID] { shift?.orderedUnits.map(\.id) ?? [] }
    var position: Int? { orderedIDs.firstIndex(of: unitID) }

    var body: some View {
        NavigationStack {
            Group {
                if let shift, let unit = shift.unit(unitID) {
                    editor(shift, unit)
                } else {
                    Text("Unit not found.")
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .navigationBarLeading) {
                    Button { move(-1) } label: { Label("Previous Unit", systemImage: "chevron.up") }
                        .disabled((position ?? 0) == 0)
                    Button { move(1) } label: { Label("Next Unit", systemImage: "chevron.down") }
                        .disabled(position == nil || position == orderedIDs.count - 1)
                }
                ToolbarItem(placement: .principal) { SaveStatusView() }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { store.flush(); dismiss() }
                        .font(.headline)
                        .accessibilityLabel("Done, return to board")
                }
            }
        }
    }

    func move(_ delta: Int) {
        guard let i = position, orderedIDs.indices.contains(i + delta) else { return }
        store.flush()
        lastAction = nil
        unitID = orderedIDs[i + delta]
    }

    func editor(_ shift: ShiftRecord, _ unit: RosterUnit) -> some View {
        let readOnly = shift.isReadOnly
        let station = shift.station(unit.stationID)
        let run = shift.activeCall(for: unit.id)
        return VStack(spacing: 0) {
            IdentityBar(stationText: station.map { "Station \($0.number) / \($0.name)" } ?? "Station not set",
                        unit: unit, run: run)
            SaveFailureBanner()
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if readOnly {
                        Text("Archived shift — read-only.").font(.headline).foregroundStyle(Theme.brick)
                    }
                    if let lastAction, shift.events.contains(where: { $0.batchID == lastAction.batch }), !shift.isUndone(lastAction.batch) {
                        undoBanner(lastAction)
                    }
                    statusSection(shift, unit, readOnly: readOnly)
                    crewSection(shift, unit, readOnly: readOnly)
                    RunSection(shiftID: shiftID, unit: unit, readOnly: readOnly)
                    SectionBox(title: "Unit Notes") {
                        LongTextEditor(label: "Unit Notes", text: store.unitText(shiftID, unit.id, \.notes),
                                       minHeight: 200, readOnly: readOnly,
                                       ink: InkTarget(shiftID: shiftID, recordID: unit.id, fieldID: "unitNotes",
                                                      title: "Unit \(unit.name) — Unit Notes"))
                    }
                    PriorRunsSection(shift: shift, unit: unit)
                    HistorySection(shift: shift, recordIDs: Set([unit.id] + shift.runs(for: unit.id).map(\.id)))
                }
                .padding()
                .frame(maxWidth: 1000)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .id(unit.id)
    }

    func undoBanner(_ token: UndoToken) -> some View {
        HStack(spacing: 12) {
            Text(token.text).font(.headline)
            Spacer()
            Button {
                let t = store.now()
                let initials = store.data.settings.initials
                store.update(shiftID) { s in s.undo(batch: token.batch, now: t, initials: initials) }
                lastAction = nil
            } label: { Text("Undo").font(.headline).frame(minWidth: 80, minHeight: 48) }
            .buttonStyle(.borderedProminent).tint(Theme.navy)
            .accessibilityLabel("Undo: \(token.text)")
        }
        .padding(12)
        .background(Theme.rowFill)
        .overlay(Rectangle().stroke(Theme.navy, lineWidth: 1))
    }

    func statusSection(_ shift: ShiftRecord, _ unit: RosterUnit, readOnly: Bool) -> some View {
        SectionBox(title: "Status") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 10)], spacing: 10) {
                ForEach(UnitStatus.allCases) { s in
                    let isOn = unit.status == s
                    Button { pick(s, unit: unit) } label: {
                        VStack(spacing: 2) {
                            Text(s.abbr).font(.heading(.title2))
                            Text(s.fullName).font(.footnote).multilineTextAlignment(.center)
                        }
                        .padding(6)
                        .frame(maxWidth: .infinity, minHeight: 68)
                        .foregroundStyle(isOn ? Color.white : Color.primary)
                        .background(isOn ? s.color : Theme.rowFill)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(s.color, lineWidth: isOn ? 3 : 1))
                    }
                    .buttonStyle(.plain)
                    .disabled(readOnly)
                    .accessibilityLabel("\(s.abbr), \(s.fullName)")
                    .accessibilityAddTraits(isOn ? .isSelected : [])
                }
            }
            Text(unit.activeCallID == nil
                 ? "No active run: status changes will not record any run times."
                 : "ENR, SCN, TRN, HOS and CLR fill their matching run time only if it is empty. AVL and OOS never record times.")
                .font(.footnote).foregroundStyle(.secondary)
            Toggle(isOn: Binding(get: { unit.onDuty }, set: { v in
                let t = store.now()
                let initials = store.data.settings.initials
                store.update(shiftID) { s in s.setOnDuty(unitID: unit.id, v, now: t, initials: initials) }
            })) {
                Text("On duty this shift").font(.headline)
            }
            .frame(minHeight: 56)
            .disabled(readOnly)
        }
    }

    func pick(_ status: UnitStatus, unit: RosterUnit) {
        let t = store.now()
        let initials = store.data.settings.initials
        var batch: UUID?
        var stampedText = ""
        store.update(shiftID) { s in
            batch = s.setStatus(unitID: unit.id, to: status, now: t, initials: initials)
            if let b = batch, let e = s.events.first(where: { $0.batchID == b && $0.action == "timeStamped" }) {
                stampedText = "; \(Milestone(rawValue: e.field)?.label ?? e.field) time recorded \(TimeFormat.clock(t, tz: s.timeZone, ref: s.operationalDate))"
            }
        }
        if let batch {
            lastAction = UndoToken(batch: batch, text: "Unit \(unit.name) set to \(status.abbr)\(stampedText)")
        }
    }

    func crewSection(_ shift: ShiftRecord, _ unit: RosterUnit, readOnly: Bool) -> some View {
        SectionBox(title: "Crew") {
            if let m = unit.crewInherited, !m.reviewed {
                HStack {
                    Text("Carried forward from the shift of \(TimeFormat.day(m.fromDate, tz: shift.timeZone)). Review before treating as current.")
                        .font(.callout)
                    Spacer()
                    Button("Mark Reviewed") {
                        let t = store.now()
                        let initials = store.data.settings.initials
                        store.update(shiftID) { s in
                            if let i = s.unitIndex(unit.id) {
                                s.units[i].crewInherited?.reviewed = true
                                s.log(batch: UUID(), record: unit.id, kind: "unit", action: "reviewed", field: "crew",
                                      before: nil, after: nil, effective: t, now: t, initials: initials)
                            }
                        }
                    }
                    .buttonStyle(.borderedProminent).tint(Theme.navy).frame(minHeight: 48)
                    .disabled(readOnly)
                }
                .padding(10)
                .background(Color.yellow.opacity(0.2))
            }
            LongTextEditor(label: "Crew", text: store.unitText(shiftID, unit.id, \.crew), minHeight: 120,
                           readOnly: readOnly,
                           ink: InkTarget(shiftID: shiftID, recordID: unit.id, fieldID: "crew",
                                          title: "Unit \(unit.name) — Crew"))
        }
    }
}

struct IdentityBar: View {
    let stationText: String
    let unit: RosterUnit
    let run: CallRecord?
    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 14) {
                title
                StatusBadge(status: unit.status)
                Spacer()
                runInfo(alignment: .trailing)
            }
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 12) { title; StatusBadge(status: unit.status) }
                runInfo(alignment: .leading)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.navy)
        .accessibilityElement(children: .combine)
    }

    var title: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(stationText.uppercased()).font(.heading(.subheadline)).foregroundStyle(.white.opacity(0.85))
            Text("UNIT \(unit.name)").font(.heading(.largeTitle)).foregroundStyle(.white)
        }
    }

    func runInfo(alignment: HorizontalAlignment) -> some View {
            VStack(alignment: alignment, spacing: 2) {
                Text(run == nil ? "No active run" : "Run \(run?.runNumber.orDash ?? "—")").font(.headline).foregroundStyle(.white)
                Text(unit.onDuty ? "On duty" : "Not on duty").font(.subheadline).foregroundStyle(.white.opacity(0.85))
            }
    }
}

struct RunSection: View {
    @EnvironmentObject var store: Store
    let shiftID: UUID
    let unit: RosterUnit
    let readOnly: Bool
    @State private var confirmNew = false
    @State private var confirmClose = false

    var body: some View {
        SectionBox(title: "Current Run") {
            if let shift = store.shift(shiftID), let run = shift.activeCall(for: unit.id) {
                runEditor(shift, run)
            } else {
                Text("No active run.").font(.headline)
                if !readOnly {
                    Button { confirmNew = true } label: { BigButtonLabel(title: "Start Run", systemImage: "plus.circle") }
                        .buttonStyle(.borderedProminent).tint(Theme.navy)
                }
            }
        }
        .confirmationDialog(newRunQuestion, isPresented: $confirmNew, titleVisibility: .visible) {
            Button("Start New Run") {
                let expected = store.shift(shiftID)?.unit(unit.id)?.activeCallID
                let t = store.now()
                let initials = store.data.settings.initials
                store.update(shiftID) { s in s.startNewRun(unitID: unit.id, replacing: expected, now: t, initials: initials) }
            }
        }
        .confirmationDialog("Close this run? It stays in the unit's history with all its times.",
                            isPresented: $confirmClose, titleVisibility: .visible) {
            Button("Close Run") {
                guard let expected = store.shift(shiftID)?.unit(unit.id)?.activeCallID else { return }
                let t = store.now()
                let initials = store.data.settings.initials
                store.update(shiftID) { s in s.closeRun(unitID: unit.id, expected: expected, now: t, initials: initials) }
            }
        }
    }

    var newRunQuestion: String {
        unit.activeCallID == nil
            ? "Start a new run for unit \(unit.name)? All times start blank."
            : "Close the current run (kept in history) and start a new run with blank times?"
    }

    @ViewBuilder
    func runEditor(_ shift: ShiftRecord, _ run: CallRecord) -> some View {
        let tz = shift.timeZone
        let initials = store.data.settings.initials
        if run.transferredFromShiftID != nil {
            Text("Transferred from an earlier shift with its original times and history.").font(.callout)
        }
        if let pid = run.sharedCallID, let p = shift.pending.first(where: { $0.id == pid }) {
            Text("Linked to holding call received \(TimeFormat.clock(p.timeIn, tz: tz, ref: shift.operationalDate)).")
                .font(.callout).foregroundStyle(.secondary)
        }
        Group {
        LabeledTextField(label: "Run Number", text: store.callText(shiftID, run.id, \.runNumber), readOnly: readOnly)
        Text("Response Priority").font(.headline)
        OptionGrid(options: ResponsePriority.allCases, selected: run.priority, title: { $0.label }, minWidth: 110,
                   disabled: readOnly) { v in
            let t = store.now()
            store.update(shiftID) { s in s.setPriority(callID: run.id, v, now: t, initials: initials) }
        }
        Text("Determinant").font(.headline)
        OptionGrid(options: Determinant.allCases, selected: run.determinant, title: { $0.label }, minWidth: 120,
                   disabled: readOnly) { v in
            let t = store.now()
            store.update(shiftID) { s in s.setDeterminant(callID: run.id, v, now: t, initials: initials) }
        }
        Text("Priority and determinant are recorded separately. Neither sets the other or any clinical acuity.")
            .font(.footnote).foregroundStyle(.secondary)
        }
        Group {
        LongTextEditor(label: "Nature", text: store.callText(shiftID, run.id, \.nature), minHeight: 120, readOnly: readOnly)
        LabeledTextField(label: "Location", text: store.callText(shiftID, run.id, \.location), readOnly: readOnly)
        LongTextEditor(label: "Destination", text: store.callText(shiftID, run.id, \.destination), minHeight: 120, readOnly: readOnly)
        Text("Times").font(.heading(.title3))
        ForEach(Milestone.allCases) { m in
            TimeRow(label: m.label, value: run.time(m), tz: tz, ref: shift.operationalDate, readOnly: readOnly,
                    onNow: {
                        let t = store.now()
                        store.update(shiftID) { s in s.stampIfEmpty(callID: run.id, milestone: m, now: t, initials: initials) }
                    },
                    onSet: { value, reason in
                        let t = store.now()
                        store.update(shiftID) { s in
                            s.setTime(callID: run.id, milestone: m, to: value, now: t, initials: initials, reason: reason)
                        }
                    })
            Divider()
        }
        ForEach(shift.timeWarnings(run, now: Date()), id: \.self) { w in
            Label(w, systemImage: "exclamationmark.triangle").foregroundStyle(Theme.brick)
        }
        }
        LongTextEditor(label: "Run Notes", text: store.callText(shiftID, run.id, \.notes), minHeight: 200,
                       readOnly: readOnly,
                       ink: InkTarget(shiftID: shiftID, recordID: run.id, fieldID: "runNotes",
                                      title: "Unit \(unit.name) run \(run.runNumber.orDash) — Run Notes"))
        if !readOnly {
            HStack(spacing: 12) {
                Button { confirmClose = true } label: { BigButtonLabel(title: "Close Run", systemImage: "checkmark.circle") }
                    .buttonStyle(.bordered)
                Button { confirmNew = true } label: { BigButtonLabel(title: "New Run", systemImage: "plus.circle") }
                    .buttonStyle(.borderedProminent).tint(Theme.navy)
            }
        }
    }
}

struct PriorRunsSection: View {
    let shift: ShiftRecord
    let unit: RosterUnit

    var body: some View {
        let prior = shift.runs(for: unit.id).filter { $0.id != unit.activeCallID }.reversed()
        SectionBox(title: "Earlier Runs This Shift (\(prior.count))") {
            if prior.isEmpty { Text("None.").foregroundStyle(.secondary) }
            ForEach(Array(prior)) { r in
                VStack(alignment: .leading, spacing: 4) {
                    Text("Run \(r.runNumber.orDash) · \(r.priority.short) · \(r.determinant.short)").font(.headline)
                    Text("\(r.nature.orDash) / \(r.destination.orDash)")
                    Text(Milestone.allCases.map { "\($0.short) \(TimeFormat.clock(r.time($0), tz: shift.timeZone, ref: shift.operationalDate))" }.joined(separator: "  "))
                        .font(.callout.monospacedDigit())
                    if !r.notes.trimmed.isEmpty { Text(r.notes).font(.callout) }
                }
                .padding(.vertical, 6)
                Divider()
            }
        }
    }
}

struct HistorySection: View {
    let shift: ShiftRecord
    let recordIDs: Set<UUID>
    @State private var showAll = false

    var body: some View {
        let events = shift.events.filter { recordIDs.contains($0.recordID) }.sorted { $0.recordedAt > $1.recordedAt }
        let shown = showAll ? events : Array(events.prefix(15))
        SectionBox(title: "History (\(events.count))") {
            if events.isEmpty { Text("No history yet.").foregroundStyle(.secondary) }
            ForEach(shown) { e in
                VStack(alignment: .leading, spacing: 2) {
                    Text(shift.describe(e))
                    Text("\(shift.recordLabel(e.recordID)) · recorded \(TimeFormat.full(e.recordedAt, tz: shift.timeZone))\(e.initials.isEmpty ? "" : " · \(e.initials)")")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Divider()
            }
            if events.count > shown.count || showAll {
                Button(showAll ? "Show fewer" : "Show all \(events.count) entries") { showAll.toggle() }
                    .frame(minHeight: 48)
            }
        }
    }
}
