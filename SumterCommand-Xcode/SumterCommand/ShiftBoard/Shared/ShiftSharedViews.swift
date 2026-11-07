// ShiftSharedViews.swift
// Sumter EMS Command — Shift Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

// MARK: - Shared UI

struct SectionBox<Content: View>: View {
    let title: String
    var accent: Color = Theme.navy
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title.uppercased())
                .font(.heading(.headline))
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
        .overlay(Rectangle().stroke(Theme.navy.opacity(0.35), lineWidth: 1))
    }
}

struct StatusBadge: View {
    let status: UnitStatus
    var body: some View {
        Text(status.abbr)
            .font(.heading(.title3))
            .foregroundStyle(.white)
            .padding(.horizontal, 10).padding(.vertical, 4)
            .frame(minWidth: 64)
            .background(status.color)
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .accessibilityLabel("Status \(status.fullName)")
    }
}

struct TagText: View {
    let text: String
    var color: Color = Theme.brick
    var body: some View {
        Text(text).font(.caption.bold()).foregroundStyle(.white)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(color).clipShape(Capsule())
    }
}

struct BigButtonLabel: View {
    let title: String
    let systemImage: String
    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.headline)
            .frame(maxWidth: .infinity, minHeight: 56)
    }
}

struct SaveStatusView: View {
    @EnvironmentObject var store: Store
    var body: some View {
        switch store.saveState {
        case .idle:
            Label("No unsaved changes", systemImage: "checkmark.circle").foregroundStyle(.secondary)
        case .pending, .saving:
            Label("Saving…", systemImage: "clock")
        case .saved(let d):
            Label("Saved \(TimeFormat.deviceClock(d))", systemImage: "checkmark.circle.fill").foregroundStyle(.secondary)
        case .failed(let msg):
            HStack(spacing: 10) {
                Label("Save Failed", systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(Theme.brick).font(.headline)
                    .accessibilityHint(msg)
                Button("Retry") { store.saveNow() }.buttonStyle(.borderedProminent).tint(Theme.brick)
            }
        }
    }
}

struct SaveFailureBanner: View {
    @EnvironmentObject var store: Store
    var body: some View {
        if case .failed(let msg) = store.saveState {
            VStack(alignment: .leading, spacing: 6) {
                Text("SAVE FAILED — your changes are still on screen but are not yet stored.").font(.headline)
                Text(msg).font(.footnote)
                Button("Retry Save") { store.saveNow() }.buttonStyle(.borderedProminent).tint(.white)
                    .foregroundStyle(Theme.brick)
            }
            .foregroundStyle(.white)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.brick)
        }
    }
}

struct OptionGrid<Option: Hashable & Identifiable>: View {
    let options: [Option]
    let selected: Option
    let title: (Option) -> String
    var minWidth: CGFloat = 110
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
                        .background(isOn ? Theme.navy : Theme.rowFill)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8)
                            .stroke(isOn ? Theme.navy : Color.secondary.opacity(0.4), lineWidth: isOn ? 3 : 1))
                }
                .buttonStyle(.plain)
                .disabled(disabled)
                .accessibilityLabel(title(o))
                .accessibilityAddTraits(isOn ? .isSelected : [])
            }
        }
    }
}

struct LabeledTextField: View {
    @EnvironmentObject var store: Store
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
                .background(Theme.rowFill)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.secondary.opacity(0.5)))
                .focused($focused)
                .disabled(readOnly)
                .submitLabel(.done)
        }
        .onChange(of: focused) { f in if !f { store.flush() } }
    }
}

struct InkTarget: Identifiable, Hashable {
    var shiftID: UUID
    var recordID: UUID
    var fieldID: String
    var title: String
    var id: String { "\(recordID.uuidString)|\(fieldID)" }
}

/// Typed editor (Scribble works here) with an optional Handwriting attachment beside it.
struct LongTextEditor: View {
    @EnvironmentObject var store: Store
    let label: String
    @Binding var text: String
    var minHeight: CGFloat = 120
    var readOnly = false
    var ink: InkTarget? = nil
    @FocusState private var focused: Bool
    @State private var expanded = false
    @State private var showInk: InkTarget?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Text(label).font(.heading(.title3))
                Spacer()
                Button { expanded = true } label: {
                    Label("Expand", systemImage: "arrow.up.left.and.arrow.down.right").frame(minHeight: 40)
                }
                .buttonStyle(.bordered)
                .accessibilityLabel("Expand \(label) editor")
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
                .background(Theme.rowFill)
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
            ExpandedTextEditor(label: label, text: $text, readOnly: readOnly).environmentObject(store)
        }
        .fullScreenCover(item: $showInk) { t in
            HandwritingEditor(target: t, readOnly: readOnly).environmentObject(store)
        }
    }
}

struct ExpandedTextEditor: View {
    @EnvironmentObject var store: Store
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
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { store.flush(); dismiss() }.accessibilityLabel("Done editing \(label)")
                    }
                    ToolbarItem(placement: .status) { SaveStatusView() }
                }
        }
    }
}

struct TimeEditSheet: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    let original: Date?
    let tz: TimeZone
    let onSave: (Date?, String) -> Void
    @State private var value: Date
    @State private var reason = ""

    init(title: String, original: Date?, tz: TimeZone, onSave: @escaping (Date?, String) -> Void) {
        self.title = title
        self.original = original
        self.tz = tz
        self.onSave = onSave
        _value = State(initialValue: original ?? Date())
    }

    var needsReason: Bool { original != nil }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Current: \(TimeFormat.full(original, tz: tz))")
                    Text("Earlier values are kept in history. Out-of-order or retrospective times are allowed and will be flagged, not changed.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Section("New date and time (\(tz.identifier), 24-hour)") {
                    DatePicker("Time", selection: $value, displayedComponents: [.date, .hourAndMinute])
                        .datePickerStyle(.graphical)
                        .environment(\.timeZone, tz)
                        .environment(\.locale, Locale(identifier: "en_GB"))
                    Text("Selected: \(TimeFormat.full(value, tz: tz))").font(.headline)
                    if value > Date().addingTimeInterval(300) {
                        Text("This time is in the future.").foregroundStyle(Theme.brick)
                    }
                }
                Section(needsReason ? "Reason for correction (required)" : "Note (optional)") {
                    TextField("Reason", text: $reason).frame(minHeight: 44)
                }
                if needsReason {
                    Section {
                        Button("Clear This Time", role: .destructive) {
                            onSave(nil, reason.trimmed)
                            dismiss()
                        }
                        .disabled(reason.trimmed.isEmpty)
                    }
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave(value, reason.trimmed.isEmpty ? (needsReason ? "" : "Entered") : reason.trimmed)
                        dismiss()
                    }
                    .disabled(needsReason && reason.trimmed.isEmpty)
                }
            }
        }
    }
}

struct TimeRow: View {
    let label: String
    let value: Date?
    let tz: TimeZone
    let ref: Date
    let readOnly: Bool
    let onNow: () -> Void
    let onSet: (Date?, String) -> Void
    @State private var editing = false

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.headline)
                Text(value == nil ? "Not recorded" : TimeFormat.clock(value, tz: tz, ref: ref))
                    .font(.title3.monospacedDigit())
                    .foregroundStyle(value == nil ? .secondary : .primary)
            }
            Spacer()
            if !readOnly {
                if value == nil {
                    Button("Now", action: onNow)
                        .buttonStyle(.borderedProminent).tint(Theme.navy)
                        .frame(minWidth: 72, minHeight: 48)
                        .accessibilityLabel("Set \(label) to now")
                }
                Button(value == nil ? "Enter…" : "Correct…") { editing = true }
                    .buttonStyle(.bordered)
                    .frame(minHeight: 48)
                    .accessibilityLabel(value == nil ? "Enter \(label) time" : "Correct \(label) time")
            }
        }
        .frame(minHeight: 56)
        .sheet(isPresented: $editing) {
            TimeEditSheet(title: label, original: value, tz: tz, onSave: onSet)
        }
    }
}
