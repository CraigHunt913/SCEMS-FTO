// MCIBoardApp.swift
// Sumter EMS Command — MCI Board
//
// An offline incident command board: a manually maintained coordination record.
// It is not an ePCR, triage decision tool, dispatch system or hospital-capacity feed.
// One iPad is the working copy. Exports and backups are not live sharing.
// Nothing here claims NIMS/ICS compliance, agency adoption or medical approval.

import SwiftUI

@main
struct MCIBoardApp: App {
    var body: some Scene {
        WindowGroup {
            MCIRootView()
        }
    }
}
