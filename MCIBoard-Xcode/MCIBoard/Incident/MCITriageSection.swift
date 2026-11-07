// MCITriageSection.swift
// Sumter EMS Command — MCI Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

// MARK: - Triage and counting (source page 2)

struct MCITriageSection: View {
    @EnvironmentObject var store: MCIStore
    let incident: MCIIncident
    let onSnapshot: () -> Void
    @State private var correcting: MCIIDBox?
    @State private var viewReference: MCIReferenceDoc?
    @State private var showSourceBoard = false

    var body: some View {
        let inc = incident
        VStack(alignment: .leading, spacing: 16) {
            if !inc.isClosed {
                Button(action: onSnapshot) { MCIBigLabel(title: "Update Reported Count (new snapshot)", systemImage: "number") }
                    .buttonStyle(.borderedProminent).tint(MCIStyle.navy)
            }
            MCICountsPanel(incident: inc)
            MCISectionBox(title: "Running Count — Reported Snapshots") {
                if inc.snapshots.isEmpty { Text("No snapshots yet.").foregroundStyle(.secondary) }
                ForEach(inc.snapshots.sorted { $0.recordedAt > $1.recordedAt }) { s in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text("Observed \(MCIFmt.clock(s.observedAt, tz: inc.timeZone, ref: inc.refDate))").font(.headline)
                            if s.correctsID != nil { MCITag(text: "CORRECTION", color: MCIStyle.slate) }
                            Spacer()
                            Text(s.totalText).font(.headline)
                        }
                        Text(TriageCategory.allCases.map { "\($0.abbr) \(s.value($0).map(String.init) ?? "Unknown")" }.joined(separator: " · "))
                            .font(.body.monospacedDigit())
                        Text("Source \(s.reporter.mciNR) · recorded \(MCIFmt.full(s.recordedAt, tz: inc.timeZone))\(mciSuffix(s.notes, " · "))")
                            .font(.footnote).foregroundStyle(.secondary)
                        if !inc.isClosed {
                            Button("Record a Correction of This Snapshot…") { correcting = MCIIDBox(id: s.id) }
                                .buttonStyle(.bordered).frame(minHeight: 44)
                        }
                        Divider()
                    }
                }
            }
            MCIReferenceBox(onOpen: { viewReference = $0 })
            if MCIBundled.sourceBoard != nil {
                Button { showSourceBoard = true } label: {
                    MCIBigLabel(title: "Open the Original Board (page 2: How to Triage)", systemImage: "doc.text.magnifyingglass")
                }
                .buttonStyle(.bordered)
            }
        }
        .fullScreenCover(isPresented: $showSourceBoard) {
            if let url = MCIBundled.sourceBoard {
                MCIBundledPDFViewer(title: "Sumter EMS MCI Command Board", url: url, startPage: 1)
            }
        }
        .sheet(item: $correcting) { box in MCISnapshotSheet(incidentID: inc.id, correcting: box.id).environmentObject(store) }
        .fullScreenCover(item: $viewReference) { r in MCIReferenceViewer(doc: r).environmentObject(store) }
    }
}

struct MCISnapshotSheet: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.dismiss) private var dismiss
    let incidentID: UUID
    let correcting: UUID?
    @State private var values: [TriageCategory: Int?] = [:]
    @State private var observedAt = Date()
    @State private var reporter = ""
    @State private var notes = ""
    @State private var snapshotID = UUID()   // one ID per sheet: a double Save cannot add two
    @State private var loaded = false

    var known: Int { values.values.compactMap { $0 }.reduce(0, +) }
    var complete: Bool { TriageCategory.allCases.allSatisfy { (values[$0] ?? nil) != nil } }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text(correcting == nil
                         ? "Patients reportedly still on scene, as reported. This does not change the Patient Register, and adding patients never changes it."
                         : "This correction is saved as a new snapshot linked to the earlier one. The earlier snapshot is kept unchanged.")
                        .font(.callout)
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 330), spacing: 16)], spacing: 16) {
                        ForEach(TriageCategory.allCases) { c in
                            MCICountField(label: "\(c.abbr) \(c.name) (\(c.colorWord))",
                                          value: Binding(get: { values[c] ?? nil }, set: { values[c] = .some($0) }),
                                          accent: c.swatch, accentText: c.swatchText)
                        }
                    }
                    Text(complete ? "Total \(known)" : "Known subtotal \(known) — Incomplete (some categories Unknown)")
                        .font(.title2.bold())
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Observed at").font(.headline)
                        DatePicker("Observed at", selection: $observedAt, displayedComponents: [.date, .hourAndMinute])
                            .labelsHidden()
                            .environment(\.timeZone, store.incident(incidentID)?.timeZone ?? .current)
                            .environment(\.locale, Locale(identifier: "en_GB"))
                    }
                    TextField("Reported by / source", text: $reporter).textFieldStyle(.roundedBorder).frame(minHeight: 48)
                    TextField("Notes", text: $notes).textFieldStyle(.roundedBorder).frame(minHeight: 48)
                }
                .padding()
            }
            .navigationTitle(correcting == nil ? "Reported Scene Count" : "Correct Reported Count")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Record Snapshot") {
                        let t = store.now()
                        let ini = store.initials
                        let v = values
                        let sid = snapshotID
                        let obs = observedAt
                        let rep = reporter
                        let n = notes
                        let corr = correcting
                        store.update(incidentID) { $0.recordSnapshot(id: sid, values: v, observedAt: obs, reporter: rep, notes: n, correcting: corr, now: t, initials: ini) }
                        dismiss()
                    }
                    .font(.headline)
                }
            }
        }
        .onAppear {
            guard !loaded else { return }
            loaded = true
            let base = correcting.flatMap { cid in store.incident(incidentID)?.snapshots.first { $0.id == cid } }
                ?? store.incident(incidentID)?.latestSnapshot
            var v: [TriageCategory: Int?] = [:]
            for c in TriageCategory.allCases { v[c] = .some(base?.value(c)) }
            values = v
            if let base, correcting != nil { observedAt = base.observedAt ?? Date() }
        }
    }
}

struct MCIReferenceBox: View {
    @EnvironmentObject var store: MCIStore
    let onOpen: (MCIReferenceDoc) -> Void

    var body: some View {
        MCISectionBox(title: "Triage Reference") {
            Text("REFERENCE ONLY — verify against agency protocol. Category selection in this app is always manual; there is no triage algorithm, suggestion or automatic category.")
                .font(.callout.bold())
            MCISourceReferenceView()
            Text("Agency-supplied reference PDFs (Settings → Approved references):").font(.headline)
            if store.data.settings.references.isEmpty {
                Text("No reference documents added.").foregroundStyle(.secondary)
            }
            ForEach(store.data.settings.references) { r in
                Button { onOpen(r) } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(r.title.mciNR).font(.headline)
                        Text("Revision \(r.revision.mciNR) · effective \(r.effectiveDate.mciNR) · source \(r.source.mciNR)")
                            .font(.footnote)
                        Text(r.approvalRecord.mciTrimmed.isEmpty ? "No approval record entered" : "Approval record (operator-entered): \(r.approvalRecord)")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }
}

struct MCIReferenceViewer: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.dismiss) private var dismiss
    let doc: MCIReferenceDoc

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Text("REFERENCE ONLY — verify against agency protocol · \(doc.title) · rev \(doc.revision.mciNR)")
                    .font(.footnote.bold()).padding(8).frame(maxWidth: .infinity).background(Color.yellow.opacity(0.25))
                if FileManager.default.fileExists(atPath: store.referenceURL(doc).path) {
                    MCIPDFPreview(url: store.referenceURL(doc))
                } else {
                    Text("The document file is missing from this iPad.").padding().frame(maxHeight: .infinity)
                }
            }
            .navigationTitle(doc.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}
