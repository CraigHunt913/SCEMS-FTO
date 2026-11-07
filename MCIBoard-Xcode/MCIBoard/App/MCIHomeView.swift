// MCIHomeView.swift
// Sumter EMS Command — MCI Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

// MARK: - Root and Home

struct MCIRootView: View {
    @StateObject private var store = MCIStore()
    @Environment(\.scenePhase) private var scenePhase
    @State private var path: [UUID] = []

    var body: some View {
        ZStack {
            NavigationStack(path: $path) {
                if let problem = store.loadProblem {
                    MCIRecoveryView(problem: problem)
                } else {
                    MCIHomeView(path: $path)
                }
            }
            // Cover only once the app is in the background (app switcher). Covering on "inactive"
            // also fires during keyboard and system prompts, which can drop text-field focus.
            if scenePhase == .background {
                ZStack {
                    MCIStyle.navy.ignoresSafeArea()
                    VStack(spacing: 8) {
                        Text("SUMTER EMS — MCI BOARD").font(.mciHeading(.largeTitle)).foregroundStyle(.white)
                        Text("Board hidden while the app is not active").foregroundStyle(.white.opacity(0.85))
                    }
                }
            }
        }
        .environmentObject(store)
        .onChange(of: scenePhase) { phase in
            if phase == .active { store.applyIdleTimer() } else { store.flush(); UIApplication.shared.isIdleTimerDisabled = false }
        }
    }
}

struct MCIRecoveryView: View {
    @EnvironmentObject var store: MCIStore
    let problem: String
    @State private var confirm = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Saved Incidents Could Not Be Opened").font(.mciHeading(.largeTitle))
                Text(problem)
                Text("Nothing has been deleted or replaced, and saving is paused so the file cannot be overwritten. Try again (for example after freeing storage), or move the unreadable file aside and start empty; the moved file stays in this app's Documents/MCIBoard folder.")
                Button { store.load() } label: { MCIBigLabel(title: "Try Loading Again", systemImage: "arrow.clockwise") }
                    .buttonStyle(.borderedProminent).tint(MCIStyle.navy)
                Button(role: .destructive) { confirm = true } label: { MCIBigLabel(title: "Move Unreadable File Aside…", systemImage: "folder") }
                    .buttonStyle(.bordered)
            }
            .padding(24).frame(maxWidth: 760)
        }
        .confirmationDialog("Move the unreadable file aside and start with no incidents?", isPresented: $confirm, titleVisibility: .visible) {
            Button("Move Aside and Start Empty", role: .destructive) { store.setAsideUnreadableFile() }
        }
    }
}

struct MCIHomeView: View {
    @EnvironmentObject var store: MCIStore
    @Binding var path: [UUID]
    @State private var showSettings = false
    @State private var showImporter = false
    @State private var importMessage: String?
    @State private var duplicateData: Data?
    @State private var creating = false

    var open: [MCIIncident] { store.data.incidents.filter { $0.state == .open }.sorted { $0.createdAt > $1.createdAt } }
    var closed: [MCIIncident] {
        store.data.incidents.filter { $0.state == .closed }.sorted { ($0.closedAt ?? $0.createdAt) > ($1.closedAt ?? $1.createdAt) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack(spacing: 14) {
                    if let shield = MCIShield.image {
                        Image(uiImage: shield).resizable().scaledToFit().frame(height: 72)
                            .accessibilityLabel("Sumter County EMS shield")
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text("SUMTER COUNTY EMS").font(.mciHeading(.largeTitle)).foregroundStyle(.white)
                        Text("MCI INCIDENT COMMAND BOARD").font(.mciHeading(.title3)).foregroundStyle(.white.opacity(0.9))
                    }
                    Spacer()
                }
                .padding(16)
                .background(MCIStyle.navy)
                MCISaveFailureBanner()
                if !open.isEmpty {
                    MCISectionBox(title: "Resume Open Incident") {
                        ForEach(open) { i in incidentButton(i, primary: i.id == open.first?.id) }
                    }
                }
                MCISectionBox(title: "Start") {
                    Button { create(training: false) } label: { MCIBigLabel(title: "New Incident", systemImage: "exclamationmark.triangle") }
                        .buttonStyle(.borderedProminent).tint(MCIStyle.navy).disabled(creating)
                    Button { create(training: true) } label: { MCIBigLabel(title: "New Training Incident (fictitious data)", systemImage: "graduationcap") }
                        .buttonStyle(.bordered).disabled(creating)
                    Text("A new incident opens immediately with a local ID. Name, location and details can be added later. Nothing needs a network or account.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                MCISectionBox(title: "Closed Incidents") {
                    if closed.isEmpty { Text("None.").foregroundStyle(.secondary) }
                    ForEach(closed) { i in
                        Button { path.append(i.id) } label: {
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(i.displayName).font(.headline)
                                    if let p = i.provenance { Text(p).font(.footnote).foregroundStyle(.secondary) }
                                }
                                Spacer()
                                if i.isTraining { MCITag(text: "TRAINING", color: MCIStyle.slate) }
                                Text("Open (read-only)").foregroundStyle(MCIStyle.navy)
                            }
                            .frame(minHeight: 56).contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                MCISectionBox(title: "Backups and Settings") {
                    Button { showImporter = true } label: { MCIBigLabel(title: "Import Incident Backup as a Separate Copy…", systemImage: "square.and.arrow.down") }
                        .buttonStyle(.bordered)
                    Button { showSettings = true } label: { MCIBigLabel(title: "Settings, Directories and Built-in Checks", systemImage: "gearshape") }
                        .buttonStyle(.bordered)
                }
                Text("This iPad holds the working copy. Exports and backups are copies; other devices do not see live updates.")
                    .font(.footnote).foregroundStyle(.secondary)
                MCISaveStatus()
            }
            .padding()
            .frame(maxWidth: 900)
            .frame(maxWidth: .infinity)
        }
        .navigationTitle("MCI Board")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: UUID.self) { id in MCIIncidentView(incidentID: id) }
        .sheet(isPresented: $showSettings) { MCISettingsView().environmentObject(store) }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [.json]) { result in handleImport(result) }
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
        .onAppear { creating = false }
    }

    func create(training: Bool) {
        guard !creating else { return }
        creating = true
        let id = store.newIncident(training: training)
        path.append(id)
    }

    func incidentButton(_ i: MCIIncident, primary: Bool) -> some View {
        Button { path.append(i.id) } label: {
            VStack(alignment: .leading, spacing: 4) {
                Text("Resume: \(i.displayName)").font(.title3.bold())
                Text("\(i.isTraining ? "TRAINING · " : "")Started \(MCIFmt.full(i.createdAt, tz: i.timeZone)) · \(i.activePatients.count) tracked patients")
                    .font(.subheadline)
            }
            .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
            .padding(.horizontal, 8)
        }
        .buttonStyle(.borderedProminent)
        .tint(primary ? MCIStyle.navy : MCIStyle.slate)
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

    func report(_ o: MCIStore.ImportOutcome) {
        switch o {
        case .imported: importMessage = "Imported as a separate, read-only restored copy under Closed Incidents. Use Reopen to edit it."
        case .duplicate: importMessage = "Already imported."
        case .invalid(let m): importMessage = m
        }
    }
}
