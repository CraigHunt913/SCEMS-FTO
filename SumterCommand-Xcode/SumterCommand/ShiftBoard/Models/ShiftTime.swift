// ShiftTime.swift
// Sumter EMS Command — Shift Board

import SwiftUI
import UIKit
import PencilKit
import PDFKit
import CoreText
import UniformTypeIdentifiers

// MARK: - Time

func iso(_ d: Date) -> String {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f.string(from: d)
}

func parseISO(_ s: String) -> Date? {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = f.date(from: s) { return d }
    f.formatOptions = [.withInternetDateTime]
    return f.date(from: s)
}

enum TimeFormat {
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

    /// 24-hour HH:mm; adds the date when it is not the shift's operational day.
    static func clock(_ d: Date?, tz: TimeZone, ref: Date?) -> String {
        guard let d else { return "—" }
        if let ref, calendar(tz).isDate(d, inSameDayAs: ref) {
            return formatter("HH:mm", tz).string(from: d)
        }
        return formatter("MM/dd HH:mm", tz).string(from: d)
    }

    static func full(_ d: Date?, tz: TimeZone) -> String {
        guard let d else { return "—" }
        return formatter("yyyy-MM-dd HH:mm zzz", tz).string(from: d)
    }

    static func day(_ d: Date, tz: TimeZone) -> String {
        formatter("EEE MM/dd/yyyy", tz).string(from: d)
    }

    static func fileDay(_ d: Date, tz: TimeZone) -> String {
        formatter("yyyy-MM-dd", tz).string(from: d)
    }

    static func deviceClock(_ d: Date) -> String {
        formatter("HH:mm:ss", .current).string(from: d)
    }

    /// The operational day is stored as noon in the shift's zone, so it never slips a day.
    static func noonOfDay(containing d: Date, tz: TimeZone) -> Date {
        let c = calendar(tz)
        var dc = c.dateComponents([.year, .month, .day], from: d)
        dc.hour = 12
        return c.date(from: dc) ?? d
    }

    /// A DatePicker works in the device calendar; convert its day to noon in the shift zone.
    static func noon(ofPicked picked: Date, in tz: TimeZone) -> Date {
        let comps = Calendar.current.dateComponents([.year, .month, .day], from: picked)
        var dc = DateComponents()
        dc.year = comps.year; dc.month = comps.month; dc.day = comps.day; dc.hour = 12
        return calendar(tz).date(from: dc) ?? picked
    }

    static func pickerDate(fromNoon d: Date, in tz: TimeZone) -> Date {
        let comps = calendar(tz).dateComponents([.year, .month, .day], from: d)
        var dc = DateComponents()
        dc.year = comps.year; dc.month = comps.month; dc.day = comps.day; dc.hour = 12
        return Calendar.current.date(from: dc) ?? d
    }

    static func elapsed(from: Date, to: Date) -> String {
        let minutes = Int(to.timeIntervalSince(from) / 60)
        if minutes < 0 { return "Time In is later than now" }
        if minutes >= 60 { return "\(minutes / 60) h \(minutes % 60) min" }
        return "\(minutes) min"
    }
}
