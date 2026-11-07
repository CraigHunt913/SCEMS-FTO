// ShiftHandwriting.swift
// Sumter EMS Command — Shift Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

// MARK: - Handwriting (PencilKit)

enum InkLayout {
    /// Fixed logical page in document coordinates; ink never depends on screen size or rotation.
    static let width: CGFloat = 1024
    static let pageHeight: CGFloat = 768
}

enum InkToolKind { case pen, eraser, lasso }

final class InkController: ObservableObject {
    weak var canvas: PKCanvasView?
    @Published var fingerDraw = false
    @Published var pageCount = 1
    @Published var erasedDrawing: PKDrawing?
    @Published var tool: InkToolKind = .pen
    var onChange: ((PKDrawing) -> Void)?

    func setTool(_ k: InkToolKind) {
        tool = k
        guard let c = canvas else { return }
        switch k {
        case .pen: c.tool = PKInkingTool(.pen, color: .black, width: 4)
        case .eraser: c.tool = PKEraserTool(.vector)
        case .lasso: c.tool = PKLassoTool()
        }
    }

    func undo() { canvas?.undoManager?.undo() }
    func redo() { canvas?.undoManager?.redo() }

    func eraseAll() {
        guard let c = canvas else { return }
        erasedDrawing = c.drawing
        c.drawing = PKDrawing()
        onChange?(c.drawing)
    }

    func restoreErased() {
        guard let c = canvas, let d = erasedDrawing else { return }
        c.drawing = d
        erasedDrawing = nil
        onChange?(d)
    }

    func fitWidth() {
        guard let c = canvas, c.bounds.width > 0 else { return }
        let s = c.bounds.width / InkLayout.width
        c.minimumZoomScale = min(s, 0.5)
        c.maximumZoomScale = max(s * 3, 3)
        c.setZoomScale(s, animated: false)
    }

    func scrollPage(_ delta: Int) {
        guard let c = canvas else { return }
        let step = c.bounds.height * 0.85 * CGFloat(delta)
        let maxY = max(0, c.contentSize.height - c.bounds.height)
        let y = min(max(0, c.contentOffset.y + step), maxY)
        c.setContentOffset(CGPoint(x: c.contentOffset.x, y: y), animated: true)
    }
}

struct InkCanvas: UIViewRepresentable {
    let initial: PKDrawing
    let readOnly: Bool
    @ObservedObject var controller: InkController

    func makeCoordinator() -> InkCoordinator { InkCoordinator(controller: controller) }

    func makeUIView(context: Context) -> PKCanvasView {
        let c = PKCanvasView()
        c.overrideUserInterfaceStyle = .light      // stable paper and ink colours in dark mode
        c.backgroundColor = .white
        c.isOpaque = true
        c.drawing = initial
        c.delegate = context.coordinator
        c.tool = PKInkingTool(.pen, color: .black, width: 4)
        c.drawingPolicy = controller.fingerDraw ? .anyInput : .pencilOnly
        c.drawingGestureRecognizer.isEnabled = !readOnly
        c.minimumZoomScale = 0.25
        c.maximumZoomScale = 4
        c.alwaysBounceVertical = true
        c.accessibilityLabel = "Handwriting canvas"
        controller.canvas = c
        let coordinator = context.coordinator
        coordinator.layout(c)
        if !readOnly {
            let picker = PKToolPicker()
            coordinator.picker = picker
            picker.addObserver(c)
            picker.setVisible(true, forFirstResponder: c)
        }
        let ctl = controller
        DispatchQueue.main.async {
            ctl.fitWidth()
            coordinator.layout(c)
            if !readOnly { c.becomeFirstResponder() }
        }
        return c
    }

    func updateUIView(_ c: PKCanvasView, context: Context) {
        c.drawingPolicy = controller.fingerDraw ? .anyInput : .pencilOnly
        context.coordinator.layout(c)
    }

    static func dismantleUIView(_ c: PKCanvasView, coordinator: InkCoordinator) {
        coordinator.picker?.setVisible(false, forFirstResponder: c)
        coordinator.picker?.removeObserver(c)
        c.resignFirstResponder()
    }
}

final class InkCoordinator: NSObject, PKCanvasViewDelegate {
    let controller: InkController
    var picker: PKToolPicker?
    var separators: [UIView] = []

    init(controller: InkController) { self.controller = controller }

    func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
        controller.onChange?(canvasView.drawing)
    }

    func scrollViewDidZoom(_ scrollView: UIScrollView) {
        if let c = scrollView as? PKCanvasView { layout(c) }
    }

    /// Content size follows the fixed logical page × zoom; page breaks are drawn as thin guides.
    func layout(_ c: PKCanvasView) {
        let z = c.zoomScale
        let pages = max(1, controller.pageCount)
        let size = CGSize(width: InkLayout.width * z, height: InkLayout.pageHeight * CGFloat(pages) * z)
        if c.contentSize != size { c.contentSize = size }
        while separators.count < pages - 1 {
            let v = UIView()
            v.backgroundColor = UIColor.systemBlue.withAlphaComponent(0.35)
            v.isUserInteractionEnabled = false
            c.insertSubview(v, at: 0)
            separators.append(v)
        }
        while separators.count > pages - 1 { separators.removeLast().removeFromSuperview() }
        for (i, v) in separators.enumerated() {
            v.frame = CGRect(x: 0, y: InkLayout.pageHeight * CGFloat(i + 1) * z - 1, width: size.width, height: 2)
        }
    }
}

struct HandwritingEditor: View {
    @EnvironmentObject var store: Store
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.dismiss) private var dismiss
    let target: InkTarget
    let readOnly: Bool
    @StateObject private var controller = InkController()
    @State private var initial: PKDrawing?
    @State private var loadError: String?
    @State private var confirmErase = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if !readOnly && loadError == nil { controls }
                Divider()
                if let loadError {
                    VStack(spacing: 12) {
                        Text("Handwriting Could Not Be Read").font(.heading(.title2))
                        Text(loadError)
                        Text("The stored data has not been changed. It is still included in backups.").font(.footnote)
                    }
                    .padding().frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let initial {
                    InkCanvas(initial: initial, readOnly: readOnly, controller: controller)
                        .id(target.id)
                } else {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                Text(controller.fingerDraw
                     ? "Finger Draw is on: one finger writes; use two fingers to scroll or zoom, or the Page Up / Page Down buttons. Handwriting is kept as an attachment and is never read or turned into statuses, times or counts."
                     : "Apple Pencil writes; fingers scroll and zoom. Turn on Finger Draw to write without a Pencil. Handwriting is kept as an attachment and is never read or turned into statuses, times or counts.")
                    .font(.footnote).foregroundStyle(.secondary).padding(8)
            }
            .navigationTitle(target.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .status) { SaveStatusView() }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { store.flush(); dismiss() }.accessibilityLabel("Done, close handwriting")
                }
            }
        }
        .task { load() }
        .confirmationDialog("Erase all handwriting on every page of this attachment?", isPresented: $confirmErase,
                            titleVisibility: .visible) {
            Button("Erase All", role: .destructive) { controller.eraseAll() }
        }
    }

    @ViewBuilder
    var controls: some View {
        if sizeClass == .compact {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) { controlButtons }.padding(8)
            }
        } else {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 128), spacing: 8)], spacing: 8) { controlButtons }
                .padding(8)
        }
    }

    @ViewBuilder
    var controlButtons: some View {
            toolButton("Pen", "pencil.tip", .pen)
            toolButton("Eraser", "eraser", .eraser)
            toolButton("Lasso", "lasso", .lasso)
            Button { controller.undo() } label: { cell("Undo", "arrow.uturn.backward") }.buttonStyle(.bordered)
            Button { controller.redo() } label: { cell("Redo", "arrow.uturn.forward") }.buttonStyle(.bordered)
            Button {
                controller.pageCount += 1
                if let c = controller.canvas { store.saveInk(target, drawing: c.drawing, pageCount: controller.pageCount) }
            } label: { cell("Add Writing Page", "doc.badge.plus") }.buttonStyle(.bordered)
            Button { controller.fingerDraw.toggle() } label: {
                cell(controller.fingerDraw ? "Finger Draw: On" : "Finger Draw: Off", "hand.draw")
            }
            .buttonStyle(.borderedProminent).tint(controller.fingerDraw ? Theme.navy : Color.gray)
            Group {
            Button { controller.scrollPage(-1) } label: { cell("Page Up", "chevron.up") }.buttonStyle(.bordered)
            Button { controller.scrollPage(1) } label: { cell("Page Down", "chevron.down") }.buttonStyle(.bordered)
            Button { controller.fitWidth() } label: { cell("Fit Width", "arrow.left.and.right") }.buttonStyle(.bordered)
            if controller.erasedDrawing != nil {
                Button { controller.restoreErased() } label: { cell("Undo Erase All", "arrow.uturn.backward.circle") }
                    .buttonStyle(.borderedProminent).tint(Theme.navy)
            } else {
                Button(role: .destructive) { confirmErase = true } label: { cell("Erase All…", "trash") }.buttonStyle(.bordered)
            }
            }
    }

    func toolButton(_ title: String, _ icon: String, _ kind: InkToolKind) -> some View {
        Button { controller.setTool(kind) } label: { cell(title, icon) }
            .buttonStyle(.borderedProminent)
            .tint(controller.tool == kind ? Theme.navy : Color.gray)
            .accessibilityAddTraits(controller.tool == kind ? .isSelected : [])
    }

    func cell(_ title: String, _ icon: String) -> some View {
        Label(title, systemImage: icon).font(.subheadline.bold()).frame(maxWidth: .infinity, minHeight: 44)
    }

    func load() {
        guard initial == nil, loadError == nil else { return }
        if let att = store.ink(target) {
            do {
                initial = try PKDrawing(data: att.drawing)
                controller.pageCount = max(1, att.pageCount)
            } catch {
                loadError = "This handwriting attachment is damaged or unreadable."
                return
            }
        } else {
            initial = PKDrawing()
        }
        guard !readOnly else { return }
        let s = store
        let t = target
        let ctl = controller
        ctl.onChange = { [weak s, weak ctl] d in
            guard let s, let ctl else { return }
            s.saveInk(t, drawing: d, pageCount: ctl.pageCount)
        }
    }
}
