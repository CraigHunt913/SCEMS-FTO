// ShiftHomeView.swift
// Sumter EMS Command — Shift Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

// MARK: - Home

struct HomeView: View {
    @EnvironmentObject var store: Store
    @Binding var path: [UUID]
    @State private var newShiftKind: NewShiftKind?
    @State private var showSettings = false
    @State private var showImporter = false
    @State private var importMessage: String?
    @State private var duplicateData: Data?
    @State private var archiveTarget: ShiftRecord?

    enum NewShiftKind: String, Identifiable { case operational, training; var id: String { rawValue } }

    var active: [ShiftRecord] {
        store.data.shifts.filter { $0.state == .active }.sorted { $0.createdAt > $1.createdAt }
    }
    var archived: [ShiftRecord] {
        store.data.shifts.filter { $0.state == .archived }
            .sorted { ($0.archivedAt ?? $0.createdAt) > ($1.archivedAt ?? $1.createdAt) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                BrandHeader(subtitle: "Shift Command Board")
                SaveFailureBanner()
                if !active.isEmpty {
                    SectionBox(title: "Resume Active Shift") {
                        ForEach(active) { s in activeRow(s, primary: s.id == active.first?.id) }
                    }
                }
                SectionBox(title: "Start") {
                    Button { newShiftKind = .operational } label: { BigButtonLabel(title: "New Shift", systemImage: "plus.rectangle") }
                        .buttonStyle(.borderedProminent).tint(active.isEmpty ? Theme.navy : Theme.slate)
                    Button { newShiftKind = .training } label: { BigButtonLabel(title: "New Training Shift (fictitious demo data)", systemImage: "graduationcap") }
                        .buttonStyle(.bordered)
                    Text("Starting a new shift never deletes or changes earlier shifts.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                SectionBox(title: "Archive") {
                    if archived.isEmpty {
                        Text("No archived shifts.").foregroundStyle(.secondary)
                    }
                    ForEach(archived) { s in
                        Button { path.append(s.id) } label: {
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(s.title).font(.headline)
                                    if let p = s.provenance { Text(p).font(.footnote).foregroundStyle(.secondary) }
                                }
                                Spacer()
                                if s.isTraining { TagText(text: "TRAINING", color: Theme.slate) }
                                Text("Open (read-only)").foregroundStyle(Theme.navy)
                            }
                            .frame(minHeight: 56)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                SectionBox(title: "Backups and Settings") {
                    Button { showImporter = true } label: { BigButtonLabel(title: "Import Backup as a Separate Copy…", systemImage: "square.and.arrow.down") }
                        .buttonStyle(.bordered)
                    Button { showSettings = true } label: { BigButtonLabel(title: "Settings and Built-in Checks", systemImage: "gearshape") }
                        .buttonStyle(.bordered)
                }
                SaveStatusView()
            }
            .padding()
            .frame(maxWidth: 900)
            .frame(maxWidth: .infinity)
        }
        .navigationTitle("Home")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: UUID.self) { id in BoardView(shiftID: id) }
        .sheet(item: $newShiftKind) { kind in
            NewShiftSheet(training: kind == .training, path: $path).environmentObject(store)
        }
        .sheet(isPresented: $showSettings) { SettingsView().environmentObject(store) }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [.json]) { result in
            handleImport(result)
        }
        .alert("Import", isPresented: Binding(get: { importMessage != nil }, set: { if !$0 { importMessage = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(importMessage ?? "") }
        .confirmationDialog("This backup has already been imported. Import another separate copy?",
                            isPresented: Binding(get: { duplicateData != nil }, set: { if !$0 { duplicateData = nil } }),
                            titleVisibility: .visible) {
            Button("Import Another Copy") {
                if let d = duplicateData { report(store.importBackup(d, allowDuplicate: true)) }
                duplicateData = nil
            }
        }
        .confirmationDialog("Archive this shift? It becomes read-only and stays in Archive. Nothing is deleted.",
                            isPresented: Binding(get: { archiveTarget != nil }, set: { if !$0 { archiveTarget = nil } }),
                            titleVisibility: .visible) {
            Button("Archive Shift") {
                if let s = archiveTarget { store.archive(s.id) }
                archiveTarget = nil
            }
        }
    }

    func activeRow(_ s: ShiftRecord, primary: Bool) -> some View {
        HStack(spacing: 12) {
            Button { path.append(s.id) } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Resume: \(s.title)").font(.title3.bold())
                    Text("Supervisor \(s.supervisor.orNotRecorded) · \(s.timeZoneID)").font(.subheadline)
                }
                .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
                .padding(.horizontal, 8)
            }
            .buttonStyle(.borderedProminent)
            .tint(primary ? Theme.navy : Theme.slate)
            if s.isTraining { TagText(text: "TRAINING", color: Theme.slate) }
            Button("Archive…") { archiveTarget = s }
                .buttonStyle(.bordered)
                .frame(minHeight: 48)
                .accessibilityLabel("Archive shift \(s.title)")
        }
    }

    func handleImport(_ result: Result<URL, Error>) {
        switch result {
        case .failure(let e):
            importMessage = "The file could not be opened: \(e.localizedDescription)"
        case .success(let url):
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            do {
                let d = try Data(contentsOf: url)
                let outcome = store.importBackup(d, allowDuplicate: false)
                if case .duplicate = outcome { duplicateData = d } else { report(outcome) }
            } catch {
                importMessage = "The file could not be read: \(error.localizedDescription)"
            }
        }
    }

    func report(_ outcome: Store.ImportOutcome) {
        switch outcome {
        case .imported: importMessage = "Imported as a separate, read-only restored copy. Find it under Archive; use Reopen to edit it."
        case .duplicate: importMessage = "Already imported."
        case .invalid(let msg): importMessage = msg
        }
    }
}

struct BrandHeader: View {
    let subtitle: String
    var body: some View {
        HStack(spacing: 14) {
            // Add the original shield as an image named "SumterShield" (Playgrounds: + > Insert From… > Photo/File)
            // and it appears here unaltered. Without it the layout simply omits it.
            if let shield = UIImage(named: "SumterShield") {
                Image(uiImage: shield).resizable().scaledToFit().frame(height: 72)
                    .accessibilityLabel("Sumter County EMS shield")
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("SUMTER COUNTY EMS").font(.heading(.largeTitle)).foregroundStyle(.white)
                Text(subtitle.uppercased()).font(.heading(.title3)).foregroundStyle(.white.opacity(0.9))
            }
            Spacer()
        }
        .padding(16)
        .background(Theme.navy)
        .accessibilityElement(children: .combine)
    }
}

struct NewShiftSheet: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    let training: Bool
    @Binding var path: [UUID]
    @State private var date = Date()
    @State private var label = ""
    @State private var supervisor = ""
    @State private var sheet = ""
    @State private var sourceID: UUID?
    @State private var carry = CarryForward()
    @State private var creating = false

    var candidates: [ShiftRecord] {
        store.data.shifts.filter { $0.isTraining == training }.sorted { $0.createdAt > $1.createdAt }
    }
    var source: ShiftRecord? { sourceID.flatMap { store.shift($0) } }

    var body: some View {
        NavigationStack {
            Form {
                if training {
                    Section { Text("TRAINING shift: clearly labeled fictitious data, kept separate from operational shifts and their carry-forward.").foregroundStyle(Theme.brick) }
                }
                Section("Shift") {
                    DatePicker("Date", selection: $date, displayedComponents: .date)
                    TextField("Shift (your label, e.g. A, B, Days)", text: $label)
                    TextField("Supervisor", text: $supervisor)
                    TextField("Sheet (reference)", text: $sheet)
                    Text("Operational time zone: \(store.data.settings.defaultTimeZoneID) (change in Settings)")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Section("Carry forward from") {
                    Picker("Previous shift", selection: $sourceID) {
                        Text("Nothing — use the seeded roster").tag(UUID?.none)
                        ForEach(candidates) { s in Text(s.title).tag(UUID?.some(s.id)) }
                    }
                    if let source {
                        Toggle("Roster (stations and units)", isOn: $carry.roster)
                        Toggle("Crew names (marked inherited until reviewed)", isOn: $carry.crew).disabled(!carry.roster)
                        Toggle("On-Duty Notes (marked inherited until reviewed)", isOn: $carry.systemNotes)
                        let open = source.calls.filter { $0.isOpen && source.unit($0.unitID)?.activeCallID == $0.id }
                        if carry.roster && !open.isEmpty {
                            Text("Still-active runs. Transfer keeps the same run, its history and original times:")
                                .font(.footnote)
                            ForEach(open) { c in
                                Toggle("Transfer Unit \(source.unit(c.unitID)?.name ?? "?") run \(c.runNumber.orDash) — \(c.nature.orNotRecorded)",
                                       isOn: Binding(get: { carry.transferCallIDs.contains(c.id) },
                                                     set: { on in
                                                         if on { carry.transferCallIDs.insert(c.id) } else { carry.transferCallIDs.remove(c.id) }
                                                     }))
                            }
                        }
                    }
                }
                Section {
                    Text("Never carried: unit statuses, on-duty marks, call times, holding calls, unit notes and run notes. Every unit starts Unknown and not on duty.")
                        .font(.footnote)
                }
            }
            .navigationTitle(training ? "New Training Shift" : "New Shift")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") { create() }.disabled(creating)
                }
            }
        }
    }

    func create() {
        guard !creating else { return }
        creating = true
        let tz = TimeZone(identifier: store.data.settings.defaultTimeZoneID) ?? .current
        var c = carry
        if sourceID == nil { c = CarryForward(roster: false, crew: false, systemNotes: false, transferCallIDs: []) }
        if !c.roster { c.crew = false; c.transferCallIDs = [] }
        let header = ShiftHeader(date: TimeFormat.noon(ofPicked: date, in: tz), label: label.trimmed,
                                 supervisor: supervisor.trimmed, sheet: sheet.trimmed)
        let id = store.createShift(previousID: sourceID, carry: c, header: header, training: training)
        path.append(id)
        dismiss()
    }
}
