// MCIHandwriting.swift
// Sumter EMS Command — MCI Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

// MARK: - Handwriting (PencilKit)

final class MCIInkController: ObservableObject {
    weak var canvas: PKCanvasView?
    @Published var fingerDraw = false
    @Published var pageCount = 1
    @Published var erasedDrawing: PKDrawing?
    @Published var tool = 0   // 0 pen, 1 eraser, 2 lasso
    var width: CGFloat = 1024
    var pageHeight: CGFloat = 768
    var onChange: ((PKDrawing) -> Void)?

    func setTool(_ k: Int) {
        tool = k
        guard let c = canvas else { return }
        switch k {
        case 1: c.tool = PKEraserTool(.vector)
        case 2: c.tool = PKLassoTool()
        default: c.tool = PKInkingTool(.pen, color: .black, width: 4)
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
        let s = c.bounds.width / width
        c.minimumZoomScale = min(s, 0.3)
        c.maximumZoomScale = max(s * 4, 4)
        c.setZoomScale(s, animated: false)
    }

    func fitPage() {
        guard let c = canvas, c.bounds.width > 0, c.bounds.height > 0 else { return }
        let s = min(c.bounds.width / width, c.bounds.height / pageHeight)
        c.minimumZoomScale = min(s, 0.3)
        c.setZoomScale(s, animated: true)
    }

    func zoom(_ factor: CGFloat) {
        guard let c = canvas else { return }
        c.setZoomScale(min(max(c.zoomScale * factor, c.minimumZoomScale), c.maximumZoomScale), animated: true)
    }

    func scrollPage(_ delta: Int) {
        guard let c = canvas else { return }
        let step = c.bounds.height * 0.85 * CGFloat(delta)
        let maxY = max(0, c.contentSize.height - c.bounds.height)
        c.setContentOffset(CGPoint(x: c.contentOffset.x, y: min(max(0, c.contentOffset.y + step), maxY)), animated: true)
    }
}

struct MCIInkCanvas: UIViewRepresentable {
    let initial: PKDrawing
    let readOnly: Bool
    let background: UIImage?
    @ObservedObject var controller: MCIInkController

    func makeCoordinator() -> MCIInkCoordinator { MCIInkCoordinator(controller: controller, background: background) }

    func makeUIView(context: Context) -> PKCanvasView {
        let c = PKCanvasView()
        c.overrideUserInterfaceStyle = .light
        c.backgroundColor = .white
        c.isOpaque = true
        c.drawing = initial
        c.delegate = context.coordinator
        c.tool = PKInkingTool(.pen, color: .black, width: 4)
        c.drawingPolicy = controller.fingerDraw ? .anyInput : .pencilOnly
        c.drawingGestureRecognizer.isEnabled = !readOnly
        c.minimumZoomScale = 0.25
        c.maximumZoomScale = 5
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

    static func dismantleUIView(_ c: PKCanvasView, coordinator: MCIInkCoordinator) {
        coordinator.picker?.setVisible(false, forFirstResponder: c)
        coordinator.picker?.removeObserver(c)
        c.resignFirstResponder()
    }
}

final class MCIInkCoordinator: NSObject, PKCanvasViewDelegate {
    let controller: MCIInkController
    let background: UIImage?
    var picker: PKToolPicker?
    var separators: [UIView] = []
    var backgroundView: UIImageView?

    init(controller: MCIInkController, background: UIImage?) {
        self.controller = controller
        self.background = background
    }

    func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) { controller.onChange?(canvasView.drawing) }

    func scrollViewDidZoom(_ scrollView: UIScrollView) {
        if let c = scrollView as? PKCanvasView { layout(c) }
    }

    /// Fixed logical page × zoom. The locked background sits behind the ink and is not ink, so erasing cannot remove it.
    func layout(_ c: PKCanvasView) {
        let z = c.zoomScale
        let pages = max(1, controller.pageCount)
        let size = CGSize(width: controller.width * z, height: controller.pageHeight * CGFloat(pages) * z)
        if c.contentSize != size { c.contentSize = size }
        if let bg = background {
            if backgroundView == nil {
                let v = UIImageView(image: bg)
                v.contentMode = .scaleAspectFit
                v.isUserInteractionEnabled = false
                c.insertSubview(v, at: 0)
                backgroundView = v
            }
            backgroundView?.frame = CGRect(x: 0, y: 0, width: controller.width * z, height: controller.pageHeight * z)
        }
        while separators.count < pages - 1 {
            let v = UIView()
            v.backgroundColor = UIColor.systemBlue.withAlphaComponent(0.35)
            v.isUserInteractionEnabled = false
            c.insertSubview(v, at: 0)
            separators.append(v)
        }
        while separators.count > pages - 1 { separators.removeLast().removeFromSuperview() }
        for (i, v) in separators.enumerated() {
            v.frame = CGRect(x: 0, y: controller.pageHeight * CGFloat(i + 1) * z - 1, width: size.width, height: 2)
        }
    }
}

struct MCIHandwritingEditor: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.dismiss) private var dismiss
    let target: MCIInkTarget
    let readOnly: Bool
    let background: UIImage?
    var allowPages = true
    @StateObject private var controller = MCIInkController()
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
                        Text("Handwriting Could Not Be Read").font(.mciHeading(.title2))
                        Text(loadError)
                        Text("The stored data has not been changed and is still included in backups.").font(.footnote)
                    }
                    .padding().frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let initial {
                    MCIInkCanvas(initial: initial, readOnly: readOnly, background: background, controller: controller)
                        .id(target.id)
                } else {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                Text(controller.fingerDraw
                     ? "Finger Draw on: one finger writes; two fingers scroll and zoom, or use the page and zoom buttons. Ink is an attachment and never changes counts, categories, locations or times."
                     : "Apple Pencil writes; fingers scroll and pinch to zoom. Turn on Finger Draw to write without a Pencil. Ink is an attachment and never changes counts, categories, locations or times.")
                    .font(.footnote).foregroundStyle(.secondary).padding(8)
            }
            .navigationTitle(target.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .status) { MCISaveStatus() }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { store.flush(); dismiss() }.accessibilityLabel("Done, close handwriting")
                }
            }
        }
        .task { load() }
        .confirmationDialog("Erase all handwriting on every page of this attachment? The background is not affected.",
                            isPresented: $confirmErase, titleVisibility: .visible) {
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
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 8)], spacing: 8) { controlButtons }
                .padding(8)
        }
    }

    @ViewBuilder
    var controlButtons: some View {
            toolButton("Pen", "pencil.tip", 0)
            toolButton("Eraser", "eraser", 1)
            toolButton("Lasso", "lasso", 2)
            Button { controller.undo() } label: { cell("Undo", "arrow.uturn.backward") }.buttonStyle(.bordered)
            Button { controller.redo() } label: { cell("Redo", "arrow.uturn.forward") }.buttonStyle(.bordered)
            Button { controller.fingerDraw.toggle() } label: {
                cell(controller.fingerDraw ? "Finger Draw: On" : "Finger Draw: Off", "hand.draw")
            }
            .buttonStyle(.borderedProminent).tint(controller.fingerDraw ? MCIStyle.navy : Color.gray)
            Group {
                if allowPages {
                    Button {
                        controller.pageCount += 1
                        if let c = controller.canvas { store.saveInk(target, drawing: c.drawing, pageCount: controller.pageCount) }
                    } label: { cell("Add Page", "doc.badge.plus") }.buttonStyle(.bordered)
                    Button { controller.scrollPage(-1) } label: { cell("Page Up", "chevron.up") }.buttonStyle(.bordered)
                    Button { controller.scrollPage(1) } label: { cell("Page Down", "chevron.down") }.buttonStyle(.bordered)
                }
                Button { controller.zoom(1.25) } label: { cell("Zoom In", "plus.magnifyingglass") }.buttonStyle(.bordered)
                Button { controller.zoom(0.8) } label: { cell("Zoom Out", "minus.magnifyingglass") }.buttonStyle(.bordered)
                Button { controller.fitPage() } label: { cell("Reset Zoom", "arrow.up.left.and.down.right.magnifyingglass") }.buttonStyle(.bordered)
            }
            if controller.erasedDrawing != nil {
                Button { controller.restoreErased() } label: { cell("Undo Erase All", "arrow.uturn.backward.circle") }
                    .buttonStyle(.borderedProminent).tint(MCIStyle.navy)
            } else {
                Button(role: .destructive) { confirmErase = true } label: { cell("Erase All…", "trash") }.buttonStyle(.bordered)
            }
    }

    func toolButton(_ title: String, _ icon: String, _ k: Int) -> some View {
        Button { controller.setTool(k) } label: { cell(title, icon) }
            .buttonStyle(.borderedProminent)
            .tint(controller.tool == k ? MCIStyle.navy : Color.gray)
            .accessibilityAddTraits(controller.tool == k ? .isSelected : [])
    }

    func cell(_ title: String, _ icon: String) -> some View {
        Label(title, systemImage: icon).font(.subheadline.bold()).frame(maxWidth: .infinity, minHeight: 44)
    }

    func load() {
        guard initial == nil, loadError == nil else { return }
        controller.width = target.width
        controller.pageHeight = target.pageHeight
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
