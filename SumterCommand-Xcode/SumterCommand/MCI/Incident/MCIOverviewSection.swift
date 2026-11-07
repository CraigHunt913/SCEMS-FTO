// MCIOverviewSection.swift
// Sumter EMS Command — MCI Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

// MARK: - Overview

struct MCIOverviewSection: View {
    let incident: MCIIncident
    let onAddPatient: () -> Void
    let onSnapshot: () -> Void
    let onGo: (MCISection) -> Void
    let onOpenPatient: (UUID) -> Void

    var body: some View {
        let inc = incident
        VStack(alignment: .leading, spacing: 16) {
            if !inc.isClosed {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 220), spacing: 10)], spacing: 10) {
                    Button(action: onAddPatient) { MCIBigLabel(title: "Add Patient", systemImage: "person.badge.plus") }
                        .buttonStyle(.borderedProminent).tint(MCIStyle.navy)
                    Button(action: onSnapshot) { MCIBigLabel(title: "Update Reported Count", systemImage: "number") }
                        .buttonStyle(.borderedProminent).tint(MCIStyle.navy)
                    Button { onGo(.staging) } label: { MCIBigLabel(title: "Add Resource", systemImage: "truck.box") }
                        .buttonStyle(.bordered)
                    Button { onGo(.transport) } label: { MCIBigLabel(title: "Record Departure", systemImage: "arrow.right.circle") }
                        .buttonStyle(.bordered)
                }
            }
            MCISectionBox(title: "Incident") {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 220), alignment: .topLeading)], alignment: .leading, spacing: 10) {
                    MCIFieldValue(label: "Location", value: inc.location.mciNR)
                    MCIFieldValue(label: "Type", value: typeText(inc))
                    MCIFieldValue(label: "Occurred / started", value: MCIFmt.full(inc.occurrenceAt, tz: inc.timeZone))
                    MCIFieldValue(label: "Command established", value: MCIFmt.full(inc.commandEstablishedAt, tz: inc.timeZone))
                    MCIFieldValue(label: "Incident Commander", value: inc.currentAssignment("Incident Commander")?.person.mciNR ?? "Unassigned")
                    MCIFieldValue(label: "Command Post", value: inc.commandPost.mciNR)
                }
                Button { onGo(.command) } label: { Text("Edit in Command").frame(minHeight: 44) }.buttonStyle(.bordered)
            }
            MCICountsPanel(incident: inc)
            let issues = inc.reconciliationIssues
            if !issues.isEmpty {
                MCISectionBox(title: "Needs Completion or Reconciliation", accent: MCIStyle.brick) {
                    ForEach(issues, id: \.self) { Label($0, systemImage: "exclamationmark.triangle").foregroundStyle(MCIStyle.brick) }
                    Button { onGo(.transport) } label: { Text("Go to Transport").frame(minHeight: 44) }.buttonStyle(.bordered)
                }
            }
            MCISectionBox(title: "Hospitals — Last Reported") {
                ForEach(inc.hospitals) { h in
                    let poll = inc.latestPoll(h.id)
                    HStack {
                        Text(h.name).font(.headline)
                        Spacer()
                        Text(poll == nil ? "No poll" : "Poll \(MCIFmt.age(of: poll?.observedAt, now: Date()))")
                            .foregroundStyle(.secondary)
                        Text("Sent \(inc.sentTotal(to: h.id))").font(.headline.monospacedDigit())
                    }
                    .frame(minHeight: 36)
                }
                let unknownDest = inc.sentTotal(to: nil)
                if unknownDest > 0 {
                    Text("\(unknownDest) departed with destination Unknown — complete in Transport.").foregroundStyle(MCIStyle.brick)
                }
            }
            MCISectionBox(title: "Command Checklist") {
                let pending = inc.checklist.filter { $0.state == .pending }
                Text("\(pending.count) of \(inc.checklist.count) pending").font(.headline)
                ForEach(pending.prefix(4)) { Text("• \($0.text)") }
                Button { onGo(.command) } label: { Text("Open Checklist").frame(minHeight: 44) }.buttonStyle(.bordered)
            }
        }
    }

    func typeText(_ inc: MCIIncident) -> String {
        var t = inc.types
        if !inc.otherType.mciTrimmed.isEmpty { t.append(inc.otherType) }
        return t.isEmpty ? "Not recorded" : t.joined(separator: ", ")
    }
}

struct MCIFieldValue: View {
    let label: String
    let value: String
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased()).font(.caption.bold()).foregroundStyle(.secondary)
            Text(value).foregroundStyle(value == "Not recorded" || value == "—" ? .secondary : .primary)
        }
        .accessibilityElement(children: .combine)
    }
}

/// The two count sources, side by side, each labelled with its own scope and time. Never added together.
struct MCICountsPanel: View {
    let incident: MCIIncident

    var body: some View {
        let inc = incident
        let r = inc.register()
        let snap = inc.latestSnapshot
        VStack(alignment: .leading, spacing: 12) {
            MCISectionBox(title: "A · Reported Scene Count (manual snapshot)") {
                if let s = snap {
                    Text("Patients reportedly still on scene. Observed \(MCIFmt.full(s.observedAt, tz: inc.timeZone)) · source \(s.reporter.mciNR).")
                        .font(.callout)
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 8)], spacing: 8) {
                        ForEach(TriageCategory.allCases) { c in
                            MCICountTile(title: "\(c.abbr) \(c.name)", value: s.value(c).map(String.init) ?? "Unknown",
                                         fill: c.swatch, text: c.swatchText)
                        }
                    }
                    Text(s.totalText).font(.title3.bold())
                } else {
                    Text("No reported count recorded yet.").foregroundStyle(.secondary)
                }
            }
            MCISectionBox(title: "B · Patient Register (tracked individual records)") {
                Text("Derived from \(r.allTotal) tracked patient records as of now. Entered-in-error records are excluded.")
                    .font(.callout)
                MCIRegisterTable(register: r)
            }
            if let s = snap {
                if s.isComplete && s.knownSubtotal != r.onSceneTotal {
                    Text("Reported on scene (\(s.knownSubtotal)) and tracked on scene (\(r.onSceneTotal)) differ. Reconcile; neither is assumed wrong, and they are never added together.")
                        .font(.callout).padding(10).background(Color.yellow.opacity(0.2))
                }
            }
        }
    }
}

struct MCICountTile: View {
    let title: String
    let value: String
    let fill: Color
    let text: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.title.bold().monospacedDigit())
            Text(title).font(.subheadline.bold())
        }
        .foregroundStyle(text)
        .padding(10)
        .frame(maxWidth: .infinity, minHeight: 70, alignment: .leading)
        .background(fill)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .accessibilityElement(children: .combine)
    }
}

struct MCIRegisterTable: View {
    let register: MCIRegister
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        if sizeClass == .compact { compact } else { wide }
    }

    /// iPhone: one block per category instead of five narrow columns.
    var compact: some View {
        let r = register
        return VStack(alignment: .leading, spacing: 0) {
            ForEach(MCIRegister.keys, id: \.self) { k in
                VStack(alignment: .leading, spacing: 2) {
                    Text(MCIRegister.label(k)).font(.headline)
                    Text("Tracked \(r.all[k] ?? 0) · On scene \(r.onScene[k] ?? 0) · Departed \(r.departed[k] ?? 0) · Unknown \(r.unknownLocation[k] ?? 0)")
                        .font(.subheadline.monospacedDigit())
                }
                .padding(.vertical, 6)
                .accessibilityElement(children: .combine)
                Divider()
            }
            Text("Total: \(r.allTotal) tracked · \(r.onSceneTotal) on scene · \(r.departedTotal) departed · \(r.unknownTotal) unknown")
                .font(.subheadline.bold().monospacedDigit())
                .padding(.vertical, 6)
        }
    }

    var wide: some View {
        let r = register
        return VStack(spacing: 0) {
            row("Category", "Tracked", "On scene", "Departed", "Location unknown", header: true)
            ForEach(MCIRegister.keys, id: \.self) { k in
                row(MCIRegister.label(k), String(r.all[k] ?? 0), String(r.onScene[k] ?? 0), String(r.departed[k] ?? 0), String(r.unknownLocation[k] ?? 0))
            }
            row("Total", "\(r.allTotal)", "\(r.onSceneTotal)", "\(r.departedTotal)", "\(r.unknownTotal)", header: true)
        }
    }

    func row(_ a: String, _ b: String, _ c: String, _ d: String, _ e: String, header: Bool = false) -> some View {
        HStack {
            Text(a).frame(maxWidth: .infinity, alignment: .leading)
            Text(b).frame(width: 74, alignment: .trailing)
            Text(c).frame(width: 84, alignment: .trailing)
            Text(d).frame(width: 84, alignment: .trailing)
            Text(e).frame(width: 96, alignment: .trailing)
        }
        .font(header ? .subheadline.bold() : .body.monospacedDigit())
        .padding(.vertical, 6)
        .background(header ? MCIStyle.rowFill : Color.clear)
        .accessibilityElement(children: .combine)
    }
}
