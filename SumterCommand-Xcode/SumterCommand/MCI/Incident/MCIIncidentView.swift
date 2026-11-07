// MCIIncidentView.swift
// Sumter EMS Command — MCI Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

// MARK: - Incident shell

enum MCISection: String, CaseIterable, Identifiable {
    case overview, command, triage, hospitals, transport, staging, sketch, activity
    var id: String { rawValue }
    var title: String {
        switch self {
        case .overview: return "Overview"
        case .command: return "Command"
        case .triage: return "Triage"
        case .hospitals: return "Hospitals and Aid"
        case .transport: return "Transport"
        case .staging: return "Staging"
        case .sketch: return "Sketch"
        case .activity: return "Activity"
        }
    }
    var icon: String {
        switch self {
        case .overview: return "rectangle.grid.2x2"
        case .command: return "person.3"
        case .triage: return "list.number"
        case .hospitals: return "cross.case"
        case .transport: return "car"
        case .staging: return "parkingsign"
        case .sketch: return "pencil.and.outline"
        case .activity: return "clock.arrow.circlepath"
        }
    }
}

struct MCIIncidentView: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.horizontalSizeClass) private var sizeClass
    let incidentID: UUID
    @State private var section: MCISection = .overview
    @State private var openPatient: MCIIDBox?
    @State private var showSnapshot = false
    @State private var showHandover = false
    @State private var showExport = false
    @State private var confirmClose = false
    @State private var confirmReopen = false
    @State private var adding = false

    var body: some View {
        Group {
            if let inc = store.incident(incidentID) {
                shell(inc)
            } else {
                Text("This incident is no longer available.")
            }
        }
        .onAppear { store.boardVisible = true; store.applyIdleTimer() }
        .onDisappear { store.flush(); store.boardVisible = false; store.applyIdleTimer() }
    }

    func shell(_ inc: MCIIncident) -> some View {
        VStack(spacing: 0) {
            identityBar(inc)
            MCISaveFailureBanner()
            if inc.isTraining {
                Text("TRAINING — FICTITIOUS DATA — NOT AN OPERATIONAL RECORD")
                    .font(.mciHeading(.headline)).foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 32).background(MCIStyle.slate)
            }
            if inc.isClosed {
                HStack {
                    Text("CLOSED — read-only. \(inc.provenance ?? "")").font(.headline)
                    Spacer()
                    Button("Reopen…") { confirmReopen = true }.buttonStyle(.borderedProminent).tint(MCIStyle.navy)
                }
                .padding(10).background(Color.yellow.opacity(0.25))
            }
            navigator
            ScrollView {
                content(inc)
                    .padding()
                    .frame(maxWidth: 1100)
                    .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .navigationTitle(section.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .status) { MCISaveStatus() }
            ToolbarItemGroup(placement: .primaryAction) {
                Button { store.flush(); showHandover = true } label: { Label("Handover", systemImage: "doc.plaintext") }
                Button { store.flush(); showExport = true } label: { Label("Export", systemImage: "square.and.arrow.up") }
                Menu {
                    Toggle(isOn: Binding(get: { store.data.settings.keepAwake }, set: { v in store.updateSettings { $0.keepAwake = v } })) {
                        Label("Keep Screen Awake on Board", systemImage: "sun.max")
                    }
                    if inc.isClosed {
                        Button { confirmReopen = true } label: { Label("Reopen Incident…", systemImage: "lock.open") }
                    } else {
                        Button { confirmClose = true } label: { Label("Close Incident…", systemImage: "archivebox") }
                    }
                } label: { Label("More", systemImage: "ellipsis.circle") }
            }
        }
        .fullScreenCover(item: $openPatient) { box in
            MCIPatientEditor(incidentID: incidentID, patientID: box.id, onAddAnother: addPatient).environmentObject(store)
        }
        .sheet(isPresented: $showSnapshot) { MCISnapshotSheet(incidentID: incidentID, correcting: nil).environmentObject(store) }
        .sheet(isPresented: $showHandover) { MCIHandoverSheet(incidentID: incidentID).environmentObject(store) }
        .sheet(isPresented: $showExport) { MCIExportSheet(snapshot: inc).environmentObject(store) }
        .confirmationDialog("Close this incident? It becomes read-only. Patients, counts and history are kept; nothing is reset or deleted. Export a final packet from Export.",
                            isPresented: $confirmClose, titleVisibility: .visible) {
            Button("Close Incident") {
                let t = store.now()
                let ini = store.initials
                store.update(incidentID) { $0.close(now: t, initials: ini) }
            }
        }
        .confirmationDialog("Reopen this incident for editing? The reopen is recorded in its activity.",
                            isPresented: $confirmReopen, titleVisibility: .visible) {
            Button("Reopen Incident") {
                let t = store.now()
                let ini = store.initials
                store.update(incidentID, allowClosed: true) { $0.reopen(now: t, initials: ini) }
            }
        }
    }

    func identityBar(_ inc: MCIIncident) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(inc.name.mciTrimmed.isEmpty ? "UNNAMED INCIDENT" : inc.name.uppercased())
                    .font(.mciHeading(.title)).foregroundStyle(.white).lineLimit(2)
                Text("\(inc.localNumber) · \(inc.timeZoneID) · started \(MCIFmt.full(inc.createdAt, tz: inc.timeZone))")
                    .font(.subheadline).foregroundStyle(.white.opacity(0.85))
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text("MCI LEVEL \(inc.level.uppercased())").font(.mciHeading(.headline)).foregroundStyle(.white)
                Text(section.title.uppercased()).font(.subheadline.bold()).foregroundStyle(.white.opacity(0.85))
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(MCIStyle.navy)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    var navigator: some View {
        if sizeClass == .compact {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) { navigatorButtons(width: 150) }
                    .padding(8)
            }
            .background(Color(uiColor: .secondarySystemBackground))
        } else {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 130), spacing: 6)], spacing: 6) { navigatorButtons(width: nil) }
                .padding(8)
                .background(Color(uiColor: .secondarySystemBackground))
        }
    }

    func navigatorButtons(width: CGFloat?) -> some View {
        ForEach(MCISection.allCases) { s in
                Button { store.flush(); section = s } label: {
                    Label(s.title, systemImage: s.icon)
                        .font(.subheadline.bold())
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .foregroundStyle(section == s ? Color.white : Color.primary)
                        .background(section == s ? MCIStyle.navy : MCIStyle.rowFill)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
                .frame(width: width)
                .accessibilityAddTraits(section == s ? .isSelected : [])
        }
    }

    @ViewBuilder
    func content(_ inc: MCIIncident) -> some View {
        switch section {
        case .overview:
            MCIOverviewSection(incident: inc, onAddPatient: addPatient, onSnapshot: { showSnapshot = true },
                               onGo: { section = $0 }, onOpenPatient: { openPatient = MCIIDBox(id: $0) })
        case .command: MCICommandSection(incident: inc)
        case .triage: MCITriageSection(incident: inc, onSnapshot: { showSnapshot = true })
        case .hospitals: MCIHospitalsSection(incident: inc)
        case .transport: MCITransportSection(incident: inc, onAddPatient: addPatient, onOpenPatient: { openPatient = MCIIDBox(id: $0) })
        case .staging: MCIStagingSection(incident: inc)
        case .sketch: MCISketchSection(incident: inc)
        case .activity: MCISectionBox(title: "Activity") { MCIHistoryList(incident: inc, recordIDs: nil, limit: 100) }
        }
    }

    func addPatient() {
        guard !adding else { return }
        adding = true
        store.flush()
        var newID: UUID?
        let t = store.now()
        let initials = store.initials
        store.update(incidentID) { newID = $0.addPatient(now: t, initials: initials) }
        if let newID {
            openPatient = nil
            DispatchQueue.main.async { openPatient = MCIIDBox(id: newID); adding = false }
        } else {
            adding = false
        }
    }
}
