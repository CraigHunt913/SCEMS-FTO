// MCIPacketPDF.swift
// Sumter EMS Command — MCI Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

// MARK: - Incident Packet PDF

enum MCIPaper: String, CaseIterable, Identifiable {
    case tabloid, letter
    var id: String { rawValue }
    var label: String { self == .tabloid ? "11 × 17 (matches the board)" : "Letter 8.5 × 11" }
    var rect: CGRect { self == .tabloid ? CGRect(x: 0, y: 0, width: 1224, height: 792) : CGRect(x: 0, y: 0, width: 792, height: 612) }
}

enum MCIPacketPDF {
    static func make(_ i: MCIIncident, store: MCIStore?, generatedAt: Date, paper: MCIPaper = .tabloid) -> Data {
        let bgs = backgrounds(store)
        let first = render(i, backgrounds: bgs, generatedAt: generatedAt, totalPages: 0, paper: paper)
        return render(i, backgrounds: bgs, generatedAt: generatedAt, totalPages: first.pages, paper: paper).data
    }

    static func backgrounds(_ store: MCIStore?) -> [MCISketchTemplate: UIImage] {
        var out: [MCISketchTemplate: UIImage] = [:]
        guard let store else { return out }
        for t in MCISketchTemplate.allCases { if let img = MCISketchBackground.image(store, t, width: 2400) { out[t] = img } }
        return out
    }

    static func render(_ i: MCIIncident, backgrounds: [MCISketchTemplate: UIImage], generatedAt: Date, totalPages: Int,
                       paper: MCIPaper) -> (data: Data, pages: Int) {
        let format = UIGraphicsPDFRendererFormat()
        format.documentInfo = [kCGPDFContextTitle as String: "Incident Packet — \(i.displayName)",
                               kCGPDFContextCreator as String: "Sumter EMS Command — MCI Board"]
        let renderer = UIGraphicsPDFRenderer(bounds: paper.rect, format: format)
        var pages = 0
        let data = renderer.pdfData { ctx in
            let c = MCIPDFComposer(ctx: ctx, incident: i, backgrounds: backgrounds, generatedAt: generatedAt, totalPages: totalPages,
                                   pageRect: paper.rect)
            c.compose()
            pages = c.pageNumber
        }
        return (data, pages)
    }
}

final class MCIPDFComposer {
    let ctx: UIGraphicsPDFRendererContext
    let inc: MCIIncident
    let backgrounds: [MCISketchTemplate: UIImage]
    let generatedAt: Date
    let totalPages: Int
    let pageRect: CGRect
    let margin: CGFloat = 30
    var y: CGFloat = 0
    var pageNumber = 0
    var part = ""
    var partTitle = ""
    var partFooter = ""
    let shield = MCIShield.image
    var continuedHeader: (() -> Void)?
    var continuations: [(title: String, text: String)] = []
    var continuationKeys = Set<String>()

    let bodyFont = UIFont.systemFont(ofSize: 10)
    let boldFont = UIFont.systemFont(ofSize: 10, weight: .semibold)
    let headFont = UIFont.systemFont(ofSize: 10, weight: .bold, width: .condensed)
    let barFont = UIFont.systemFont(ofSize: 14, weight: .bold, width: .condensed)
    let smallFont = UIFont.systemFont(ofSize: 8)

    init(ctx: UIGraphicsPDFRendererContext, incident: MCIIncident, backgrounds: [MCISketchTemplate: UIImage], generatedAt: Date, totalPages: Int,
         pageRect: CGRect) {
        self.pageRect = pageRect
        self.ctx = ctx
        self.inc = incident
        self.backgrounds = backgrounds
        self.generatedAt = generatedAt
        self.totalPages = totalPages
    }

    var tz: TimeZone { inc.timeZone }
    var contentTop: CGFloat { margin + 64 }
    var bottom: CGFloat { pageRect.height - margin - 26 }
    var contentWidth: CGFloat { pageRect.width - margin * 2 }
    func clock(_ d: Date?) -> String { MCIFmt.clock(d, tz: tz, ref: inc.refDate) }

    func textHeight(_ text: String, _ font: UIFont, _ width: CGFloat) -> CGFloat {
        let r = (text as NSString).boundingRect(with: CGSize(width: max(width, 1), height: .greatestFiniteMagnitude),
                                                options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: [.font: font], context: nil)
        return ceil(r.height)
    }

    func drawText(_ text: String, _ font: UIFont, _ color: UIColor, _ rect: CGRect, align: NSTextAlignment = .left) {
        let p = NSMutableParagraphStyle()
        p.alignment = align
        p.lineBreakMode = .byWordWrapping
        (text as NSString).draw(with: rect, options: [.usesLineFragmentOrigin, .usesFontLeading],
                                attributes: [.font: font, .foregroundColor: color, .paragraphStyle: p], context: nil)
    }

    func newPage() {
        ctx.beginPage()
        pageNumber += 1
        // Header in the source board's style: shield, small red agency line, large navy title, red rule.
        var textX = margin
        if let shield {
            let h: CGFloat = 40
            let w = h * shield.size.width / max(shield.size.height, 1)
            shield.draw(in: CGRect(x: margin, y: margin - 14, width: w, height: h))
            textX = margin + w + 8
        }
        let kicker = UIFont.systemFont(ofSize: 10, weight: .heavy, width: .expanded)
        let title = UIFont.systemFont(ofSize: 22, weight: .heavy, width: .condensed)
        drawText("SUMTER COUNTY EMS", kicker, MCIStyle.uiBrick, CGRect(x: textX, y: margin - 12, width: contentWidth, height: 13))
        drawText(partTitle, title, MCIStyle.uiNavy, CGRect(x: textX, y: margin - 1, width: contentWidth * 0.6, height: 28))
        let trainingLine: String = inc.isTraining ? "TRAINING — FICTITIOUS\n" : ""
        let started: String = MCIFmt.full(inc.createdAt, tz: tz)
        let rightLines = "\(trainingLine)\(inc.displayName)\nStarted \(started)"
        drawText(String(rightLines.prefix(200)), boldFont, MCIStyle.uiNavy,
                 CGRect(x: margin + contentWidth * 0.55, y: margin - 12, width: contentWidth * 0.45, height: 40), align: .right)
        MCIStyle.uiBrick.setFill()
        UIRectFill(CGRect(x: margin, y: margin + 31, width: contentWidth, height: 2))
        let recordKind: String = inc.isTraining ? "Training record" : "Operational record"
        let loc = "Location: \(inc.location.mciDash) · MCI Level \(inc.level) · \(recordKind)"
        drawText(String(loc.prefix(220)), smallFont, .darkGray, CGRect(x: margin, y: margin + 37, width: contentWidth, height: 12))
        // Footer: the source's footer note on the left, page number on the right.
        let footY = pageRect.height - margin - 16
        drawText(partFooter, UIFont.systemFont(ofSize: 8, weight: .bold, width: .condensed), .darkGray,
                 CGRect(x: margin, y: footY, width: contentWidth * 0.6, height: 12))
        let footFont = UIFont.systemFont(ofSize: 8, weight: .bold, width: .condensed)
        let ofTotal: String = totalPages > 0 ? " OF \(totalPages)" : ""
        let pageLabel = "PAGE \(pageNumber)\(ofTotal) · \(part.uppercased())"
        let pageRectRight = CGRect(x: margin + contentWidth * 0.6, y: footY, width: contentWidth * 0.4, height: 12)
        drawText(pageLabel, footFont, .darkGray, pageRectRight, align: .right)
        let trainingPrefix: String = inc.isTraining ? "TRAINING — FICTITIOUS DATA · " : ""
        let generated: String = MCIFmt.full(generatedAt, tz: tz)
        let gen = "\(trainingPrefix)Generated \(generated) · Times in \(inc.timeZoneID), 24-hour · — = not recorded · Coordination record, not an ePCR"
        drawText(gen, smallFont, .gray, CGRect(x: margin, y: footY + 11, width: contentWidth, height: 11))
        y = contentTop
        continuedHeader?()
    }

    func startPart(_ name: String, title: String? = nil, footer: String = "SUMTER COUNTY EMS : MCI INCIDENT PACKET") {
        part = name
        partTitle = title ?? "MCI \(name.uppercased())"
        partFooter = footer
        newPage()
    }

    func sectionBar(_ title: String) {
        if y + 60 > bottom { newPage() }
        let r = CGRect(x: margin, y: y, width: contentWidth, height: 18)
        MCIStyle.uiNavy.setFill()
        UIRectFill(r)
        drawText(title.uppercased(), headFont, .white, r.insetBy(dx: 6, dy: 3))
        y += 22
    }

    func note(_ text: String) {
        let h = textHeight(text, smallFont, contentWidth)
        if y + h > bottom { newPage() }
        drawText(text, smallFont, .darkGray, CGRect(x: margin, y: y, width: contentWidth, height: h))
        y += h + 6
    }

    func cell(_ text: String, _ ref: String, limit: Int = 320) -> String {
        let t = text.mciTrimmed
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
            MCIStyle.uiBrick.setFill()
            UIRectFill(CGRect(x: self.margin, y: self.y, width: self.contentWidth, height: h))
            var x = self.margin
            for (k, col) in columns.enumerated() {
                self.drawText(col.0, self.headFont, .white, CGRect(x: x + 3, y: self.y + 3, width: widths[k] - 6, height: h - 6))
                x += widths[k]
            }
            self.y += h
        }
        drawHeader()
        continuedHeader = { [unowned self] in
            self.drawText("\(title) (continued)", self.boldFont, MCIStyle.uiNavy, CGRect(x: self.margin, y: self.y, width: self.contentWidth, height: 14))
            self.y += 16
            drawHeader()
        }
        for (n, raw) in rows.enumerated() {
            let row = raw + Array(repeating: "", count: max(0, columns.count - raw.count))
            let h = (widths.indices.map { textHeight(row[$0], bodyFont, widths[$0] - 6) }.max() ?? 12) + 6
            if y + h > bottom { newPage() }
            if n % 2 == 1 {
                MCIStyle.uiRow.setFill()
                UIRectFill(CGRect(x: margin, y: y, width: contentWidth, height: h))
            }
            var x = margin
            for k in widths.indices {
                drawText(row[k], bodyFont, .black, CGRect(x: x + 3, y: y + 3, width: widths[k] - 6, height: h - 4))
                x += widths[k]
            }
            UIColor(white: 0.75, alpha: 1).setFill()
            UIRectFill(CGRect(x: margin, y: y + h - 0.5, width: contentWidth, height: 0.5))
            y += h
        }
        continuedHeader = nil
        y += 12
    }

    func flowing(_ text: String, title: String) {
        let para = NSMutableParagraphStyle()
        para.lineBreakMode = .byWordWrapping
        let attr = NSAttributedString(string: text.isEmpty ? "—" : text, attributes: [.font: bodyFont, .paragraphStyle: para])
        let setter = CTFramesetterCreateWithAttributedString(attr as CFAttributedString)
        var start = 0
        let total = attr.length
        while start < total {
            if bottom - y < 30 { newPage() }
            if start > 0 {
                drawText("\(title) (continued)", boldFont, MCIStyle.uiNavy, CGRect(x: margin, y: y, width: contentWidth, height: 14))
                y += 16
            }
            let avail = CGRect(x: margin, y: y, width: contentWidth, height: bottom - y)
            guard let cg = UIGraphicsGetCurrentContext() else { return }
            cg.saveGState()
            cg.textMatrix = .identity
            cg.translateBy(x: 0, y: pageRect.height)
            cg.scaleBy(x: 1, y: -1)
            let pathRect = CGRect(x: avail.minX, y: pageRect.height - avail.maxY, width: avail.width, height: avail.height)
            let frame = CTFramesetterCreateFrame(setter, CFRange(location: start, length: 0), CGPath(rect: pathRect, transform: nil), nil)
            CTFrameDraw(frame, cg)
            cg.restoreGState()
            let visible = CTFrameGetVisibleStringRange(frame)
            if visible.length <= 0 {
                if y <= contentTop + 20 { return }
                newPage()
                continue
            }
            let used = CTFramesetterSuggestFrameSizeWithConstraints(setter, visible, nil, CGSize(width: avail.width, height: .greatestFiniteMagnitude), nil)
            start += visible.length
            if start < total { newPage() } else { y += ceil(used.height) + 10 }
        }
    }

    func n(_ v: Int?) -> String { v.map(String.init) ?? "Unknown" }

    // Parts

    func compose() {
        commandPart()
        triagePart()
        hospitalsPart()
        transportPart()
        sketchPart()
        activityPart()
        continuationPart()
        inkPart()
    }

    func commandPart() {
        startPart("Command", title: "EMS MCI COMMAND BOARD", footer: "SUMTER COUNTY EMS : EMS MCI COMMAND BOARD")
        var types = inc.types
        if !inc.otherType.mciTrimmed.isEmpty { types.append(inc.otherType) }
        table("Incident", [("Field", 0.24), ("Value", 0.76)], [
            ["Incident Name", cell(inc.name, "Incident name")],
            ["Local incident ID", inc.localNumber],
            ["Date/Time (occurrence / start)", MCIFmt.full(inc.occurrenceAt, tz: tz)],
            ["Created on this iPad", MCIFmt.full(inc.createdAt, tz: tz)],
            ["Location / Address", cell(inc.location, "Location")],
            ["Incident Type", types.isEmpty ? "—" : types.joined(separator: ", ")],
            ["MCI Level", inc.level],
            ["Command Established", MCIFmt.full(inc.commandEstablishedAt, tz: tz)],
            ["Record", inc.isTraining ? "TRAINING — fictitious" : "Operational"],
            ["State", inc.isClosed ? "Closed \(MCIFmt.full(inc.closedAt, tz: tz))" : "Open"],
            ["Provenance", inc.provenance ?? "Created on this iPad"],
        ])
        table("Communications", [("Channel", 0.3), ("Value (operator-entered)", 0.7)], [
            ["Command Channel", cell(inc.commandChannel, "Command channel")],
            ["Tactical / Ops", cell(inc.tacticalChannel, "Tactical channel")],
            ["Medical / Hospital", cell(inc.medicalChannel, "Medical channel")],
            ["Air / Mutual Aid", cell(inc.airAidChannel, "Air/aid channel")],
            ["Command Post Location", cell(inc.commandPost, "Command post")],
        ])
        table("Scene Notes (added to source fields)", [("Item", 0.2), ("Entry", 0.8)], [
            ["Access / Egress", cell(inc.accessEgress, "Access / Egress")],
            ["Hazards", cell(inc.hazards, "Hazards")],
            ["Command Notes", cell(inc.commandNotes, "Command Notes")],
        ])
        table("Initial Actions Checklist (template v\(inc.checklistTemplateVersion))", [("Action", 0.5), ("State", 0.14), ("Time", 0.12), ("Initials", 0.08), ("Notes", 0.16)],
              inc.checklist.map { c -> [String] in [c.text, c.state.label, clock(c.completedAt), c.initials.mciDash, cell(c.notes, "Checklist note: \(c.text)")] })
        var roleRows: [[String]] = []
        for r in inc.roleNames {
            let list = inc.roles.filter { $0.role == r }.sorted { ($0.assignedAt ?? .distantPast) < ($1.assignedAt ?? .distantPast) }
            if list.isEmpty { roleRows.append([r, "Unassigned", "—", "—", "—", "—", "—"]) }
            for a in list {
                roleRows.append([r, a.person.mciDash, a.agencyChannel.mciDash, a.reportsTo.mciDash, clock(a.assignedAt),
                                 a.relievedAt == nil ? "Current" : "Relieved \(clock(a.relievedAt))", cell(a.notes, "\(r) note")])
            }
        }
        table("Assignments", [("Role", 0.2), ("Person / call sign", 0.18), ("Agency / channel", 0.13), ("Reports to", 0.12),
                              ("Assigned", 0.09), ("Status", 0.12), ("Notes", 0.16)], roleRows)
    }

    func triagePart() {
        startPart("Triage", title: "MCI TRIAGE & HOW TO TRIAGE", footer: "COLORS ARE START / SALT STANDARD · EXPECTANT (GRAY) IS SALT")
        note("Two separate count sources. A: Reported Scene Count — manual snapshots of patients reportedly still on scene. B: Patient Register — derived from individual tracked records. They are never added together. Unknown is not zero.")
        let snaps = inc.snapshots.sorted { $0.recordedAt < $1.recordedAt }
        table("A · Reported Scene Count — Running Count", [("Observed", 0.1), ("R", 0.07), ("Y", 0.07), ("G", 0.07), ("EXP", 0.07), ("DEC", 0.07),
                                                           ("Total", 0.17), ("Source", 0.12), ("Recorded", 0.1), ("Notes", 0.16)],
              snaps.map { s -> [String] in
                  var row: [String] = [clock(s.observedAt)]
                  for c in TriageCategory.allCases { row.append(n(s.value(c))) }
                  let total: String = s.correctsID == nil ? s.totalText : "\(s.totalText) (correction)"
                  row.append(total)
                  row.append(s.reporter.mciDash)
                  row.append(clock(s.recordedAt))
                  row.append(cell(s.notes, "Snapshot note \(clock(s.recordedAt))"))
                  return row
              })
        let r = inc.register()
        var regRows: [[String]] = MCIRegister.keys.map { k -> [String] in
            [MCIRegister.label(k), String(r.all[k] ?? 0), String(r.onScene[k] ?? 0), String(r.departed[k] ?? 0), String(r.unknownLocation[k] ?? 0)]
        }
        regRows.append(["Total", String(r.allTotal), String(r.onSceneTotal), String(r.departedTotal), String(r.unknownTotal)])
        table("B · Patient Register — as of \(MCIFmt.full(generatedAt, tz: tz))", [("Category", 0.3), ("Tracked", 0.175), ("On scene", 0.175), ("Departed", 0.175), ("Location unknown", 0.175)],
              regRows)
        note("Entered-in-error records are excluded from B. Triage categories in this record were selected manually.")
        sectionBar("How to Triage · source reference (not entered data) — REFERENCE ONLY, verify against agency protocol")
        for sys in MCISourceReference.systems {
            if y + 40 > bottom { newPage() }
            drawText("\(sys.title) · \(sys.subtitle)", boldFont, MCIStyle.uiNavy, CGRect(x: margin, y: y, width: contentWidth, height: 14))
            y += 16
            flowing(([sys.lead] + sys.steps).joined(separator: "\n"), title: sys.title)
        }
        note(MCISourceReference.sourceLine)
    }

    func hospitalsPart() {
        startPart("Hospitals & Mutual Aid", title: "MCI HOSPITALS & MUTUAL AID", footer: "POLL BEDS EARLY AND RE-POLL; BALANCE LOAD ACROSS FACILITIES")
        let polls = inc.polls.sorted { $0.recordedAt < $1.recordedAt }
        table("Hospital Bed Polls — Last Reported Available (not live capacity)",
              [("Facility", 0.2), ("Observed", 0.1), ("Imm", 0.07), ("Del", 0.07), ("Min", 0.07), ("Divert", 0.09), ("Reporter / method", 0.16), ("Contact / notes", 0.24)],
              polls.map { p -> [String] in
                  [inc.hospital(p.hospitalID)?.name ?? "?", clock(p.observedAt), n(p.immediate), n(p.delayed), n(p.minor), p.divert.label,
                   "\(p.reporter.mciDash) / \(p.method.mciDash)", cell(p.contactNotes, "Poll note \(clock(p.recordedAt))")]
              })
        let sent = inc.patientsSent()
        var sentRows: [[String]] = []
        let dests: [UUID?] = inc.hospitals.map { Optional($0.id) } + [nil]
        for h in dests {
            guard let d = sent[h] else { continue }
            var row: [String] = [inc.hospital(h)?.name ?? "UNKNOWN DESTINATION"]
            for c in TriageCategory.allCases { row.append(String(d[c.rawValue] ?? 0)) }
            row.append(String(d["unknownAtDeparture"] ?? 0))
            row.append(String(d.values.reduce(0, +)))
            sentRows.append(row)
        }
        table("Patients Sent — valid departures by category AT DEPARTURE (as of \(MCIFmt.full(generatedAt, tz: tz)))",
              [("Destination", 0.3), ("R", 0.08), ("Y", 0.08), ("G", 0.08), ("EXP", 0.08), ("DEC", 0.08), ("UNK", 0.1), ("Total", 0.2)],
              sentRows, empty: "No departures.")
        table("Capability Notes (manual)", [("Facility", 0.3), ("Notes", 0.7)],
              inc.hospitals.filter { !$0.capabilityNotes.isEmpty }.map { h -> [String] in [h.name, cell(h.capabilityNotes, "\(h.name) capability")] })
        table("Mutual Aid — Ground", [("Agency", 0.16), ("Status", 0.1), ("Contacted", 0.09), ("Units sent", 0.15), ("ETA (estimate)", 0.12),
                                      ("Assignment", 0.16), ("Notes", 0.22)],
              inc.aid.sorted { $0.createdAt < $1.createdAt }.map { a -> [String] in
                  let etaClock: String = clock(a.eta)
                  let eta: String = a.etaSource.isEmpty ? etaClock : "\(etaClock) (\(a.etaSource))"
                  return [a.agency, a.status.label, clock(a.contactedAt), cell(a.unitsSent, "\(a.agency) units"), eta,
                          cell(a.assignment, "\(a.agency) assignment"), cell(a.notes, "\(a.agency) notes")]
              })
        table("Air Medical", [("Service", 0.13), ("Status", 0.1), ("Requested", 0.09), ("LZ / Frequency", 0.16), ("ETA", 0.08),
                              ("Patients", 0.12), ("Destination", 0.14), ("Notes", 0.18)],
              inc.air.sorted { $0.createdAt < $1.createdAt }.map { a -> [String] in
                  let pts: String = a.patientIDs.compactMap { inc.patient($0)?.number }.joined(separator: ", ").mciDash
                  return [a.service, a.status.label, clock(a.requestedAt), cell(a.lzFrequency, "\(a.service) LZ"), clock(a.eta),
                          pts, cell(a.destination, "\(a.service) destination"), cell(a.notes, "\(a.service) notes")]
              })
    }

    func transportPart() {
        startPart("Transport & Staging", title: "MCI TRANSPORT & STAGING", footer: "CATEGORY: R IMMEDIATE · Y DELAYED · G MINOR · EXP EXPECTANT · DEC DECEASED · UNK NOT CLASSIFIED")
        var rows: [[String]] = []
        for p in inc.patients where !p.enteredInError {
            let d = inc.validDeparture(for: p.id)
            var catOut = "—", unit = "—", dest = "—", out = "—"
            if let d {
                catOut = mciCategoryShort(d.categoryAtDeparture)
                unit = inc.resource(d.resourceID)?.identifier ?? d.unitText.mciDash
                dest = inc.hospital(d.hospitalID)?.name ?? "UNKNOWN"
                out = clock(d.departedAt)
            }
            var loc = inc.location(of: p).label
            if d?.needsCompletion == true { loc += " (incomplete)" }
            let ageSex = "\(p.ageText) / \(p.sex.label)"
            let complaint = cell(p.complaint, "\(p.number) complaint")
            let notes = cell(p.notes, "\(p.number) notes")
            let row: [String] = [p.number, p.tag.mciDash, mciCategoryShort(p.category), catOut, ageSex,
                                 complaint, unit, dest, out, loc, notes]
            rows.append(row)
        }
        table("Transport Log", [("Pt #", 0.06), ("Tag", 0.07), ("Current cat.", 0.09), ("Cat. at departure", 0.09), ("Age / Sex", 0.08),
                                ("Chief Complaint / Injury", 0.15), ("Transport Unit", 0.09), ("Destination", 0.12), ("Time Out", 0.07),
                                ("Location", 0.08), ("Notes", 0.10)], rows, empty: "No patients.")
        let voided = inc.departures.filter(\.voided)
        table("Voided Departures (kept for history, excluded from counts)", [("Patient", 0.12), ("Destination", 0.25), ("Time Out", 0.12), ("Voided", 0.12), ("Reason", 0.39)],
              voided.map { d -> [String] in [inc.patient(d.patientID)?.number ?? "?", inc.hospital(d.hospitalID)?.name ?? "Unknown", clock(d.departedAt), clock(d.voidedAt), cell(d.voidReason, "Void reason \(d.id.uuidString.prefix(6))")] },
              empty: "None.")
        table("Entered in Error (excluded from counts)", [("Patient", 0.15), ("Tag", 0.15), ("Reason", 0.7)],
              inc.patients.filter(\.enteredInError).map { p -> [String] in [p.number, p.tag.mciDash, cell(p.errorReason, "\(p.number) error reason")] }, empty: "None.")
        table("Staging", [("Unit / Resource", 0.14), ("Type", 0.09), ("Agency", 0.11), ("Time In", 0.08), ("Assignment", 0.15),
                          ("Status / Released", 0.15), ("Contact", 0.1), ("Notes", 0.18)],
              inc.resources.sorted { $0.createdAt < $1.createdAt }.map { r -> [String] in
                  let releasedClock: String = clock(r.releasedAt)
                  let status: String = r.releasedAt == nil ? r.status.label : "\(r.status.label) \(releasedClock)"
                  return [r.identifier.mciDash, r.type.mciDash, r.agency.mciDash, clock(r.timeIn), cell(r.assignment, "\(r.identifier) assignment"),
                          status, r.contact.mciDash, cell(r.notes, "\(r.identifier) notes")]
              })
        note("Available in staging (derived from recorded statuses): \(inc.availableResourceCount).")
    }

    func sketchPart() {
        guard !inc.sketches.isEmpty else { return }
        for s in inc.sketches {
            startPart("Scene Sketch", title: "MCI SCENE SKETCH")
            var rows: [[String]] = s.template.fields.map { f -> [String] in [f.label, s.fields[f.key]?.mciDash ?? "—"] }
            rows.insert(["Sketch", s.title], at: 0)
            rows.append(["Author", s.author.mciDash])
            rows.append(["Triage snapshot (copied, not live)", s.triageSnapshot.mciDash])
            rows.append(["Updated", MCIFmt.full(s.updatedAt, tz: tz)])
            table("\(s.template.title) — card details", [("Field", 0.3), ("Value", 0.7)], rows)
            if !s.notes.isEmpty { flowing(s.notes, title: "\(s.title) notes") }
            newPage()
            let w = CGFloat(s.canvasWidth), h = CGFloat(s.canvasHeight)
            let area = CGRect(x: margin, y: y, width: contentWidth, height: bottom - y)
            let rect = MCISketchBackground.fit(CGSize(width: w, height: h), in: area)
            UIColor.white.setFill()
            UIRectFill(rect)
            var cardRect: CGRect? = nil
            if let bg = backgrounds[s.template] {
                let r = MCISketchBackground.fit(bg.size, in: rect)
                bg.draw(in: r)
                cardRect = r
            } else {
                drawText("Sketch card PDF not on this iPad — blank page", smallFont, .gray, CGRect(x: rect.minX + 4, y: rect.minY + 4, width: rect.width, height: 12))
            }
            if let ink = inc.inks.first(where: { $0.recordID == s.id }), let drawing = try? PKDrawing(data: ink.drawing) {
                var img = UIImage()
                UITraitCollection(userInterfaceStyle: .light).performAsCurrent {
                    img = drawing.image(from: CGRect(x: 0, y: 0, width: w, height: h), scale: 3)
                }
                img.draw(in: rect)
            }
            if let cardRect { drawCardValues(s, on: cardRect) }
            UIColor.gray.setStroke()
            UIBezierPath(rect: rect).stroke()
            y = rect.maxY + 6
        }
    }

    /// Writes typed card values into the card's own header boxes, and the rest into a labelled
    /// companion block in the card's blank lower area. Positions are the card PDF's (792 × 612 pt).
    func drawCardValues(_ s: MCISketch, on r: CGRect) {
        let sx = r.width / 792
        let sy = r.height / 612
        let boxX: [CGFloat] = [30.7, 216.1, 401.6, 587.1]
        let keys: [String] = s.template == .facility
            ? ["facility", "residents", "staff", "descriptors"]
            : ["incidentNumber", "dateTime", "location", "sketchedBy"]
        let headerFont = UIFont.systemFont(ofSize: max(6, 8 * sy), weight: .semibold)
        for (i, k) in keys.enumerated() {
            let value: String = k == "descriptors" ? facilityDescriptors(s) : (s.fields[k] ?? "").mciTrimmed
            if value.isEmpty { continue }
            let box = CGRect(x: r.minX + boxX[i] * sx, y: r.minY + 76 * sy, width: 178 * sx, height: 11 * sy)
            drawText(value, headerFont, MCIStyle.uiNavy, box)
        }
        var lines: [String] = []
        for f in s.template.fields {
            let v = (s.fields[f.key] ?? "").mciTrimmed
            if !v.isEmpty { lines.append("\(f.label): \(v)") }
        }
        if !s.triageSnapshot.isEmpty { lines.append("Triage snapshot (copied, not live): \(s.triageSnapshot)") }
        if lines.isEmpty { return }
        let top: CGFloat = s.template == .facility ? 480 : 462
        let block = CGRect(x: r.minX + 24 * sx, y: r.minY + top * sy, width: 744 * sx, height: (604 - top) * sy)
        let labelFont = UIFont.systemFont(ofSize: max(6, 7 * sy), weight: .bold)
        let bodyFontSmall = UIFont.systemFont(ofSize: max(6, 7 * sy))
        drawText("ENTERED IN THE APP — companion to this card (typed values; ink is never read)", labelFont, MCIStyle.uiBrick,
                 CGRect(x: block.minX, y: block.minY, width: block.width, height: 10 * sy))
        let body = lines.joined(separator: "   ·   ")
        drawText(body, bodyFontSmall, .black, CGRect(x: block.minX, y: block.minY + 11 * sy, width: block.width, height: block.height - 11 * sy))
    }

    func facilityDescriptors(_ s: MCISketch) -> String {
        var parts: [String] = []
        let a = (s.fields["ambulatory"] ?? "").mciTrimmed
        let n = (s.fields["nonAmbulatory"] ?? "").mciTrimmed
        let b = (s.fields["bariatric"] ?? "").mciTrimmed
        if !a.isEmpty { parts.append("Amb \(a)") }
        if !n.isEmpty { parts.append("Non-amb \(n)") }
        if !b.isEmpty { parts.append("Bariatric \(b)") }
        return parts.joined(separator: " / ")
    }

    func activityPart() {
        startPart("Activity", title: "MCI ACTIVITY LOG")
        table("Activity Log", [("Recorded", 0.15), ("Effective", 0.15), ("Record", 0.16), ("Change", 0.46), ("Initials", 0.08)],
              inc.events.sorted { $0.recordedAt < $1.recordedAt }.map { e -> [String] in
                  [MCIFmt.full(e.recordedAt, tz: tz), MCIFmt.full(e.effectiveAt, tz: tz), inc.recordLabel(e.recordID),
                   cell(inc.describe(e), "Activity \(e.id.uuidString.prefix(8))"), e.initials.mciDash]
              }, empty: "No activity.")
    }

    func continuationPart() {
        guard !continuations.isEmpty else { return }
        startPart("Continued Text", title: "MCI CONTINUED TEXT")
        for item in continuations {
            if y + 40 > bottom { newPage() }
            drawText(item.title, boldFont, MCIStyle.uiNavy, CGRect(x: margin, y: y, width: contentWidth, height: 14))
            y += 16
            flowing(item.text, title: item.title)
        }
    }

    func inkTitle(_ k: MCIInk) -> String {
        let names: [String: String] = ["commandNotes": "Command Notes", "patientNotes": "Notes"]
        return "\(inc.recordLabel(k.recordID)) — \(names[k.fieldID] ?? k.fieldID)"
    }

    func inkPart() {
        let sketchIDs = Set(inc.sketches.map(\.id))
        for k in inc.inks.filter({ !sketchIDs.contains($0.recordID) }).sorted(by: { inkTitle($0) < inkTitle($1) }) {
            let title = inkTitle(k)
            let drawing: PKDrawing
            do { drawing = try PKDrawing(data: k.drawing) } catch {
                startPart("Handwriting", title: "MCI HANDWRITTEN NOTES")
                note("\(title): this handwriting attachment could not be read. It is preserved unchanged in backups.")
                continue
            }
            if drawing.strokes.isEmpty { continue }
            let w = CGFloat(k.width), ph = CGFloat(k.pageHeight)
            let pages = max(k.pageCount, Int(ceil(drawing.bounds.maxY / ph)))
            for p in 0..<pages {
                startPart("Handwriting", title: "MCI HANDWRITTEN NOTES")
                sectionBar("\(title) — handwriting page \(p + 1) of \(pages)")
                var img = UIImage()
                UITraitCollection(userInterfaceStyle: .light).performAsCurrent {
                    img = drawing.image(from: CGRect(x: 0, y: CGFloat(p) * ph, width: w, height: ph), scale: 2)
                }
                let rect = MCISketchBackground.fit(CGSize(width: w, height: ph), in: CGRect(x: margin, y: y, width: contentWidth, height: bottom - y))
                UIColor.white.setFill()
                UIRectFill(rect)
                img.draw(in: rect)
                UIColor.gray.setStroke()
                UIBezierPath(rect: rect).stroke()
                y = rect.maxY + 6
            }
        }
    }
}

struct MCIExportSheet: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.dismiss) private var dismiss
    let snapshot: MCIIncident
    @State private var pdfURL: URL?
    @State private var backupURL: URL?
    @State private var errorText: String?
    @State private var paper: MCIPaper = .tabloid

    var baseName: String {
        "Sumter-\(snapshot.isTraining ? "TRAINING-" : "")\(snapshot.localNumber)-\(MCIFmt.fileStamp(Date(), tz: snapshot.timeZone))"
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                Text("The Incident Packet contains operational information. Share or store it only as agency policy allows. Nothing is sent anywhere unless you choose Share.")
                    .font(.footnote).foregroundStyle(.secondary)
                Picker("Paper", selection: $paper) {
                    ForEach(MCIPaper.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
                .onChange(of: paper) { _ in pdfURL = nil }
                HStack(spacing: 12) {
                    Button { generate() } label: { MCIBigLabel(title: "Generate Incident Packet Preview", systemImage: "doc.richtext") }
                        .buttonStyle(.borderedProminent).tint(MCIStyle.navy)
                    if let pdfURL {
                        ShareLink(item: pdfURL) { MCIBigLabel(title: "Share or Save PDF…", systemImage: "square.and.arrow.up") }
                            .buttonStyle(.bordered)
                    }
                }
                if let errorText { Text(errorText).foregroundStyle(MCIStyle.brick) }
                if let pdfURL {
                    MCIPDFPreview(url: pdfURL).frame(maxWidth: .infinity, maxHeight: .infinity).border(Color.secondary.opacity(0.4))
                } else {
                    Text("Generate a preview to check every page before sharing.").foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                Divider()
                HStack(spacing: 12) {
                    Button { makeBackup() } label: { MCIBigLabel(title: "Create Editable Backup File", systemImage: "externaldrive") }
                        .buttonStyle(.bordered)
                    if let backupURL {
                        ShareLink(item: backupURL) { MCIBigLabel(title: "Share or Save Backup…", systemImage: "square.and.arrow.up") }
                            .buttonStyle(.bordered)
                    }
                }
                Text("The backup holds every record, link, history entry and handwriting/sketch ink. Reference PDFs and the sketch card PDF are not inside it; add those again on another iPad.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            .padding()
            .navigationTitle("Export — \(snapshot.displayName)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }

    func write(_ data: Data, _ name: String) throws -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("MCIExports", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent(name)
        if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
        try data.write(to: url, options: [.atomic, .completeFileProtection])
        return url
    }

    func generate() {
        let data = MCIPacketPDF.make(snapshot, store: store, generatedAt: Date(), paper: paper)
        do { pdfURL = try write(data, "\(baseName)-Incident-Packet.pdf"); errorText = nil } catch {
            errorText = "The PDF could not be written: \(error.localizedDescription)"
        }
    }

    func makeBackup() {
        do {
            let data = try MCIBackupCodec.encode(snapshot, exportedAt: Date())
            backupURL = try write(data, "\(baseName)-backup.json")
            errorText = nil
        } catch {
            errorText = "The backup could not be written: \(error.localizedDescription)"
        }
    }
}
