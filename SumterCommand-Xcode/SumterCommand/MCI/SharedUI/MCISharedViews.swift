// MCISharedViews.swift
// Sumter EMS Command — MCI Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

// MARK: - Shared UI

struct MCIIDBox: Identifiable, Hashable { let id: UUID }

/// Side by side on iPad (regular width), stacked on iPhone (compact width).
struct MCIAdaptiveStack<Content: View>: View {
    @Environment(\.horizontalSizeClass) private var sizeClass
    var spacing: CGFloat = 12
    @ViewBuilder var content: Content

    var body: some View {
        if sizeClass == .compact {
            VStack(alignment: .leading, spacing: spacing) { content }
        } else {
            HStack(alignment: .center, spacing: spacing) { content }
        }
    }
}

struct MCISectionBox<Content: View>: View {
    let title: String
    var accent: Color = MCIStyle.navy
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title.uppercased())
                .font(.mciHeading(.headline))
                .foregroundStyle(.white)
                .padding(.horizontal, 12).padding(.vertical, 8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(accent)
                .accessibilityAddTraits(.isHeader)
            VStack(alignment: .leading, spacing: 12) { content }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Color(uiColor: .systemBackground))
        .overlay(Rectangle().stroke(MCIStyle.navy.opacity(0.35), lineWidth: 1))
    }
}

struct MCICategoryBadge: View {
    let category: TriageCategory?
    var body: some View {
        Text(category.map { "\($0.abbr) · \($0.name.uppercased())" } ?? "UNK · NOT CLASSIFIED")
            .font(.mciHeading(.headline))
            .foregroundStyle(category?.swatchText ?? Color.primary)
            .padding(.horizontal, 10).padding(.vertical, 5)
            .background(category?.swatch ?? Color.clear)
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(category == nil ? Color.secondary : Color.clear,
                                                              style: StrokeStyle(lineWidth: 2, dash: [5, 3])))
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .accessibilityLabel("Category \(mciCategoryLabel(category))")
    }
}

struct MCITag: View {
    let text: String
    var color: Color = MCIStyle.brick
    var body: some View {
        Text(text).font(.caption.bold()).foregroundStyle(.white)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(color).clipShape(Capsule())
    }
}

struct MCIBigLabel: View {
    let title: String
    let systemImage: String
    var body: some View {
        Label(title, systemImage: systemImage).font(.headline).frame(maxWidth: .infinity, minHeight: 56)
    }
}

struct MCISaveStatus: View {
    @EnvironmentObject var store: MCIStore
    var body: some View {
        switch store.saveState {
        case .idle:
            Label("No unsaved changes", systemImage: "checkmark.circle").foregroundStyle(.secondary)
        case .pending, .saving:
            Label("Saving…", systemImage: "clock")
        case .saved(let d):
            Label("Saved \(MCIFmt.deviceClock(d))", systemImage: "checkmark.circle.fill").foregroundStyle(.secondary)
        case .failed(let msg):
            HStack(spacing: 10) {
                Label("Save Failed", systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(MCIStyle.brick).font(.headline).accessibilityHint(msg)
                Button("Retry") { store.saveNow() }.buttonStyle(.borderedProminent).tint(MCIStyle.brick)
            }
        }
    }
}

struct MCISaveFailureBanner: View {
    @EnvironmentObject var store: MCIStore
    var body: some View {
        if case .failed(let msg) = store.saveState {
            VStack(alignment: .leading, spacing: 6) {
                Text("SAVE FAILED — changes are on screen but not yet stored.").font(.headline)
                Text(msg).font(.footnote)
                Button("Retry Save") { store.saveNow() }.buttonStyle(.borderedProminent).tint(.white)
                    .foregroundStyle(MCIStyle.brick)
            }
            .foregroundStyle(.white)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(MCIStyle.brick)
        }
    }
}

struct MCIOptionGrid<Option: Hashable & Identifiable>: View {
    let options: [Option]
    let selected: Option?
    let title: (Option) -> String
    var minWidth: CGFloat = 130
    var disabled = false
    let onPick: (Option) -> Void

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: minWidth), spacing: 10)], spacing: 10) {
            ForEach(options) { o in
                let isOn = o == selected
                Button { onPick(o) } label: {
                    Text(title(o))
                        .font(.headline)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 6)
                        .frame(maxWidth: .infinity, minHeight: 52)
                        .foregroundStyle(isOn ? Color.white : Color.primary)
                        .background(isOn ? MCIStyle.navy : MCIStyle.rowFill)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8)
                            .stroke(isOn ? MCIStyle.navy : Color.secondary.opacity(0.4), lineWidth: isOn ? 3 : 1))
                }
                .buttonStyle(.plain)
                .disabled(disabled)
                .accessibilityLabel(title(o))
                .accessibilityAddTraits(isOn ? .isSelected : [])
            }
        }
    }
}

/// Large manual category selector. Unclassified is a separate, explicit choice.
struct MCICategoryPicker: View {
    let selected: TriageCategory?
    var allowUnclassified = true
    var disabled = false
    let onPick: (TriageCategory?) -> Void

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 10)], spacing: 10) {
            ForEach(TriageCategory.allCases) { c in
                button(c.abbr, c.name, c.colorWord, fill: c.swatch, text: c.swatchText, isOn: selected == c) { onPick(c) }
            }
            if allowUnclassified {
                button("UNK", "Not classified", "No category", fill: Color(white: 0.85), text: .black, isOn: selected == nil) { onPick(nil) }
            }
        }
    }

    func button(_ abbr: String, _ name: String, _ word: String, fill: Color, text: Color, isOn: Bool,
                action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Text(abbr).font(.mciHeading(.title2))
                Text(name).font(.subheadline.bold())
                Text(word).font(.caption)
            }
            .foregroundStyle(text)
            .frame(maxWidth: .infinity, minHeight: 76)
            .background(fill)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(isOn ? MCIStyle.navy : Color.clear, lineWidth: 5))
            .overlay(alignment: .topTrailing) {
                if isOn { Image(systemName: "checkmark.circle.fill").font(.title2).foregroundStyle(MCIStyle.navy).padding(4) }
            }
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .accessibilityLabel("\(abbr), \(name), \(word)")
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}

struct MCIField: View {
    @EnvironmentObject var store: MCIStore
    let label: String
    @Binding var text: String
    var readOnly = false
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.headline)
            TextField(label, text: $text)
                .font(.title3)
                .padding(.horizontal, 12)
                .frame(minHeight: 56)
                .background(MCIStyle.rowFill)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.secondary.opacity(0.5)))
                .focused($focused)
                .disabled(readOnly)
                .submitLabel(.done)
        }
        .onChange(of: focused) { f in if !f { store.flush() } }
    }
}

/// A box filled by tapping a saved choice. Typing stays available but is never required.
struct MCIPickField: View {
    @EnvironmentObject var store: MCIStore
    let label: String
    @Binding var text: String
    let choices: [String]
    var readOnly = false
    @State private var picking = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.headline)
            HStack(spacing: 10) {
                Text(text.mciTrimmed.isEmpty ? "Not recorded" : text)
                    .font(.title3)
                    .foregroundStyle(text.mciTrimmed.isEmpty ? Color.secondary : Color.primary)
                    .padding(.horizontal, 12)
                    .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
                    .background(MCIStyle.rowFill)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .accessibilityLabel("\(label): \(text.mciNR)")
                if !readOnly {
                    Button { picking = true } label: {
                        Label("Pick", systemImage: "list.bullet").font(.headline).frame(minWidth: 96, minHeight: 56)
                    }
                    .buttonStyle(.borderedProminent).tint(MCIStyle.navy)
                    .accessibilityLabel("Pick \(label)")
                }
            }
        }
        .sheet(isPresented: $picking) {
            MCIPickSheet(title: label, choices: choices, current: text) { v in
                text = v
                store.flush()
            }
        }
    }
}

struct MCIPickSheet: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    let choices: [String]
    let current: String
    let onPick: (String) -> Void
    @State private var typed = ""

    var unique: [String] {
        var seen = Set<String>()
        var out: [String] = []
        for c in choices {
            let t = c.mciTrimmed
            if !t.isEmpty && seen.insert(t).inserted { out.append(t) }
        }
        return out
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if unique.isEmpty {
                        Text("No saved choices yet. Add them in Settings → Pick Lists, or type one below.")
                            .foregroundStyle(.secondary)
                    }
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 200), spacing: 10)], spacing: 10) {
                        ForEach(unique, id: \.self) { c in
                            let isOn = c == current
                            Button { onPick(c); dismiss() } label: {
                                Text(c)
                                    .font(.headline)
                                    .multilineTextAlignment(.center)
                                    .padding(8)
                                    .frame(maxWidth: .infinity, minHeight: 60)
                                    .foregroundStyle(isOn ? Color.white : Color.primary)
                                    .background(isOn ? MCIStyle.navy : MCIStyle.rowFill)
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(isOn ? .isSelected : [])
                        }
                    }
                    if !current.mciTrimmed.isEmpty {
                        Button(role: .destructive) { onPick(""); dismiss() } label: {
                            MCIBigLabel(title: "Clear (Not recorded)", systemImage: "xmark.circle")
                        }
                        .buttonStyle(.bordered)
                    }
                    Divider()
                    Text("Not in the list? Type it (optional):").font(.subheadline)
                    HStack {
                        TextField("Type here", text: $typed).textFieldStyle(.roundedBorder).frame(minHeight: 48)
                        Button("Use") { onPick(typed.mciTrimmed); dismiss() }
                            .buttonStyle(.borderedProminent).tint(MCIStyle.navy)
                            .disabled(typed.mciTrimmed.isEmpty)
                    }
                }
                .padding()
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }
}

struct MCIInkTarget: Identifiable, Hashable {
    var incidentID: UUID
    var recordID: UUID
    var fieldID: String
    var title: String
    var width: CGFloat = 1024
    var pageHeight: CGFloat = 768
    var id: String { "\(recordID.uuidString)|\(fieldID)" }
}

struct MCILongText: View {
    @EnvironmentObject var store: MCIStore
    let label: String
    @Binding var text: String
    var minHeight: CGFloat = 120
    var readOnly = false
    var ink: MCIInkTarget? = nil
    @FocusState private var focused: Bool
    @State private var expanded = false
    @State private var showInk: MCIInkTarget?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Text(label).font(.mciHeading(.title3))
                Spacer()
                Button { expanded = true } label: {
                    Label("Expand", systemImage: "arrow.up.left.and.arrow.down.right").frame(minHeight: 40)
                }
                .buttonStyle(.bordered)
                .accessibilityLabel("Expand \(label)")
                if let ink {
                    Button { store.flush(); showInk = ink } label: {
                        Label("Handwriting", systemImage: "pencil.tip").frame(minHeight: 40)
                    }
                    .buttonStyle(.bordered)
                    .accessibilityLabel("Open handwriting for \(label)")
                }
            }
            TextEditor(text: $text)
                .font(.body)
                .frame(minHeight: minHeight)
                .padding(6)
                .scrollContentBackground(.hidden)
                .background(MCIStyle.rowFill)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.secondary.opacity(0.5)))
                .focused($focused)
                .disabled(readOnly)
                .accessibilityLabel(label)
            if let ink, let att = store.ink(ink) {
                Text("Handwriting attached: \(att.pageCount) page\(att.pageCount == 1 ? "" : "s"), kept separate from the typed text.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .onChange(of: focused) { f in if !f { store.flush() } }
        .fullScreenCover(isPresented: $expanded) {
            MCIExpandedText(label: label, text: $text, readOnly: readOnly).environmentObject(store)
        }
        .fullScreenCover(item: $showInk) { t in
            MCIHandwritingEditor(target: t, readOnly: readOnly, background: nil).environmentObject(store)
        }
    }
}

struct MCIExpandedText: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.dismiss) private var dismiss
    let label: String
    @Binding var text: String
    let readOnly: Bool

    var body: some View {
        NavigationStack {
            TextEditor(text: $text)
                .font(.title3)
                .padding()
                .disabled(readOnly)
                .accessibilityLabel(label)
                .navigationTitle(label)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) { Button("Done") { store.flush(); dismiss() } }
                    ToolbarItem(placement: .status) { MCISaveStatus() }
                }
        }
    }
}

struct MCITimeSheet: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    let original: Date?
    let tz: TimeZone
    var requireReason: Bool
    let onSave: (Date?, String) -> Void
    @State private var value: Date
    @State private var reason = ""

    init(title: String, original: Date?, tz: TimeZone, requireReason: Bool? = nil, onSave: @escaping (Date?, String) -> Void) {
        self.title = title
        self.original = original
        self.tz = tz
        self.requireReason = requireReason ?? (original != nil)
        self.onSave = onSave
        _value = State(initialValue: original ?? Date())
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Current: \(MCIFmt.full(original, tz: tz))")
                    Text("Earlier values stay in the activity log. Retrospective times are allowed.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Section("Date and time (\(tz.identifier), 24-hour)") {
                    DatePicker("Time", selection: $value, displayedComponents: [.date, .hourAndMinute])
                        .datePickerStyle(.graphical)
                        .environment(\.timeZone, tz)
                        .environment(\.locale, Locale(identifier: "en_GB"))
                    Text("Selected: \(MCIFmt.full(value, tz: tz))").font(.headline)
                    if value > Date().addingTimeInterval(300) {
                        Text("This time is in the future.").foregroundStyle(MCIStyle.brick)
                    }
                }
                Section(requireReason ? "Reason (required)" : "Note (optional)") {
                    TextField("Reason", text: $reason).frame(minHeight: 44)
                }
                if original != nil {
                    Section {
                        Button("Clear This Time", role: .destructive) { onSave(nil, reason.mciTrimmed); dismiss() }
                            .disabled(requireReason && reason.mciTrimmed.isEmpty)
                    }
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { onSave(value, reason.mciTrimmed); dismiss() }
                        .disabled(requireReason && reason.mciTrimmed.isEmpty)
                }
            }
        }
    }
}

/// Shows a full date/time with Now (only when empty) and Enter/Correct.
struct MCITimeRow: View {
    let label: String
    let value: Date?
    let tz: TimeZone
    let ref: Date
    let readOnly: Bool
    let onSet: (Date?, String) -> Void
    @State private var editing = false

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.headline)
                Text(value == nil ? "Not recorded" : MCIFmt.clock(value, tz: tz, ref: ref))
                    .font(.title3.monospacedDigit())
                    .foregroundStyle(value == nil ? .secondary : .primary)
            }
            Spacer()
            if !readOnly {
                if value == nil {
                    Button("Now") { onSet(Date(), "Now") }
                        .buttonStyle(.borderedProminent).tint(MCIStyle.navy)
                        .frame(minWidth: 72, minHeight: 48)
                        .accessibilityLabel("Set \(label) to now")
                }
                Button(value == nil ? "Enter…" : "Correct…") { editing = true }
                    .buttonStyle(.bordered).frame(minHeight: 48)
                    .accessibilityLabel(value == nil ? "Enter \(label)" : "Correct \(label)")
            }
        }
        .frame(minHeight: 56)
        .sheet(isPresented: $editing) { MCITimeSheet(title: label, original: value, tz: tz, onSave: onSet) }
    }
}

/// Optional nonnegative count: blank = Unknown, 0 = zero. Large, separated −/+ controls.
struct MCICountField: View {
    let label: String
    @Binding var value: Int?
    var accent: Color = MCIStyle.navy
    var accentText: Color = .white
    @State private var text = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.headline)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .foregroundStyle(accentText).background(accent).clipShape(RoundedRectangle(cornerRadius: 4))
            MCIAdaptiveStack(spacing: 12) {
                HStack(spacing: 12) {
                Button { value = max(0, (value ?? 1) - 1) } label: {
                    Image(systemName: "minus").font(.title2.bold()).frame(width: 60, height: 56)
                }
                .buttonStyle(.bordered)
                .disabled(value == nil || value == 0)
                .accessibilityLabel("Decrease \(label)")
                TextField("Unknown", text: $text)
                    .keyboardType(.numberPad)
                    .font(.title.monospacedDigit().bold())
                    .multilineTextAlignment(.center)
                    .frame(minWidth: 90, minHeight: 56)
                    .background(MCIStyle.rowFill)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .accessibilityLabel("\(label) count")
                Button { value = (value ?? -1) + 1 } label: {
                    Image(systemName: "plus").font(.title2.bold()).frame(width: 60, height: 56)
                }
                .buttonStyle(.bordered)
                .accessibilityLabel("Increase \(label)")
                }
                Button("Unknown") { value = nil }
                    .buttonStyle(.bordered).frame(minHeight: 48)
                    .accessibilityLabel("Set \(label) to unknown")
            }
            Text(value == nil ? "Unknown" : "\(value!)").font(.caption).foregroundStyle(.secondary)
        }
        .onAppear { text = value.map(String.init) ?? "" }
        .onChange(of: value) { v in
            let s = v.map(String.init) ?? ""
            if s != text { text = s }
        }
        .onChange(of: text) { t in
            let digits = t.filter(\.isNumber)
            if digits != t { text = digits; return }
            let v: Int? = digits.isEmpty ? nil : Int(digits)
            if v != value { value = v }
        }
    }
}

struct MCIPDFPreview: UIViewRepresentable {
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

struct MCIHistoryList: View {
    let incident: MCIIncident
    let recordIDs: Set<UUID>?
    var limit = 15
    @State private var showAll = false

    var body: some View {
        let events = incident.events.filter { recordIDs?.contains($0.recordID) ?? true }.sorted { $0.recordedAt > $1.recordedAt }
        let shown = showAll ? events : Array(events.prefix(limit))
        VStack(alignment: .leading, spacing: 8) {
            if events.isEmpty { Text("No activity yet.").foregroundStyle(.secondary) }
            ForEach(shown) { e in
                VStack(alignment: .leading, spacing: 2) {
                    Text(incident.describe(e))
                    Text("\(incident.recordLabel(e.recordID)) · recorded \(MCIFmt.full(e.recordedAt, tz: incident.timeZone))\(mciSuffix(e.initials, " · "))")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Divider()
            }
            if events.count > limit {
                Button(showAll ? "Show fewer" : "Show all \(events.count) entries") { showAll.toggle() }.frame(minHeight: 48)
            }
        }
    }
}
