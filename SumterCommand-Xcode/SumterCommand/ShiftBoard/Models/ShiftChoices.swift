// ShiftChoices.swift
// Sumter EMS Command — Shift Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

// MARK: - Choices

enum UnitStatus: String, Codable, CaseIterable, Identifiable {
    case unknown, avl, enr, scn, trn, hos, clr, oos
    var id: String { rawValue }

    var abbr: String {
        switch self {
        case .unknown: return "UNK"
        case .avl: return "AVL"
        case .enr: return "ENR"
        case .scn: return "SCN"
        case .trn: return "TRN"
        case .hos: return "HOS"
        case .clr: return "CLR"
        case .oos: return "OOS"
        }
    }

    var fullName: String {
        switch self {
        case .unknown: return "Unknown / Not recorded"
        case .avl: return "In service / Available"
        case .enr: return "En route"
        case .scn: return "On scene"
        case .trn: return "Transporting"
        case .hos: return "At hospital"
        case .clr: return "Clearing"
        case .oos: return "Out of service"
        }
    }

    var milestone: Milestone? {
        switch self {
        case .enr: return .enRoute
        case .scn: return .onScene
        case .trn: return .transporting
        case .hos: return .atHospital
        case .clr: return .clear
        default: return nil
        }
    }

    var isBusy: Bool { [.enr, .scn, .trn, .hos].contains(self) }

    var color: Color {
        switch self {
        case .unknown: return Color(white: 0.38)
        case .avl: return Color(red: 0.0, green: 0.43, blue: 0.2)
        case .enr: return Color(red: 0.1, green: 0.3, blue: 0.72)
        case .scn: return Color(red: 0.42, green: 0.2, blue: 0.6)
        case .trn: return Color(red: 0.62, green: 0.33, blue: 0.0)
        case .hos: return Color(red: 0.0, green: 0.4, blue: 0.46)
        case .clr: return Color(red: 0.27, green: 0.35, blue: 0.45)
        case .oos: return Theme.brick
        }
    }
}

enum Milestone: String, Codable, CaseIterable, Identifiable {
    case dispatched, enRoute, onScene, transporting, atHospital, clear
    var id: String { rawValue }

    var label: String {
        switch self {
        case .dispatched: return "Dispatched"
        case .enRoute: return "En Route"
        case .onScene: return "On Scene"
        case .transporting: return "Transporting"
        case .atHospital: return "At Hospital"
        case .clear: return "Clear"
        }
    }

    var short: String {
        switch self {
        case .dispatched: return "Disp"
        case .enRoute: return "EnR"
        case .onScene: return "OnS"
        case .transporting: return "Trn"
        case .atHospital: return "Hos"
        case .clear: return "Clr"
        }
    }
}

enum ResponsePriority: String, Codable, CaseIterable, Identifiable {
    case notRecorded, p1, p2, p3
    var id: String { rawValue }
    var label: String {
        switch self {
        case .notRecorded: return "Not recorded"
        case .p1: return "P1"
        case .p2: return "P2"
        case .p3: return "P3"
        }
    }
    var short: String { self == .notRecorded ? "—" : label }
}

enum Determinant: String, Codable, CaseIterable, Identifiable {
    case notRecorded, omega, alpha, bravo, charlie, delta, echo
    var id: String { rawValue }
    var label: String {
        switch self {
        case .notRecorded: return "Not recorded"
        case .omega: return "O Omega"
        case .alpha: return "A Alpha"
        case .bravo: return "B Bravo"
        case .charlie: return "C Charlie"
        case .delta: return "D Delta"
        case .echo: return "E Echo"
        }
    }
    var short: String { self == .notRecorded ? "—" : label }
}

enum PendingState: String, Codable, CaseIterable {
    case pending, assigned, cancelled
    var label: String {
        switch self {
        case .pending: return "Pending"
        case .assigned: return "Assigned"
        case .cancelled: return "Cancelled"
        }
    }
}

enum ShiftState: String, Codable { case active, archived }
