// MCISettingsView.swift
// Sumter EMS Command — MCI Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

// MARK: - Settings

struct MCISettingsView: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.dismiss) private var dismiss
    @State private var tzText = ""
    @State private var message: String?
    @State private var levelsText = ""
    @State private var checklistText = ""
    @State private var rolesText = ""
    @State private var groundText = ""
    @State private var airText = ""
    @State private var reminderText = ""
    @State private var newHospital = ""
    @State private var showRefImporter = false
    @State private var showSketchImporter = false
    @State private var refMeta = MCIReferenceDoc(id: UUID(), title: "", revision: "", effectiveDate: "", source: "", approvalRecord: "", fileName: "", addedAt: Date())
    @State private var results: [MCICheckResult] = []
    @State private var loaded = false
    @State private var staffText = ""
    @State private var unitText = ""
    @State private var assignmentText = ""
    @State private var typeText = ""
    @State private var showStaffImporter = false

    func lines(_ s: String) -> [String] { s.split(separator: "\n").map { String($0).mciTrimmed }.filter { !$0.isEmpty } }

    func importStaff(_ result: Result<URL, Error>) {
        guard case .success(let url) = result else { message = "The file could not be opened."; return }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let raw = try? String(contentsOf: url, encoding: .utf8) else { message = "The file could not be read as text."; return }
        let names: [String] = raw.split(whereSeparator: { $0.isNewline || $0 == "," })
            .map { String($0).mciTrimmed }.filter { !$0.isEmpty }
        store.updateSettings { $0.pickStaff = names }
        staffText = names.joined(separator: "\n")
        message = "Imported \(names.count) names into the staff list."
    }

    var body: some View {
        NavigationStack {
            Form {
                Group {
                    Section("Operational time zone for new incidents") {
                        Text("Current: \(store.data.settings.defaultTimeZoneID)")
                        TextField("e.g. America/New_York", text: $tzText).textInputAutocapitalization(.never).autocorrectionDisabled()
                        Button("Apply") {
                            if let tz = TimeZone(identifier: tzText.mciTrimmed) {
                                store.updateSettings { $0.defaultTimeZoneID = tz.identifier }
                                message = "New incidents will use \(tz.identifier)."
                            } else { message = "Not a recognised time zone identifier." }
                        }
                    }
                    Section {
                        TextField("Initials (optional)", text: Binding(get: { store.data.settings.initials },
                                                                       set: { v in store.updateSettings(debounce: true) { $0.initials = v } }))
                        Toggle("Keep screen awake while an incident is open",
                               isOn: Binding(get: { store.data.settings.keepAwake }, set: { v in store.updateSettings { $0.keepAwake = v } }))
                    } header: { Text("Operator") } footer: { Text("Initials are a label on activity entries, not a sign-in.") }
                    if let message { Section { Text(message) } }
                }
                Group {
                    Section {
                        TextField("One level per line", text: $levelsText, axis: .vertical).lineLimit(3...8)
                        Button("Save MCI Levels") { store.updateSettings { $0.levels = lines(levelsText) }; message = "Levels saved." }
                    } header: { Text("MCI levels") } footer: { Text("Labels only. No patient-number thresholds or automatic escalation.") }
                    Section {
                        TextField("One action per line", text: $checklistText, axis: .vertical).lineLimit(6...20)
                        Button("Save Checklist Template (new version)") {
                            store.updateSettings { s in s.checklist = lines(checklistText); s.checklistVersion += 1 }
                            message = "Checklist template saved as version \(store.data.settings.checklistVersion). Existing incidents keep their own copy."
                        }
                    } header: { Text("Initial actions checklist template (v\(store.data.settings.checklistVersion))") } footer: {
                        Text("Agency review of these entries happens here, outside an incident. Each incident keeps the version it started with.")
                    }
                    Section("Assignment roles for new incidents") {
                        TextField("One role per line", text: $rolesText, axis: .vertical).lineLimit(6...20)
                        Button("Save Roles") { store.updateSettings { $0.roles = lines(rolesText) }; message = "Roles saved for new incidents." }
                    }
                }
                Group {
                    Section {
                        ForEach(store.data.settings.hospitals) { h in
                            HStack {
                                TextField("Name", text: Binding(get: { store.data.settings.hospitals.first { $0.id == h.id }?.name ?? "" },
                                                                set: { v in store.updateSettings(debounce: true) { s in if let k = s.hospitals.firstIndex(where: { $0.id == h.id }) { s.hospitals[k].name = v } } }))
                                Toggle("Active", isOn: Binding(get: { store.data.settings.hospitals.first { $0.id == h.id }?.active ?? false },
                                                               set: { v in store.updateSettings { s in if let k = s.hospitals.firstIndex(where: { $0.id == h.id }) { s.hospitals[k].active = v } } }))
                                    .frame(maxWidth: 140)
                            }
                        }
                        HStack {
                            TextField("Add facility", text: $newHospital)
                            Button("Add") {
                                let n = newHospital.mciTrimmed
                                guard !n.isEmpty else { return }
                                store.updateSettings { $0.hospitals.append(MCIDirectoryEntry(id: UUID(), name: n, active: true)) }
                                newHospital = ""
                            }
                        }
                    } header: { Text("Hospital directory") } footer: {
                        Text("Seeded from the supplied PDF; not independently verified. Renaming or deactivating here never changes names stored in earlier incidents.")
                    }
                    Section("Mutual aid agencies (one per line)") {
                        TextField("Agencies", text: $groundText, axis: .vertical).lineLimit(4...12)
                        Button("Save Agencies") { store.updateSettings { $0.groundAgencies = lines(groundText) }; message = "Agencies saved." }
                    }
                    Section {
                        TextField("Staff names / call signs, one per line", text: $staffText, axis: .vertical).lineLimit(3...12)
                        Button("Save Staff List") { store.updateSettings { $0.pickStaff = lines(staffText) }; message = "Staff list saved." }
                        Button("Import Staff List from a Text File…") { showStaffImporter = true }
                            .fileImporter(isPresented: $showStaffImporter, allowedContentTypes: [.plainText, .commaSeparatedText]) { result in
                                importStaff(result)
                            }
                        TextField("Units, one per line", text: $unitText, axis: .vertical).lineLimit(3...12)
                        Button("Save Units") { store.updateSettings { $0.pickUnits = lines(unitText) }; message = "Units saved." }
                        TextField("Assignments, one per line", text: $assignmentText, axis: .vertical).lineLimit(3...12)
                        Button("Save Assignments") { store.updateSettings { $0.pickAssignments = lines(assignmentText) }; message = "Assignments saved." }
                        TextField("Resource types, one per line", text: $typeText, axis: .vertical).lineLimit(3...12)
                        Button("Save Resource Types") { store.updateSettings { $0.pickResourceTypes = lines(typeText) }; message = "Resource types saved." }
                    } header: { Text("Pick lists (tap-to-fill choices)") } footer: {
                        Text("These fill the Pick buttons for roles, transport units and staging. A text file with one name per line (or commas) can be imported from Files, so no typing is needed.")
                    }
                    Section("Air services (one per line)") {
                        TextField("Services", text: $airText, axis: .vertical).lineLimit(2...6)
                        Button("Save Air Services") { store.updateSettings { $0.airServices = lines(airText) }; message = "Air services saved." }
                    }
                    Section {
                        TextField("Minutes (blank = off)", text: $reminderText).keyboardType(.numberPad)
                        Button("Save Reminder") {
                            let v = Int(reminderText.filter(\.isNumber))
                            store.updateSettings { $0.pollReminderMinutes = v }
                            message = v == nil ? "Bed-poll reminder off." : "Polls older than \(v!) minutes show Needs Update."
                        }
                    } header: { Text("Bed-poll reminder") } footer: { Text("A local reminder only, not a medical or agency standard.") }
                }
                Group {
                    Section {
                        Button("Use a Different Scene Sketch Cards PDF…") { showSketchImporter = true }
                    } header: { Text("Scene sketch cards") } footer: { Text("The Sumter EMS Scene Sketch Cards are built in. Only add a PDF here to replace them. Pages 1–3: Roadway / MVC, Structure A/B/C/D, Large Facility / Nursing Home.") }
                    Section {
                        TextField("Title", text: $refMeta.title)
                        TextField("Revision", text: $refMeta.revision)
                        TextField("Effective date", text: $refMeta.effectiveDate)
                        TextField("Source", text: $refMeta.source)
                        TextField("Approval record (who/when, operator-entered)", text: $refMeta.approvalRecord)
                        Button("Choose PDF and Add Reference…") { showRefImporter = true }.disabled(refMeta.title.mciTrimmed.isEmpty)
                        ForEach(store.data.settings.references) { r in
                            Text("\(r.title) · rev \(r.revision.mciNR) · \(r.approvalRecord.mciTrimmed.isEmpty ? "no approval record" : "approval record entered")")
                        }
                    } header: { Text("Approved references (optional)") } footer: {
                        Text("Approval details are what you type; they are a record, not proof of institutional approval. Missing approval never blocks the board.")
                    }
                    Section {
                        Button("Run Built-in Checks") { results = MCIChecks.run() }.frame(minHeight: 48)
                        if !results.isEmpty {
                            let passed = results.filter(\.passed).count
                            Text("\(passed) of \(results.count) passed").font(.headline)
                                .foregroundStyle(passed == results.count ? Color.green : MCIStyle.brick)
                        }
                        ForEach(results) { r in
                            VStack(alignment: .leading, spacing: 2) {
                                Label(r.name, systemImage: r.passed ? "checkmark.circle.fill" : "xmark.octagon.fill")
                                    .foregroundStyle(r.passed ? Color.green : MCIStyle.brick)
                                if !r.detail.isEmpty { Text(r.detail).font(.footnote) }
                            }
                        }
                    } header: { Text("Built-in checks") } footer: { Text("Run the incident rules on throwaway fictitious data in memory. Saved incidents are not touched.") }
                    Section("About this data") {
                        Text("Stored only on this iPad in this app's Documents folder with iOS file protection. No network, cloud or account. iPad backups (iCloud or computer) may include app data depending on your settings. This is a coordination board — not an ePCR, triage decision tool, dispatch interface or verified hospital-capacity service — and is not certified, agency-approved or NIMS/ICS-compliance software.")
                            .font(.footnote)
                    }
                }
            }
            .navigationTitle("MCI Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { store.flush(); dismiss() } } }
            .fileImporter(isPresented: $showRefImporter, allowedContentTypes: [.pdf]) { result in
                if case .success(let url) = result {
                    var meta = refMeta
                    meta.id = UUID()
                    meta.addedAt = Date()
                    message = store.importReference(url, meta: meta) ?? "Reference added."
                    refMeta = MCIReferenceDoc(id: UUID(), title: "", revision: "", effectiveDate: "", source: "", approvalRecord: "", fileName: "", addedAt: Date())
                }
            }
            .background(EmptyView().fileImporter(isPresented: $showSketchImporter, allowedContentTypes: [.pdf]) { result in
                if case .success(let url) = result { message = store.importSketchPDF(url) ?? "Sketch cards PDF added." }
            })
        }
        .onAppear {
            guard !loaded else { return }
            loaded = true
            let s = store.data.settings
            levelsText = s.levels.joined(separator: "\n")
            checklistText = s.checklist.joined(separator: "\n")
            rolesText = s.roles.joined(separator: "\n")
            groundText = s.groundAgencies.joined(separator: "\n")
            airText = s.airServices.joined(separator: "\n")
            reminderText = s.pollReminderMinutes.map(String.init) ?? ""
            staffText = s.staffList.joined(separator: "\n")
            unitText = s.unitList.joined(separator: "\n")
            assignmentText = s.assignmentList.joined(separator: "\n")
            typeText = s.resourceTypeList.joined(separator: "\n")
        }
    }
}
