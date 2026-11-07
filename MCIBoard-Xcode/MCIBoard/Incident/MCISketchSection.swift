// MCISketchSection.swift
// Sumter EMS Command — MCI Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

// MARK: - Scene sketch companion

enum MCISketchBackground {
    /// Renders the chosen page of the operator-supplied Scene Sketch Cards PDF, unaltered.
    static func page(_ store: MCIStore, _ t: MCISketchTemplate) -> PDFPage? {
        guard let url = store.sketchPDFURL, let doc = PDFDocument(url: url), t.pageIndex < doc.pageCount else { return nil }
        return doc.page(at: t.pageIndex)
    }

    static func aspect(_ p: PDFPage) -> Double {
        let b = p.bounds(for: .mediaBox)
        let rotated = p.rotation % 180 != 0
        let w = rotated ? b.height : b.width
        let h = rotated ? b.width : b.height
        return w > 0 ? Double(h / w) : 0.773
    }

    static func image(_ store: MCIStore, _ t: MCISketchTemplate, width: CGFloat = 2048) -> UIImage? {
        guard let p = page(store, t) else { return nil }
        return p.thumbnail(of: CGSize(width: width, height: width * CGFloat(aspect(p))), for: .mediaBox)
    }

    static func fit(_ size: CGSize, in rect: CGRect) -> CGRect {
        guard size.width > 0, size.height > 0 else { return rect }
        let s = min(rect.width / size.width, rect.height / size.height)
        let w = size.width * s, h = size.height * s
        return CGRect(x: rect.midX - w / 2, y: rect.midY - h / 2, width: w, height: h)
    }
}

struct MCISketchSection: View {
    @EnvironmentObject var store: MCIStore
    let incident: MCIIncident
    @State private var drawTarget: MCIInkTarget?
    @State private var drawBackground: UIImage?
    @State private var details: MCIIDBox?
    @State private var showImporter = false
    @State private var importMessage: String?

    var body: some View {
        let inc = incident
        VStack(alignment: .leading, spacing: 16) {
            MCISectionBox(title: "Sketch Card Backgrounds") {
                if store.sketchPDFURL != nil {
                    Text("Using the Scene Sketch Cards (built into the app, or a replacement added in Settings). Pages are shown unaltered as locked backgrounds; erasing never removes them.")
                        .font(.callout)
                } else {
                    Text("The Scene Sketch Cards PDF is not on this iPad yet, so sketches use a blank page of the same proportions. Add the PDF (page 1 Roadway / MVC, page 2 Structure, page 3 Large Facility) to use the original cards as backgrounds.")
                        .font(.callout)
                }
                Button { showImporter = true } label: {
                    MCIBigLabel(title: "Use a Different Sketch Cards PDF…", systemImage: "doc.richtext")
                }
                .buttonStyle(.bordered)
                if let importMessage { Text(importMessage).foregroundStyle(MCIStyle.brick) }
            }
            if !inc.isClosed {
                MCISectionBox(title: "New Sketch") {
                    MCIOptionGrid(options: MCISketchTemplate.allCases, selected: nil, title: { "Add \($0.title)" }, minWidth: 220) { t in
                        let aspect = MCISketchBackground.page(store, t).map { MCISketchBackground.aspect($0) } ?? 0.773
                        let ini = store.initials
                        let tm = store.now()
                        store.update(inc.id) { $0.addSketch(t, aspect: aspect, author: ini, now: tm, initials: ini) }
                    }
                }
            }
            MCISectionBox(title: "Sketches (\(inc.sketches.count))") {
                if inc.sketches.isEmpty { Text("No sketches yet.").foregroundStyle(.secondary) }
                ForEach(inc.sketches) { s in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(s.title).font(.mciHeading(.title3))
                        Text("\(s.template.title) · by \(s.author.mciNR) · updated \(MCIFmt.full(s.updatedAt, tz: inc.timeZone))")
                            .font(.footnote).foregroundStyle(.secondary)
                        if !s.triageSnapshot.isEmpty { Text(s.triageSnapshot).font(.footnote) }
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 200), spacing: 10)], spacing: 10) {
                            Button {
                                store.flush()
                                drawBackground = MCISketchBackground.image(store, s.template)
                                drawTarget = MCIInkTarget(incidentID: inc.id, recordID: s.id, fieldID: "sketch", title: s.title,
                                                          width: CGFloat(s.canvasWidth), pageHeight: CGFloat(s.canvasHeight))
                            } label: { MCIBigLabel(title: inc.isClosed ? "View Sketch" : "Open Sketch", systemImage: "pencil.and.outline") }
                                .buttonStyle(.borderedProminent).tint(MCIStyle.navy)
                            Button { details = MCIIDBox(id: s.id) } label: { MCIBigLabel(title: "Card Details…", systemImage: "list.bullet.rectangle") }
                                .buttonStyle(.bordered)
                            if !inc.isClosed {
                                Button {
                                    let aspect = s.canvasWidth > 0 ? s.canvasHeight / s.canvasWidth : 0.773
                                    let ini = store.initials
                                    let tm = store.now()
                                    store.update(inc.id) { $0.addSketch(s.template, aspect: aspect, author: ini, now: tm, initials: ini) }
                                } label: { MCIBigLabel(title: "Add Sketch Page", systemImage: "doc.badge.plus") }
                                    .buttonStyle(.bordered)
                            }
                        }
                        Divider()
                    }
                }
                Text("Handwriting on a sketch is never read. It does not change counts, locations or cleared rooms. No GPS, maps or symbol recognition.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .fullScreenCover(item: $drawTarget) { t in
            MCIHandwritingEditor(target: t, readOnly: inc.isClosed, background: drawBackground, allowPages: false).environmentObject(store)
        }
        .sheet(item: $details) { box in MCISketchDetails(incidentID: inc.id, sketchID: box.id).environmentObject(store) }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [.pdf]) { result in
            switch result {
            case .success(let url): importMessage = store.importSketchPDF(url)
            case .failure(let e): importMessage = e.localizedDescription
            }
        }
    }
}

struct MCISketchDetails: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.dismiss) private var dismiss
    let incidentID: UUID
    let sketchID: UUID

    func field(_ key: String) -> Binding<String> {
        Binding(get: { self.store.incident(incidentID)?.sketches.first { $0.id == sketchID }?.fields[key] ?? "" },
                set: { v in
                    let t = store.now()
                    store.update(incidentID, debounce: true) { i in
                        if let k = i.sketches.firstIndex(where: { $0.id == sketchID }) { i.sketches[k].fields[key] = v; i.sketches[k].updatedAt = t }
                    }
                })
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                if let inc = store.incident(incidentID), let s = inc.sketches.first(where: { $0.id == sketchID }) {
                    let ro = inc.isClosed
                    VStack(alignment: .leading, spacing: 14) {
                        MCIField(label: "Sketch title", text: store.record(incidentID, \.sketches, sketchID, \.title, fallback: ""), readOnly: ro)
                        MCIField(label: "Author", text: store.record(incidentID, \.sketches, sketchID, \.author, fallback: ""), readOnly: ro)
                        Text("Card fields (\(s.template.title))").font(.mciHeading(.title3))
                        Text("Card: \(s.template.cardNote)").font(.callout)
                        Text("Facility descriptors (ambulatory, non-ambulatory, bariatric) can overlap; they are not added up. Orientation labels are entered by hand and do not imply a verified compass direction. Typed values here never change patient counts or locations.")
                            .font(.footnote).foregroundStyle(.secondary)
                        ForEach(s.template.fields, id: \.key) { f in MCIField(label: f.label, text: field(f.key), readOnly: ro) }
                        MCISectionBox(title: "Triage Snapshot on this Card") {
                            Text(s.triageSnapshot.isEmpty ? "None. Copy one in below; it is a dated copy, not a live tally." : s.triageSnapshot)
                            if !ro {
                                Button { copySnapshot(inc, reported: true) } label: { MCIBigLabel(title: "Copy Latest Reported Count", systemImage: "number") }
                                    .buttonStyle(.bordered).disabled(inc.latestSnapshot == nil)
                                Button { copySnapshot(inc, reported: false) } label: { MCIBigLabel(title: "Copy Patient Register Now", systemImage: "list.number") }
                                    .buttonStyle(.bordered)
                                if !s.triageSnapshot.isEmpty {
                                    Button("Clear Snapshot", role: .destructive) {
                                        store.update(incidentID) { i in if let k = i.sketches.firstIndex(where: { $0.id == sketchID }) { i.sketches[k].triageSnapshot = "" } }
                                    }
                                    .frame(minHeight: 48)
                                }
                            }
                        }
                        MCILongText(label: "Notes", text: store.record(incidentID, \.sketches, sketchID, \.notes, fallback: ""), minHeight: 120, readOnly: ro)
                        Text("Created \(MCIFmt.full(s.createdAt, tz: inc.timeZone)) · updated \(MCIFmt.full(s.updatedAt, tz: inc.timeZone)) · page \(s.template.pageIndex + 1) of the sketch cards")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    .padding()
                }
            }
            .navigationTitle("Sketch Card Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { store.flush(); dismiss() } } }
        }
    }

    func copySnapshot(_ inc: MCIIncident, reported: Bool) {
        let now = Date()
        let tz = inc.timeZone
        var text: String
        if reported, let s = inc.latestSnapshot {
            let vals = TriageCategory.allCases.map { "\($0.abbr) \(s.value($0).map(String.init) ?? "?")" }.joined(separator: " · ")
            text = "Reported Scene Count observed \(MCIFmt.full(s.observedAt, tz: tz)), source \(s.reporter.mciNR): \(vals) (\(s.totalText))"
        } else {
            let r = inc.register()
            let vals = MCIRegister.keys.map { "\(TriageCategory(rawValue: $0)?.abbr ?? "UNK") \(r.all[$0] ?? 0)" }.joined(separator: " · ")
            text = "Patient Register (tracked records): \(vals); \(r.onSceneTotal) on scene"
        }
        text += " — copied \(MCIFmt.full(now, tz: tz))"
        store.update(incidentID) { i in if let k = i.sketches.firstIndex(where: { $0.id == sketchID }) { i.sketches[k].triageSnapshot = text; i.sketches[k].updatedAt = now } }
    }
}
