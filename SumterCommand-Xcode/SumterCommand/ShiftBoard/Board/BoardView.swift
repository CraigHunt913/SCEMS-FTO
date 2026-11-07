// BoardView.swift
// Sumter EMS Command — Shift Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

// MARK: - Board

struct BoardView: View {
    @EnvironmentObject var store: Store
    let shiftID: UUID
    @State private var editingUnit: IDBox?
    @State private var sheet: BoardSheet?
    @State private var confirmArchive = false
    @State private var confirmReopen = false
    @State private var addingCall = false

    enum BoardSheet: Identifiable {
        case header, system, roster, export, pending(UUID)
        var id: String {
            switch self {
            case .header: return "header"
            case .system: return "system"
            case .roster: return "roster"
            case .export: return "export"
            case .pending(let id): return "pending-\(id.uuidString)"
            }
        }
    }

    var body: some View {
        Group {
            if let shift = store.shift(shiftID) {
                board(shift)
            } else {
                Text("This shift is no longer available.")
            }
        }
        .onAppear { store.boardVisible = true; store.applyIdleTimer() }
        .onDisappear { store.flush(); store.boardVisible = false; store.applyIdleTimer() }
    }

    func board(_ shift: ShiftRecord) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
                SaveFailureBanner()
                banners(shift)
                HeaderStrip(shift: shift) { sheet = .header }
                SystemStrip(shift: shift) { sheet = .system }
                    .padding(.vertical, 12)
                PendingSection(shift: shift, adding: addingCall, onAdd: addCall) { id in sheet = .pending(id) }
                    .padding(.bottom, 12)
                ForEach(shift.orderedStations) { st in
                    Section {
                        let list = shift.stationUnits(st.id)
                        if list.isEmpty {
                            Text("No units at this station.").foregroundStyle(.secondary).padding()
                        }
                        ForEach(Array(list.enumerated()), id: \.element.id) { idx, u in
                            Button { store.flush(); editingUnit = IDBox(id: u.id) } label: {
                                UnitRow(shift: shift, unit: u, striped: idx % 2 == 1)
                            }
                            .buttonStyle(.plain)
                            .accessibilityHint("Opens the editor for unit \(u.name)")
                            Divider()
                        }
                    } header: {
                        StationHeader(station: st, count: shift.stationUnits(st.id).count)
                    }
                }
                Text("Handwriting on this board is an attachment only; it never changes statuses, times or counts.")
                    .font(.footnote).foregroundStyle(.secondary).padding()
            }
        }
        .navigationTitle(shift.isTraining ? "TRAINING Shift Board" : "Shift Board")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .status) { SaveStatusView() }
            ToolbarItemGroup(placement: .primaryAction) {
                Button { store.flush(); sheet = .export } label: { Label("Export", systemImage: "square.and.arrow.up") }
                Menu {
                    Button { sheet = .roster } label: { Label("Roster and Stations", systemImage: "list.bullet") }
                        .disabled(shift.isReadOnly)
                    Toggle(isOn: Binding(get: { store.data.settings.keepAwake },
                                         set: { v in store.updateSettings { $0.keepAwake = v } })) {
                        Label("Keep Screen Awake on Board", systemImage: "sun.max")
                    }
                    if shift.isReadOnly {
                        Button { confirmReopen = true } label: { Label("Reopen Shift…", systemImage: "lock.open") }
                    } else {
                        Button { confirmArchive = true } label: { Label("Archive Shift…", systemImage: "archivebox") }
                    }
                } label: {
                    Label("More", systemImage: "ellipsis.circle")
                }
            }
        }
        .fullScreenCover(item: $editingUnit) { box in
            UnitEditorView(shiftID: shiftID, unitID: box.id).environmentObject(store)
        }
        .sheet(item: $sheet, onDismiss: { store.flush(); addingCall = false }) { which in
            sheetContent(which, shift).environmentObject(store)
        }
        .confirmationDialog("Archive this shift? It becomes read-only and stays in Archive. Nothing is deleted.",
                            isPresented: $confirmArchive, titleVisibility: .visible) {
            Button("Archive Shift") { store.archive(shiftID) }
        }
        .confirmationDialog("Reopen this shift for editing? The reopen is recorded in its history.",
                            isPresented: $confirmReopen, titleVisibility: .visible) {
            Button("Reopen Shift") { store.reopen(shiftID) }
        }
    }

    @ViewBuilder
    func sheetContent(_ which: BoardSheet, _ shift: ShiftRecord) -> some View {
        switch which {
        case .header: HeaderEditor(shiftID: shiftID)
        case .system: SystemEditor(shiftID: shiftID)
        case .roster: RosterEditor(shiftID: shiftID)
        case .export: ExportSheet(snapshot: shift)
        case .pending(let id): PendingEditorView(shiftID: shiftID, pendingID: id)
        }
    }

    @ViewBuilder
    func banners(_ shift: ShiftRecord) -> some View {
        if shift.isTraining {
            Text("TRAINING — FICTITIOUS DATA — NOT AN OPERATIONAL RECORD")
                .font(.heading(.headline)).foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 36).background(Theme.slate)
        }
        if shift.isReadOnly {
            HStack {
                Text("ARCHIVED — read-only. \(shift.provenance ?? "")").font(.headline)
                Spacer()
                Button("Reopen…") { confirmReopen = true }.buttonStyle(.borderedProminent).tint(Theme.navy)
            }
            .padding(12)
            .background(Color.yellow.opacity(0.25))
        }
    }

    func addCall() {
        guard !addingCall else { return }
        addingCall = true
        var newID: UUID?
        let t = store.now()
        let initials = store.data.settings.initials
        store.update(shiftID) { s in newID = s.addPending(now: t, initials: initials) }
        if let newID { sheet = .pending(newID) } else { addingCall = false }
    }
}

struct StationHeader: View {
    let station: Station
    let count: Int
    var body: some View {
        HStack {
            Text("STATION \(station.number) / \(station.name)").font(.heading(.title3)).foregroundStyle(.white)
            Spacer()
            Text("\(count) unit\(count == 1 ? "" : "s")").font(.subheadline).foregroundStyle(.white.opacity(0.85))
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
        .background(Theme.navy)
        .accessibilityAddTraits(.isHeader)
    }
}

struct HeaderStrip: View {
    let shift: ShiftRecord
    let onEdit: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("SHIFT COMMAND BOARD").font(.heading(.title2)).foregroundStyle(.white)
                Spacer()
                if !shift.isReadOnly {
                    Button("Edit Header", action: onEdit)
                        .buttonStyle(.bordered).tint(.white)
                        .frame(minHeight: 48)
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 8)
            .background(Theme.navy)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 190), alignment: .topLeading)], alignment: .leading, spacing: 10) {
                FieldValue(label: "Date", value: TimeFormat.day(shift.operationalDate, tz: shift.timeZone))
                FieldValue(label: "Shift", value: shift.shiftLabel.orNotRecorded)
                FieldValue(label: "Supervisor", value: shift.supervisor.orNotRecorded)
                FieldValue(label: "Sheet", value: shift.sheetRef.orNotRecorded)
                FieldValue(label: "Time zone", value: shift.timeZoneID)
            }
            .padding(14)
        }
    }
}

struct FieldValue: View {
    let label: String
    let value: String
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased()).font(.caption.bold()).foregroundStyle(.secondary)
            Text(value).font(.body).foregroundStyle(value == "Not recorded" ? .secondary : .primary)
        }
        .accessibilityElement(children: .combine)
    }
}

struct SystemStrip: View {
    let shift: ShiftRecord
    let onEdit: () -> Void
    @State private var showDefinition = false

    var body: some View {
        let c = BoardCounts.of(shift.units)
        let tz = shift.timeZone
        let ref = shift.operationalDate
        SectionBox(title: "System Status") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 10)], spacing: 10) {
                CountTile(label: "Trucks in Service", value: c.inService, emphasis: true)
                CountTile(label: "Available Now (AVL)", value: c.available)
                CountTile(label: "Status Unknown", value: c.unknown)
                CountTile(label: "Out of Service", value: c.oos)
                CountTile(label: "On Duty", value: c.onDuty)
                CountTile(label: "Not on Duty", value: c.offDuty)
            }
            Button(showDefinition ? "Hide counting rules" : "How these are counted") { showDefinition.toggle() }
                .frame(minHeight: 44)
            if showDefinition { Text(BoardCounts.definition).font(.callout) }
            Divider()
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 240), alignment: .topLeading)], alignment: .leading, spacing: 10) {
                FieldValue(label: "Status Level (manual)", value: observed(shift.system.statusLevel, shift.system.statusLevelUpdatedAt, tz, ref))
                FieldValue(label: "Weather (manual)", value: observed(shift.system.weather, shift.system.weatherUpdatedAt, tz, ref))
                FieldValue(label: "Hospital Divert (manual)", value: observed(shift.system.hospitalDivert, shift.system.hospitalDivertUpdatedAt, tz, ref))
            }
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("ON-DUTY NOTES").font(.caption.bold()).foregroundStyle(.secondary)
                    if let m = shift.system.onDutyNotesInherited, !m.reviewed {
                        TagText(text: "INHERITED — REVIEW")
                    }
                }
                Text(shift.system.onDutyNotes.orNotRecorded).lineLimit(3)
                    .foregroundStyle(shift.system.onDutyNotes.trimmed.isEmpty ? .secondary : .primary)
            }
            if !shift.isReadOnly {
                Button(action: onEdit) { BigButtonLabel(title: "Edit System Status and Notes", systemImage: "square.and.pencil") }
                    .buttonStyle(.bordered)
            } else {
                Button(action: onEdit) { BigButtonLabel(title: "View System Status and Notes", systemImage: "doc.text") }
                    .buttonStyle(.bordered)
            }
        }
        .padding(.horizontal, 12)
    }

    func observed(_ v: String, _ at: Date?, _ tz: TimeZone, _ ref: Date) -> String {
        if v.trimmed.isEmpty { return "Not recorded" }
        return "\(v) (updated \(TimeFormat.clock(at, tz: tz, ref: ref)))"
    }
}

struct CountTile: View {
    let label: String
    let value: Int
    var emphasis = false
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(value)").font(.system(.largeTitle, design: .rounded, weight: .bold).monospacedDigit())
            Text(label).font(.subheadline.bold())
        }
        .padding(10)
        .frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
        .foregroundStyle(emphasis ? Color.white : Color.primary)
        .background(emphasis ? Theme.navy : Theme.rowFill)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .accessibilityElement(children: .combine)
    }
}

struct UnitRow: View {
    let shift: ShiftRecord
    let unit: RosterUnit
    let striped: Bool
    @Environment(\.horizontalSizeClass) private var sizeClass

    var run: CallRecord? { shift.activeCall(for: unit.id) }

    var crewText: String { unit.crew.trimmed.isEmpty ? "Crew not recorded" : unit.crew }
    var runText: String {
        guard let run else { return "No active run" }
        return "Run \(run.runNumber.orDash) · \(run.priority.short) · \(run.determinant.short)"
    }
    var natureText: String {
        guard let run else { return "—" }
        return "\(run.nature.orDash) / \(run.destination.orDash)"
    }
    var updatedText: String {
        guard let d = unit.statusChangedAt else { return "No update" }
        return "Upd \(TimeFormat.clock(d, tz: shift.timeZone, ref: shift.operationalDate))"
    }

    var body: some View {
        Group {
            if sizeClass == .regular {
                HStack(alignment: .top, spacing: 14) {
                    identity.frame(width: 110, alignment: .leading)
                    StatusBadge(status: unit.status).frame(width: 84, alignment: .leading)
                    crew.frame(minWidth: 140, maxWidth: .infinity, alignment: .leading)
                    Text(runText).font(.body).frame(width: 190, alignment: .leading)
                    Text(natureText).lineLimit(2).frame(minWidth: 160, maxWidth: .infinity, alignment: .leading)
                    Text(updatedText).font(.subheadline).foregroundStyle(.secondary).frame(width: 96, alignment: .trailing)
                }
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 12) {
                        identity
                        StatusBadge(status: unit.status)
                        Spacer()
                        Text(updatedText).font(.subheadline).foregroundStyle(.secondary)
                    }
                    crew
                    Text(runText)
                    Text(natureText).lineLimit(2)
                }
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
        .background(striped ? Theme.rowFill : Color(uiColor: .systemBackground))
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Unit \(unit.name), \(unit.onDuty ? "on duty" : "not on duty"), status \(unit.status.fullName), \(crewText), \(runText), \(natureText), \(updatedText)")
    }

    var identity: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(unit.name).font(.heading(.title))
            Text(unit.onDuty ? "ON DUTY" : "NOT ON DUTY").font(.caption.bold())
                .foregroundStyle(unit.onDuty ? Theme.navy : .secondary)
        }
    }

    var crew: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(crewText).lineLimit(2).foregroundStyle(unit.crew.trimmed.isEmpty ? .secondary : .primary)
            if let m = unit.crewInherited, !m.reviewed { TagText(text: "INHERITED — REVIEW") }
        }
    }
}

struct PendingSection: View {
    let shift: ShiftRecord
    let adding: Bool
    let onAdd: () -> Void
    let onOpen: (UUID) -> Void

    var ordered: [PendingCall] {
        let rank: [PendingState: Int] = [.pending: 0, .assigned: 1, .cancelled: 2]
        return shift.pending.sorted {
            (rank[$0.state] ?? 3, $0.createdAt) < (rank[$1.state] ?? 3, $1.createdAt)
        }
    }

    var body: some View {
        SectionBox(title: "Calls Holding / Pending", accent: Theme.brick) {
            if !shift.isReadOnly {
                Button(action: onAdd) { BigButtonLabel(title: "Add Call", systemImage: "plus") }
                    .buttonStyle(.borderedProminent).tint(Theme.navy)
                    .disabled(adding)
            }
            if shift.pending.isEmpty {
                Text("No calls holding.").foregroundStyle(.secondary)
            }
            ForEach(Array(ordered.enumerated()), id: \.element.id) { idx, p in
                Button { onOpen(p.id) } label: { PendingRow(shift: shift, call: p, striped: idx % 2 == 1) }
                    .buttonStyle(.plain)
                    .accessibilityHint("Opens this holding call")
            }
        }
        .padding(.horizontal, 12)
    }
}

struct PendingRow: View {
    let shift: ShiftRecord
    let call: PendingCall
    let striped: Bool
    @Environment(\.horizontalSizeClass) private var sizeClass

    var assignedNames: String {
        let names = call.assignedCallIDs.compactMap { cid in
            shift.calls.first { $0.id == cid }.flatMap { shift.unit($0.unitID)?.name }
        }
        return names.isEmpty ? "Unassigned" : names.joined(separator: ", ")
    }

    var body: some View {
        Group {
            if sizeClass == .compact {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 10) { stateTag; timeBlock }
                    details
                    Text(assignedNames).font(.subheadline.bold())
                }
            } else {
                HStack(alignment: .top, spacing: 12) {
                    timeBlock.frame(width: 170, alignment: .leading)
                    stateTag
                    details.frame(maxWidth: .infinity, alignment: .leading)
                    Text(assignedNames).font(.subheadline.bold())
                }
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
        .background(striped ? Theme.rowFill : Color(uiColor: .systemBackground))
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    var stateTag: some View {
        TagText(text: call.state.label.uppercased(),
                color: call.state == .pending ? Theme.brick : (call.state == .assigned ? Theme.navy : Color(white: 0.4)))
    }

    var details: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Run \(call.runNumber.orDash) · \(call.priority.short) · \(call.determinant.short)").font(.headline)
            Text(call.nature.orNotRecorded).lineLimit(2)
            Text(call.location.orNotRecorded).lineLimit(1).foregroundStyle(.secondary)
        }
    }

    var timeBlock: some View {
            VStack(alignment: .leading, spacing: 2) {
                Text(call.timeIn == nil ? "Time In not recorded" : "In \(TimeFormat.clock(call.timeIn, tz: shift.timeZone, ref: shift.operationalDate))")
                    .font(.headline.monospacedDigit())
                if call.state == .pending, let t = call.timeIn {
                    TimelineView(.periodic(from: .now, by: 30)) { ctx in
                        Text("Holding \(TimeFormat.elapsed(from: t, to: ctx.date))").font(.subheadline)
                    }
                } else if call.state == .pending {
                    Text("Holding time unknown").font(.subheadline).foregroundStyle(.secondary)
                }
            }
    }
}
