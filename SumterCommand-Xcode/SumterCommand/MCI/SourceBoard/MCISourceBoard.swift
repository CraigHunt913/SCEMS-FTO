// MCISourceBoard.swift
// Sumter EMS Command — MCI Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

// MARK: - Source board content (from Sumter_EMS_MCI_Command_Board_11x17.pdf)

/// The ICS chart on page 1, shown as tiers. These are the source board's layout, not a required hierarchy.
enum MCIRoleTiers {
    static let layout: [(title: String, roles: [String])] = [
        ("Command", ["Incident Commander"]),
        ("Command Staff", ["Safety Officer", "Public Information Officer", "Liaison Officer"]),
        ("Operations", ["Operations Section Chief"]),
        ("Medical Branch", ["Medical Branch Director"]),
        ("Groups / Units", ["Triage Group Supervisor", "Treatment Group Supervisor", "Transport Group Supervisor",
                            "Staging Area Manager", "Medical Communications Coordinator"]),
    ]

    static func tiers(for names: [String]) -> [(title: String, roles: [String])] {
        var out: [(title: String, roles: [String])] = []
        var placed = Set<String>()
        for t in layout {
            let present = t.roles.filter { names.contains($0) }
            placed.formUnion(present)
            if !present.isEmpty { out.append((t.title, present)) }
        }
        let extra = names.filter { !placed.contains($0) }
        if !extra.isEmpty { out.append(("Added roles", extra)) }
        return out
    }
}

/// Page 2 "How to Triage", kept word for word from the source board. Reference only; never used as an algorithm.
enum MCISourceReference {
    struct System {
        let title: String
        let subtitle: String
        let lead: String
        let steps: [String]
    }

    static let sourceLine = "Source: Sumter County EMS · MCI Triage & How to Triage (board page 2). Colors are START / SALT standard · Expectant (gray) is SALT. Reference only — verify against agency protocol."

    static let systems: [System] = [
        System(title: "START", subtitle: "adults", lead: "RPM · 30-2-Can Do", steps: [
            "1. Walking? → MINOR, send to Green area.",
            "2. Respirations. None → open airway. Still none → DECEASED. Breathing only after airway → IMMEDIATE.",
            "3. Rate over 30/min → IMMEDIATE.",
            "4. Perfusion (rate under 30): no radial pulse or cap refill over 2 sec → IMMEDIATE.",
            "5. Mental status: cannot follow commands → IMMEDIATE; follows commands → DELAYED.",
        ]),
        System(title: "JUMPSTART", subtitle: "pediatric", lead: "Infant to about 8 yr", steps: [
            "1. Walking? → MINOR. Carried infants: assess fully.",
            "2. Breathing? Apneic → position airway. Breathes → IMMEDIATE; still apneic → check pulse.",
            "3. No pulse → DECEASED. Pulse → 5 rescue breaths: breathes → IMMEDIATE; no breathing → DECEASED.",
            "4. Rate under 15 or over 45 → IMMEDIATE; 15-45 → check pulse.",
            "5. No peripheral pulse → IMMEDIATE. Pulse → AVPU: P (inappropriate) or U → IMMEDIATE; A / V / P appropriate → DELAYED.",
        ]),
        System(title: "SALT", subtitle: "all ages, MUCC", lead: "Sort → Assess → Lifesaving → Treat/Transport", steps: [
            "1. Sort (global): Walk → assess last. Wave / purposeful → assess 2nd. Still or obvious threat → assess 1st.",
            "2. Lifesaving interventions (fast only): control major bleeding, open airway / 2 breaths (peds), needle chest decompression, auto-injector antidotes.",
            "3. Assign: not breathing after LSI → DECEASED. Life threat, likely survivable → IMMEDIATE. Life threat, unlikely with resources → EXPECTANT. Obeys + pulse + no distress + minor → MINOR / DELAYED by severity.",
        ]),
    ]
}

struct MCISourceReferenceView: View {
    @State private var expanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button { expanded.toggle() } label: {
                Label(expanded ? "Hide How to Triage (source board page 2)" : "Show How to Triage (source board page 2)",
                      systemImage: expanded ? "chevron.up" : "chevron.down")
                    .font(.headline).frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
            }
            .buttonStyle(.bordered)
            if expanded {
                Text("REFERENCE ONLY — verify against agency protocol. Shown word for word from the source board; not an interactive algorithm.")
                    .font(.callout.bold()).padding(8).frame(maxWidth: .infinity, alignment: .leading).background(Color.yellow.opacity(0.25))
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 300), alignment: .topLeading)], alignment: .leading, spacing: 12) {
                    ForEach(MCISourceReference.systems, id: \.title) { sys in
                        VStack(alignment: .leading, spacing: 6) {
                            Text("\(sys.title) · \(sys.subtitle)").font(.mciHeading(.title3)).foregroundStyle(.white)
                                .padding(.horizontal, 8).padding(.vertical, 4)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(sys.title == "START" ? MCIStyle.brick : (sys.title == "SALT" ? MCIStyle.slate : MCIStyle.navy))
                            Text(sys.lead).font(.headline)
                            ForEach(sys.steps, id: \.self) { Text($0).font(.callout) }
                        }
                        .padding(8)
                        .overlay(Rectangle().stroke(MCIStyle.navy.opacity(0.35)))
                    }
                }
                Text(MCISourceReference.sourceLine).font(.footnote).foregroundStyle(.secondary)
            }
        }
    }
}

/// The original shield from the source PDF (transparency restored), stored in Assets.xcassets as "SumterShield".
enum MCIShield {
    static let image: UIImage? = UIImage(named: "SumterShield")
}

/// PDFs bundled with the app (Resources folder).
enum MCIBundled {
    static var sketchCards: URL? { Bundle.main.url(forResource: "Sumter_EMS_Scene_Sketch_Cards", withExtension: "pdf") }
    static var sourceBoard: URL? { Bundle.main.url(forResource: "Sumter_EMS_MCI_Command_Board_11x17", withExtension: "pdf") }
}

/// Shows a bundled PDF, opened at a given page (0-based).
struct MCIBundledPDFViewer: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    let url: URL
    let startPage: Int

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Text("REFERENCE ONLY — verify against agency protocol · Source: Sumter EMS MCI Command Board")
                    .font(.footnote.bold()).padding(8).frame(maxWidth: .infinity).background(Color.yellow.opacity(0.25))
                MCIPDFPageView(url: url, startPage: startPage)
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}

struct MCIPDFPageView: UIViewRepresentable {
    let url: URL
    let startPage: Int

    func makeUIView(context: Context) -> PDFView {
        let v = PDFView()
        v.autoScales = true
        v.document = PDFDocument(url: url)
        if let doc = v.document, startPage < doc.pageCount, let page = doc.page(at: startPage) { v.go(to: page) }
        return v
    }

    func updateUIView(_ v: PDFView, context: Context) {}
}
