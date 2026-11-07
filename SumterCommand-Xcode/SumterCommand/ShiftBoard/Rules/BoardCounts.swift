// BoardCounts.swift
// Sumter EMS Command — Shift Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

// MARK: - Counting

struct BoardCounts: Equatable {
    var onDuty = 0
    var inService = 0
    var available = 0
    var unknown = 0
    var oos = 0
    var offDuty = 0

    static let definition = """
    Trucks in Service = on-duty units whose recorded status is anything other than OOS or Unknown. \
    Busy units (ENR, SCN, TRN, HOS, CLR) still count as in service. \
    Available Now = on-duty units recorded AVL. CLR does not count as available. \
    Unknown = on-duty units with no recorded status. \
    Units not marked on duty, and units removed from the board, are not counted.
    """

    static func of(_ units: [RosterUnit]) -> BoardCounts {
        var c = BoardCounts()
        for u in units where !u.retired {
            guard u.onDuty else { c.offDuty += 1; continue }
            c.onDuty += 1
            switch u.status {
            case .unknown: c.unknown += 1
            case .oos: c.oos += 1
            case .avl: c.available += 1; c.inService += 1
            default: c.inService += 1
            }
        }
        return c
    }
}
