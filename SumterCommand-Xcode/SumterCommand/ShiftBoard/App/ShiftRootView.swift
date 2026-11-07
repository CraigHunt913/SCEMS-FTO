// ShiftRootView.swift
// Sumter EMS Command — Shift Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

// MARK: - Root

struct IDBox: Identifiable, Hashable { let id: UUID }

/// The Shift Board tab: its own store, navigation and privacy cover.
struct ShiftRootView: View {
    @StateObject private var store = Store()
    @Environment(\.scenePhase) private var scenePhase
    @State private var path: [UUID] = []

    var body: some View {
        ZStack {
            NavigationStack(path: $path) {
                if let problem = store.loadProblem {
                    RecoveryView(problem: problem)
                } else {
                    HomeView(path: $path)
                }
            }
            // Cover only once the app is in the background (app switcher). Covering on "inactive"
            // also fires during keyboard and system prompts, which can drop text-field focus.
            if scenePhase == .background {
                PrivacyCover()   // hides board content in the app switcher
            }
        }
        .environmentObject(store)
        .onChange(of: scenePhase) { phase in
            if phase == .active {
                store.applyIdleTimer()
            } else {
                store.flush()
                UIApplication.shared.isIdleTimerDisabled = false
            }
        }
    }
}

struct PrivacyCover: View {
    var body: some View {
        ZStack {
            Theme.navy.ignoresSafeArea()
            VStack(spacing: 8) {
                Text("SUMTER EMS COMMAND").font(.heading(.largeTitle)).foregroundStyle(.white)
                Text("Board hidden while the app is not active").foregroundStyle(.white.opacity(0.85))
            }
        }
    }
}

struct RecoveryView: View {
    @EnvironmentObject var store: Store
    let problem: String
    @State private var confirmSetAside = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Saved Board Could Not Be Opened").font(.heading(.largeTitle))
                Text(problem).font(.body)
                Text("Nothing has been deleted or replaced, and saving is paused so the file cannot be overwritten. You can try again (for example after freeing storage). Or move the unreadable file aside and start with an empty board; the moved file stays in this app's Documents/SumterCommand folder.")
                Button { store.load() } label: {
                    Text("Try Loading Again").frame(maxWidth: .infinity, minHeight: 56)
                }
                .buttonStyle(.borderedProminent).tint(Theme.navy)
                Button(role: .destructive) { confirmSetAside = true } label: {
                    Text("Move Unreadable File Aside…").frame(maxWidth: .infinity, minHeight: 56)
                }
                .buttonStyle(.bordered)
            }
            .padding(24)
            .frame(maxWidth: 760)
        }
        .confirmationDialog("Move the unreadable file aside and start an empty board?",
                            isPresented: $confirmSetAside, titleVisibility: .visible) {
            Button("Move Aside and Start Empty", role: .destructive) { store.setAsideUnreadableFile() }
        }
    }
}
