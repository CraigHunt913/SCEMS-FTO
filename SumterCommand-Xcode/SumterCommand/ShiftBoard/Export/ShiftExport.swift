// ShiftExport.swift
// Sumter EMS Command — Shift Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

// MARK: - Export (PDF from a saved snapshot, plus editable backup)

enum ExportKind: String, CaseIterable, Identifiable {
    case summary, full
    var id: String { rawValue }
    var label: String { self == .summary ? "Shift Summary" : "Full Detail" }
}

enum ExportFiles {
    static func write(_ data: Data, name: String) throws -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("SumterExports", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent(name)
        if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
        try data.write(to: url, options: [.atomic, .completeFileProtection])
        return url
    }

    static func safe(_ s: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-"))
        let mapped = s.unicodeScalars.map { allowed.contains($0) ? Character($0) : "-" }
        return String(mapped)
    }

    static func baseName(_ s: ShiftRecord) -> String {
        let label = s.shiftLabel.trimmed.isEmpty ? "" : "-\(safe(s.shiftLabel.trimmed))"
        return "Sumter-\(s.isTraining ? "TRAINING-" : "")Shift-\(TimeFormat.fileDay(s.operationalDate, tz: s.timeZone))\(label)"
    }
}

struct PDFPreview: UIViewRepresentable {
    let url: URL
    func makeUIView(context: Context) -> PDFView {
        let v = PDFView()
        v.autoScales = true
        v.document = PDFDocument(url: url)
        return v
    }
    func updateUIView(_ v: PDFView, context: Context) {
        if v.document?.documentURL != url { v.document = PDFDocument(url: url) }
    }
}

struct ExportSheet: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    let snapshot: ShiftRecord
    @State private var kind: ExportKind = .summary
    @State private var pdfURL: URL?
    @State private var backupURL: URL?
    @State private var errorText: String?

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                Text("Exports contain operational information. Share or store them only as your agency's policy allows. Nothing is sent anywhere unless you choose to share it.")
                    .font(.footnote).foregroundStyle(.secondary)
                Picker("Report", selection: $kind) {
                    ForEach(ExportKind.allCases) { k in Text(k.label).tag(k) }
                }
                .pickerStyle(.segmented)
                .onChange(of: kind) { _ in pdfURL = nil }
                HStack(spacing: 12) {
                    Button { generatePDF() } label: { BigButtonLabel(title: "Generate PDF Preview", systemImage: "doc.richtext") }
                        .buttonStyle(.borderedProminent).tint(Theme.navy)
                    if let pdfURL {
                        ShareLink(item: pdfURL) { BigButtonLabel(title: "Share or Save PDF…", systemImage: "square.and.arrow.up") }
                            .buttonStyle(.bordered)
                    }
                }
                if let errorText { Text(errorText).foregroundStyle(Theme.brick) }
                if let pdfURL {
                    PDFPreview(url: pdfURL)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .border(Color.secondary.opacity(0.4))
                } else {
                    Text("Generate a preview to check the pages before sharing.")
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                Divider()
                HStack(spacing: 12) {
                    Button { makeBackup() } label: { BigButtonLabel(title: "Create Editable Backup File", systemImage: "externaldrive") }
                        .buttonStyle(.bordered)
                    if let backupURL {
                        ShareLink(item: backupURL) { BigButtonLabel(title: "Share or Save Backup…", systemImage: "square.and.arrow.up") }
                            .buttonStyle(.bordered)
                    }
                }
            }
            .padding()
            .navigationTitle("Export — \(snapshot.title)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
    }

    func generatePDF() {
        let data = ShiftPDF.make(snapshot, kind: kind, generatedAt: Date())
        do {
            pdfURL = try ExportFiles.write(data, name: "\(ExportFiles.baseName(snapshot))-\(kind == .summary ? "Summary" : "Full-Detail").pdf")
            errorText = nil
        } catch {
            errorText = "The PDF could not be written: \(error.localizedDescription)"
        }
    }

    func makeBackup() {
        do {
            let data = try Backup.encode(snapshot, exportedAt: Date())
            backupURL = try ExportFiles.write(data, name: "\(ExportFiles.baseName(snapshot))-backup.json")
            errorText = nil
        } catch {
            errorText = "The backup could not be written: \(error.localizedDescription)"
        }
    }
}

enum ShiftPDF {
    /// Two passes: the first counts pages so every page can say "Page n of N".
    static func make(_ s: ShiftRecord, kind: ExportKind, generatedAt: Date) -> Data {
        let first = render(s, kind: kind, generatedAt: generatedAt, totalPages: 0)
        return render(s, kind: kind, generatedAt: generatedAt, totalPages: first.pages).data
    }

    static func render(_ s: ShiftRecord, kind: ExportKind, generatedAt: Date, totalPages: Int) -> (data: Data, pages: Int) {
        let format = UIGraphicsPDFRendererFormat()
        format.documentInfo = [kCGPDFContextTitle as String: "Sumter EMS Shift Board — \(s.title)",
                               kCGPDFContextCreator as String: "Sumter EMS Command"]
        let renderer = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 792, height: 612), format: format)
        var pages = 0
        let data = renderer.pdfData { ctx in
            let c = PDFComposer(ctx: ctx, shift: s, kind: kind, generatedAt: generatedAt, totalPages: totalPages)
            c.compose()
            pages = c.pageNumber
        }
        return (data, pages)
    }
}

final class PDFComposer {
    let ctx: UIGraphicsPDFRendererContext
    let s: ShiftRecord
    let kind: ExportKind
    let generatedAt: Date
    let totalPages: Int
    let pageRect = CGRect(x: 0, y: 0, width: 792, height: 612)
    let margin: CGFloat = 30
    var y: CGFloat = 0
    var pageNumber = 0
    var continuedHeader: (() -> Void)?
    var continuations: [(title: String, text: String)] = []
    var continuationKeys = Set<String>()

    let bodyFont = UIFont.systemFont(ofSize: 10)
    let boldFont = UIFont.systemFont(ofSize: 10, weight: .semibold)
    let headFont = UIFont.systemFont(ofSize: 10, weight: .bold, width: .condensed)
    let barFont = UIFont.systemFont(ofSize: 14, weight: .bold, width: .condensed)
    let smallFont = UIFont.systemFont(ofSize: 8)

    init(ctx: UIGraphicsPDFRendererContext, shift: ShiftRecord, kind: ExportKind, generatedAt: Date, totalPages: Int) {
        self.ctx = ctx
        self.s = shift
        self.kind = kind
        self.generatedAt = generatedAt
        self.totalPages = totalPages
    }

    var tz: TimeZone { s.timeZone }
    var contentTop: CGFloat { margin + 42 }
    var bottom: CGFloat { pageRect.height - margin - 14 }
    var contentWidth: CGFloat { pageRect.width - margin * 2 }

    func clock(_ d: Date?) -> String { TimeFormat.clock(d, tz: tz, ref: s.operationalDate) }

    // Drawing primitives

    func textHeight(_ text: String, _ font: UIFont, _ width: CGFloat) -> CGFloat {
        let r = (text as NSString).boundingRect(with: CGSize(width: max(width, 1), height: .greatestFiniteMagnitude),
                                                options: [.usesLineFragmentOrigin, .usesFontLeading],
                                                attributes: [.font: font], context: nil)
        return ceil(r.height)
    }

    func drawText(_ text: String, _ font: UIFont, _ color: UIColor, _ rect: CGRect,
                  align: NSTextAlignment = .left) {
        let p = NSMutableParagraphStyle()
        p.alignment = align
        p.lineBreakMode = .byWordWrapping
        (text as NSString).draw(with: rect, options: [.usesLineFragmentOrigin, .usesFontLeading],
                                attributes: [.font: font, .foregroundColor: color, .paragraphStyle: p], context: nil)
    }

    func newPage() {
        ctx.beginPage()
        pageNumber += 1
        chrome()
        y = contentTop
        continuedHeader?()
    }

    func chrome() {
        let bar = CGRect(x: margin, y: margin - 12, width: contentWidth, height: 22)
        Theme.uiNavy.setFill()
        UIRectFill(bar)
        drawText("SUMTER COUNTY EMS — SHIFT COMMAND BOARD", barFont, .white, bar.insetBy(dx: 8, dy: 3))
        drawText(kind.label.uppercased() + (s.isTraining ? " · TRAINING" : ""), barFont, .white,
                 bar.insetBy(dx: 8, dy: 3), align: .right)
        let ident = "\(TimeFormat.day(s.operationalDate, tz: tz)) · Shift \(s.shiftLabel.orDash) · Supervisor \(s.supervisor.orDash) · Sheet \(s.sheetRef.orDash)"
        drawText(String(ident.prefix(150)), boldFont, Theme.uiNavy, CGRect(x: margin, y: bar.maxY + 4, width: contentWidth, height: 14))
        let trainingPrefix: String = s.isTraining ? "TRAINING — FICTITIOUS DATA · " : ""
        let ofTotal: String = totalPages > 0 ? " of \(totalPages)" : ""
        let generated: String = TimeFormat.full(generatedAt, tz: tz)
        let foot = "\(trainingPrefix)Page \(pageNumber)\(ofTotal) · Generated \(generated) · Times in \(s.timeZoneID), 24-hour · — = not recorded"
        drawText(foot, smallFont, .darkGray, CGRect(x: margin, y: pageRect.height - margin - 4, width: contentWidth, height: 12))
    }

    func sectionBar(_ title: String) {
        if y + 60 > bottom { newPage() }
        let r = CGRect(x: margin, y: y, width: contentWidth, height: 18)
        Theme.uiNavy.setFill()
        UIRectFill(r)
        drawText(title.uppercased(), headFont, .white, r.insetBy(dx: 6, dy: 3))
        y += 22
    }

    /// Long entries are shortened in tables and printed in full under "Continued Text". Nothing is dropped.
    func cell(_ text: String, _ ref: String, limit: Int = 320) -> String {
        let t = text.trimmed
        if t.isEmpty { return "—" }
        if t.count <= limit { return t }
        if continuationKeys.insert(ref).inserted { continuations.append((ref, t)) }
        return String(t.prefix(limit - 70)) + "… [continued: \(ref)]"
    }

    func table(_ title: String, _ columns: [(String, CGFloat)], _ rows: [[String]], empty: String = "None recorded.") {
        sectionBar(title)
        if rows.isEmpty {
            drawText(empty, bodyFont, .darkGray, CGRect(x: margin, y: y, width: contentWidth, height: 14))
            y += 22
            return
        }
        let widths = columns.map { $0.1 * contentWidth }
        let drawHeader: () -> Void = { [unowned self] in
            let h = (columns.enumerated().map { self.textHeight($0.element.0, self.headFont, widths[$0.offset] - 6) }.max() ?? 12) + 6
            Theme.uiBrick.setFill()
            UIRectFill(CGRect(x: self.margin, y: self.y, width: self.contentWidth, height: h))
            var x = self.margin
            for (i, col) in columns.enumerated() {
                self.drawText(col.0, self.headFont, .white, CGRect(x: x + 3, y: self.y + 3, width: widths[i] - 6, height: h - 6))
                x += widths[i]
            }
            self.y += h
        }
        drawHeader()
        continuedHeader = { [unowned self] in
            self.drawText("\(title) (continued)", self.boldFont, Theme.uiNavy,
                          CGRect(x: self.margin, y: self.y, width: self.contentWidth, height: 14))
            self.y += 16
            drawHeader()
        }
        for (n, raw) in rows.enumerated() {
            let row = raw + Array(repeating: "", count: max(0, columns.count - raw.count))
            let h = (widths.indices.map { textHeight(row[$0], bodyFont, widths[$0] - 6) }.max() ?? 12) + 6
            if y + h > bottom { newPage() }
            if n % 2 == 1 {
                Theme.uiRow.setFill()
                UIRectFill(CGRect(x: margin, y: y, width: contentWidth, height: h))
            }
            var x = margin
            for i in widths.indices {
                drawText(row[i], bodyFont, .black, CGRect(x: x + 3, y: y + 3, width: widths[i] - 6, height: h - 4))
                x += widths[i]
            }
            UIColor(white: 0.75, alpha: 1).setFill()
            UIRectFill(CGRect(x: margin, y: y + h - 0.5, width: contentWidth, height: 0.5))
            y += h
        }
        continuedHeader = nil
        y += 12
    }

    /// Text of any length, split across as many pages as needed.
    func flowing(_ text: String, title: String) {
        let para = NSMutableParagraphStyle()
        para.lineBreakMode = .byWordWrapping
        let attr = NSAttributedString(string: text.isEmpty ? "—" : text,
                                      attributes: [.font: bodyFont, .paragraphStyle: para])
        let setter = CTFramesetterCreateWithAttributedString(attr as CFAttributedString)
        var start = 0
        let total = attr.length
        while start < total {
            if bottom - y < 30 { newPage() }
            if start > 0 {
                drawText("\(title) (continued)", boldFont, Theme.uiNavy, CGRect(x: margin, y: y, width: contentWidth, height: 14))
                y += 16
            }
            let avail = CGRect(x: margin, y: y, width: contentWidth, height: bottom - y)
            guard let cg = UIGraphicsGetCurrentContext() else { return }
            cg.saveGState()
            cg.textMatrix = .identity
            cg.translateBy(x: 0, y: pageRect.height)
            cg.scaleBy(x: 1, y: -1)
            let pathRect = CGRect(x: avail.minX, y: pageRect.height - avail.maxY, width: avail.width, height: avail.height)
            let frame = CTFramesetterCreateFrame(setter, CFRange(location: start, length: 0),
                                                 CGPath(rect: pathRect, transform: nil), nil)
            CTFrameDraw(frame, cg)
            cg.restoreGState()
            let visible = CTFrameGetVisibleStringRange(frame)
            if visible.length <= 0 {
                if y <= contentTop + 20 { return }   // cannot fit even on a fresh page
                newPage()
                continue
            }
            let used = CTFramesetterSuggestFrameSizeWithConstraints(setter, visible, nil,
                                                                    CGSize(width: avail.width, height: .greatestFiniteMagnitude), nil)
            start += visible.length
            if start < total { newPage() } else { y += ceil(used.height) + 10 }
        }
    }

    // Content

    func compose() {
        newPage()
        identitySection()
        systemSection()
        unitsSection()
        runTimesSection()
        pendingSection()
        if kind == .full {
            allRunsSection()
            historySection()
        }
        continuationSection()
        inkSections()
    }

    func identitySection() {
        table("Shift", [("Field", 0.22), ("Value", 0.78)], [
            ["Date", TimeFormat.day(s.operationalDate, tz: tz)],
            ["Shift", cell(s.shiftLabel, "Shift label")],
            ["Supervisor", cell(s.supervisor, "Supervisor")],
            ["Sheet", cell(s.sheetRef, "Sheet")],
            ["Operational time zone", s.timeZoneID],
            ["Record type", s.isTraining ? "TRAINING — fictitious data" : "Operational"],
            ["State", s.isReadOnly ? "Archived (read-only) \(TimeFormat.full(s.archivedAt, tz: tz))" : "Active"],
            ["Provenance", s.provenance ?? "Created on this iPad"],
        ])
    }

    func systemSection() {
        let c = BoardCounts.of(s.units)
        let sys = s.system
        var notes = cell(sys.onDutyNotes, "On-Duty Notes")
        if let m = sys.onDutyNotesInherited {
            notes += m.reviewed ? " (carried forward, reviewed)" : " (carried forward from \(TimeFormat.day(m.fromDate, tz: tz)), NOT reviewed)"
        }
        table("System Status", [("Item", 0.24), ("Value", 0.5), ("Updated", 0.26)], [
            ["Trucks in Service", "\(c.inService)", "Calculated"],
            ["Available Now (AVL)", "\(c.available)", "Calculated"],
            ["Status Unknown (on duty)", "\(c.unknown)", "Calculated"],
            ["Out of Service (on duty)", "\(c.oos)", "Calculated"],
            ["On Duty / Not on Duty", "\(c.onDuty) / \(c.offDuty)", "Calculated"],
            ["Status Level", cell(sys.statusLevel, "Status Level"), TimeFormat.full(sys.statusLevelUpdatedAt, tz: tz)],
            ["Weather", cell(sys.weather, "Weather"), TimeFormat.full(sys.weatherUpdatedAt, tz: tz)],
            ["Hospital Divert", cell(sys.hospitalDivert, "Hospital Divert"), TimeFormat.full(sys.hospitalDivertUpdatedAt, tz: tz)],
            ["On-Duty Notes", notes, "—"],
        ])
        flowing("Counting rules: " + BoardCounts.definition, title: "Counting rules")
    }

    func natureDest(_ run: CallRecord?, _ ref: String) -> String {
        guard let run else { return "—" }
        var t = "\(run.nature.orDash) / \(run.destination.orDash)"
        if !run.location.trimmed.isEmpty { t += "\nLocation: \(run.location)" }
        return cell(t, ref)
    }

    func unitsSection() {
        var rows: [[String]] = []
        for st in s.orderedStations {
            for u in s.stationUnits(st.id, includeRetired: true) {
                let run = s.activeCall(for: u.id)
                var crew = cell(u.crew, "Unit \(u.name) crew")
                if let m = u.crewInherited, !m.reviewed { crew += " (inherited, not reviewed)" }
                rows.append([
                    "\(st.number) / \(st.name)",
                    u.name,
                    "\(u.status.abbr)\n\(u.status.fullName)",
                    u.retired ? "Removed" : (u.onDuty ? "Yes" : "No"),
                    crew,
                    run.map { $0.runNumber.orDash } ?? "No run",
                    run?.priority.short ?? "—",
                    run?.determinant.short ?? "—",
                    natureDest(run, "Unit \(u.name) nature/destination"),
                    cell(u.notes, "Unit \(u.name) notes"),
                ])
            }
        }
        table("Units", [("Station", 0.09), ("Unit", 0.06), ("Status", 0.09), ("On Duty", 0.05), ("Crew", 0.14),
                        ("Run #", 0.07), ("Pri", 0.05), ("Det", 0.07), ("Nature / Destination", 0.21), ("Notes", 0.17)], rows)
    }

    func runTimesSection() {
        var rows: [[String]] = []
        for u in s.orderedUnits {
            guard let run = s.activeCall(for: u.id) else { continue }
            var r: [String] = ["Unit \(u.name)", run.runNumber.orDash]
            r += Milestone.allCases.map { clock(run.time($0)) }
            r.append(cell(run.notes, "Unit \(u.name) run \(run.runNumber.orDash) notes"))
            rows.append(r)
        }
        table("Current Run Times", [("Unit", 0.08), ("Run #", 0.08), ("Dispatched", 0.09), ("En Route", 0.09),
                                    ("On Scene", 0.09), ("Transporting", 0.09), ("At Hospital", 0.09), ("Clear", 0.09),
                                    ("Run Notes", 0.30)], rows, empty: "No active runs.")
    }

    func pendingSection() {
        let rows: [[String]] = s.pending.sorted { $0.createdAt < $1.createdAt }.map { p in
            let assigned = p.assignedCallIDs.compactMap { cid in
                s.calls.first { $0.id == cid }.flatMap { s.unit($0.unitID)?.name }
            }
            let held: String
            if p.state == .pending, let t = p.timeIn { held = TimeFormat.elapsed(from: t, to: generatedAt) }
            else if p.state == .pending { held = "Unknown" }
            else { held = "—" }
            return [clock(p.timeIn), held, p.runNumber.orDash, p.priority.short, p.determinant.short,
                    cell(p.nature, "Holding call \(p.runNumber.orDash) nature"),
                    cell(p.location, "Holding call \(p.runNumber.orDash) location"),
                    assigned.isEmpty ? "—" : assigned.joined(separator: ", "),
                    p.state.label,
                    cell(p.statusNotes, "Holding call \(p.runNumber.orDash) status/notes")]
        }
        table("Calls Holding / Pending", [("Time In", 0.09), ("Holding", 0.08), ("Run #", 0.07), ("Pri", 0.05),
                                          ("Det", 0.07), ("Nature", 0.16), ("Location", 0.14), ("Assign Unit", 0.09),
                                          ("State", 0.07), ("Status / Notes", 0.18)], rows, empty: "No calls holding.")
    }

    func allRunsSection() {
        var rows: [[String]] = []
        for u in s.orderedUnits + s.units.filter({ $0.retired }) {
            for r in s.runs(for: u.id) {
                var row: [String] = [u.name, r.runNumber.orDash, r.priority.short, r.determinant.short,
                           cell(r.nature, "Unit \(u.name) run \(r.runNumber.orDash) nature"),
                           cell(r.location, "Unit \(u.name) run \(r.runNumber.orDash) location"),
                           cell(r.destination, "Unit \(u.name) run \(r.runNumber.orDash) destination")]
                row += Milestone.allCases.map { clock(r.time($0)) }
                row.append(r.isOpen ? "Open" : "Closed \(clock(r.closedAt))")
                rows.append(row)
                if !r.notes.trimmed.isEmpty {
                    let ref = "Unit \(u.name) run \(r.runNumber.orDash) notes (opened \(clock(r.openedAt)))"
                    if continuationKeys.insert(ref).inserted { continuations.append((ref, r.notes.trimmed)) }
                }
            }
        }
        table("All Runs This Shift", [("Unit", 0.06), ("Run #", 0.07), ("Pri", 0.04), ("Det", 0.06), ("Nature", 0.12),
                                      ("Location", 0.10), ("Destination", 0.10), ("Disp", 0.065), ("EnR", 0.065),
                                      ("OnS", 0.065), ("Trn", 0.065), ("Hos", 0.065), ("Clr", 0.065), ("Run", 0.06)],
              rows, empty: "No runs recorded.")
    }

    func historySection() {
        let rows = s.events.sorted { $0.recordedAt < $1.recordedAt }.map { e in
            [TimeFormat.full(e.recordedAt, tz: tz), TimeFormat.full(e.effectiveAt, tz: tz), s.recordLabel(e.recordID),
             cell(s.describe(e), "History entry \(e.id.uuidString.prefix(8))"), e.initials.orDash]
        }
        table("History", [("Recorded", 0.16), ("Effective", 0.16), ("Record", 0.14), ("Change", 0.46), ("Initials", 0.08)],
              rows, empty: "No history.")
    }

    func continuationSection() {
        guard !continuations.isEmpty else { return }
        sectionBar("Continued Text (full entries)")
        for item in continuations {
            if y + 40 > bottom { newPage() }
            drawText(item.title, boldFont, Theme.uiNavy, CGRect(x: margin, y: y, width: contentWidth, height: 14))
            y += 16
            flowing(item.text, title: item.title)
        }
    }

    func inkTitle(_ ink: InkAttachment) -> String {
        let fields: [String: String] = ["crew": "Crew", "unitNotes": "Unit Notes", "runNotes": "Run Notes",
                      "pendingNotes": "Status / Notes", "onDutyNotes": "On-Duty Notes"]
        let field = fields[ink.fieldID] ?? ink.fieldID
        if ink.recordID == s.id { return "System — \(field)" }
        return "\(s.recordLabel(ink.recordID)) — \(field)"
    }

    func inkSections() {
        for ink in s.inks.sorted(by: { inkTitle($0) < inkTitle($1) }) {
            let title = inkTitle(ink)
            let drawing: PKDrawing
            do {
                drawing = try PKDrawing(data: ink.drawing)
            } catch {
                sectionBar("\(title) — handwriting")
                drawText("This handwriting attachment could not be read. It is preserved unchanged in backups.",
                         bodyFont, .black, CGRect(x: margin, y: y, width: contentWidth, height: 14))
                y += 20
                continue
            }
            if drawing.strokes.isEmpty { continue }
            let w = CGFloat(ink.canvasWidth)
            let pageH = CGFloat(ink.pageHeight)
            let pages = max(ink.pageCount, Int(ceil(drawing.bounds.maxY / pageH)))
            for p in 0..<pages {
                newPage()
                sectionBar("\(title) — handwriting page \(p + 1) of \(pages)")
                let src = CGRect(x: 0, y: CGFloat(p) * pageH, width: w, height: pageH)
                var image = UIImage()
                UITraitCollection(userInterfaceStyle: .light).performAsCurrent {
                    image = drawing.image(from: src, scale: 2)
                }
                let availH = bottom - y
                let scale = min(contentWidth / w, availH / pageH)
                let dest = CGRect(x: margin + (contentWidth - w * scale) / 2, y: y, width: w * scale, height: pageH * scale)
                UIColor.white.setFill()
                UIRectFill(dest)
                image.draw(in: dest)
                UIColor.gray.setStroke()
                UIBezierPath(rect: dest).stroke()
                y = dest.maxY + 8
            }
        }
    }
}
