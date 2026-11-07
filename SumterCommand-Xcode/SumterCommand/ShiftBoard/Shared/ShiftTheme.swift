// ShiftTheme.swift
// Sumter EMS Command — Shift Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

// MARK: - Theme

enum Theme {
    static var navy: Color { Color(red: 22 / 255, green: 50 / 255, blue: 75 / 255) }
    static var brick: Color { Color(red: 181 / 255, green: 48 / 255, blue: 31 / 255) }
    static var slate: Color { Color(red: 44 / 255, green: 61 / 255, blue: 79 / 255) }
    static var rowFill: Color {
        Color(uiColor: UIColor { t in
            t.userInterfaceStyle == .dark
                ? UIColor(white: 0.15, alpha: 1)
                : UIColor(red: 246 / 255, green: 243 / 255, blue: 236 / 255, alpha: 1)
        })
    }
    static var uiNavy: UIColor { UIColor(red: 22 / 255, green: 50 / 255, blue: 75 / 255, alpha: 1) }
    static var uiBrick: UIColor { UIColor(red: 181 / 255, green: 48 / 255, blue: 31 / 255, alpha: 1) }
    static var uiRow: UIColor { UIColor(red: 246 / 255, green: 243 / 255, blue: 236 / 255, alpha: 1) }
}

extension Font {
    /// Condensed bold is for headings only.
    static func heading(_ style: Font.TextStyle) -> Font {
        .system(style, design: .default, weight: .bold).width(.condensed)
    }
}

extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
    var orDash: String { trimmed.isEmpty ? "—" : self }
    var orNotRecorded: String { trimmed.isEmpty ? "Not recorded" : self }
}
