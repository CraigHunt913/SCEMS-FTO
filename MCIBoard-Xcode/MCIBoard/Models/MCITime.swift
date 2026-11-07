// MCITime.swift
// Sumter EMS Command — MCI Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

// MARK: - Time

enum MCIFmt {
    static func iso(_ d: Date) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: d)
    }

    static func parseISO(_ s: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)
    }

    static func formatter(_ pattern: String, _ tz: TimeZone) -> DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = tz
        f.dateFormat = pattern
        return f
    }

    static func calendar(_ tz: TimeZone) -> Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = tz
        return c
    }

    /// 24-hour time; adds the date when it differs from the reference day (multi-day incidents).
    static func clock(_ d: Date?, tz: TimeZone, ref: Date?) -> String {
        guard let d else { return "—" }
        if let ref, calendar(tz).isDate(d, inSameDayAs: ref) { return formatter("HH:mm", tz).string(from: d) }
        return formatter("MM/dd HH:mm", tz).string(from: d)
    }

    static func full(_ d: Date?, tz: TimeZone) -> String {
        guard let d else { return "—" }
        return formatter("yyyy-MM-dd HH:mm zzz", tz).string(from: d)
    }

    static func fileStamp(_ d: Date, tz: TimeZone) -> String { formatter("yyyy-MM-dd-HHmm", tz).string(from: d) }
    static func deviceClock(_ d: Date) -> String { formatter("HH:mm:ss", .current).string(from: d) }

    /// "Age unknown" when there is no time — never zero.
    static func age(of d: Date?, now: Date) -> String {
        guard let d else { return "age unknown" }
        let m = Int(now.timeIntervalSince(d) / 60)
        if m < 0 { return "time is later than now" }
        if m >= 60 { return "\(m / 60) h \(m % 60) min ago" }
        return "\(m) min ago"
    }
}
