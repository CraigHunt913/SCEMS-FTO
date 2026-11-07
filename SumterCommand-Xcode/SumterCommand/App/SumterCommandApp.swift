// SumterCommandApp.swift
// Sumter EMS Command — one app with the Shift Board and the MCI Board, for iPad and iPhone.
//
// Local-only working boards. No network, no accounts, no cloud.
// Not an ePCR, dispatch system, triage decision tool or hospital-capacity feed.
// Nothing here claims NIMS/ICS compliance, agency adoption or medical approval.

import SwiftUI

@main
struct SumterCommandApp: App {
    var body: some Scene {
        WindowGroup {
            SumterCommandRoot()
        }
    }
}

/// Two boards, each with its own saved data, navigation and save status.
struct SumterCommandRoot: View {
    @SceneStorage("selectedBoard") private var selected = "shift"

    var body: some View {
        TabView(selection: $selected) {
            ShiftRootView()
                .tabItem { Label("Shift Board", systemImage: "list.bullet.rectangle") }
                .tag("shift")
            MCIRootView()
                .tabItem { Label("MCI Board", systemImage: "exclamationmark.triangle") }
                .tag("mci")
        }
        .tint(MCIStyle.navy)
    }
}
