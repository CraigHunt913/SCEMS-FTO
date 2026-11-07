// TriageCategory.swift
// Sumter EMS Command — MCI Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

// MARK: - Categories (stable IDs, independent of colour)

enum TriageCategory: String, Codable, CaseIterable, Identifiable {
    case immediate, delayed, minor, expectant, deceased
    var id: String { rawValue }

    var name: String {
        switch self {
        case .immediate: return "Immediate"
        case .delayed: return "Delayed"
        case .minor: return "Minor / Minimal"
        case .expectant: return "Expectant"
        case .deceased: return "Deceased"
        }
    }
    var colorWord: String {
        switch self {
        case .immediate: return "RED"
        case .delayed: return "YELLOW"
        case .minor: return "GREEN"
        case .expectant: return "GRAY"
        case .deceased: return "BLACK"
        }
    }
    var abbr: String {
        switch self {
        case .immediate: return "R"
        case .delayed: return "Y"
        case .minor: return "G"
        case .expectant: return "EXP"
        case .deceased: return "DEC"
        }
    }
    var full: String { "\(name) / \(colorWord) / \(abbr)" }
    var swatch: Color {
        switch self {
        case .immediate: return Color(red: 0.78, green: 0.1, blue: 0.1)
        case .delayed: return Color(red: 0.98, green: 0.82, blue: 0.1)
        case .minor: return Color(red: 0.1, green: 0.5, blue: 0.2)
        case .expectant: return Color(white: 0.42)
        case .deceased: return Color.black
        }
    }
    var swatchText: Color { self == .delayed ? .black : .white }
    var uiSwatch: UIColor { UIColor(swatch) }
}

enum MCIUnclassified {
    static let key = "unclassified"
    static let label = "Not classified / UNK"
}

func mciCategoryLabel(_ c: TriageCategory?) -> String { c?.full ?? MCIUnclassified.label }
/// "" when the text is empty, otherwise the prefix followed by the text.
func mciSuffix(_ text: String, _ prefix: String) -> String { text.isEmpty ? "" : "\(prefix)\(text)" }
func mciCategoryShort(_ c: TriageCategory?) -> String { c.map { "\($0.abbr) \($0.name)" } ?? "UNK" }
