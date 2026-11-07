// SumterCommandTests.swift
// Runs both boards' built-in checks (the ones behind each Settings → Run Built-in Checks) as unit tests.

import XCTest
import PDFKit
@testable import SumterCommand

final class MCIBoardTests: XCTestCase {
    func testMCIBuiltInChecksAllPass() {
        let results = MCIChecks.run()
        XCTAssertFalse(results.isEmpty, "No MCI checks ran.")
        for r in results {
            XCTAssertTrue(r.passed, "\(r.name)\(r.detail.isEmpty ? "" : " — \(r.detail)")")
        }
    }

    func testBundledResourcesArePresent() {
        XCTAssertNotNil(MCIBundled.sketchCards, "Sumter_EMS_Scene_Sketch_Cards.pdf is missing from the app bundle.")
        XCTAssertNotNil(MCIBundled.sourceBoard, "Sumter_EMS_MCI_Command_Board_11x17.pdf is missing from the app bundle.")
        XCTAssertNotNil(MCIShield.image, "SumterShield is missing from Assets.xcassets.")
    }

    func testSketchCardsHaveThreeLetterLandscapePages() throws {
        let url = try XCTUnwrap(MCIBundled.sketchCards)
        let doc = try XCTUnwrap(PDFDocument(url: url))
        XCTAssertEqual(doc.pageCount, 3)
        let bounds = try XCTUnwrap(doc.page(at: 0)).bounds(for: .mediaBox)
        XCTAssertEqual(bounds.width, 792, accuracy: 1)
        XCTAssertEqual(bounds.height, 612, accuracy: 1)
    }
}

final class ShiftBoardTests: XCTestCase {
    func testShiftBuiltInChecksAllPass() {
        let results = SelfChecks.run()
        XCTAssertFalse(results.isEmpty, "No Shift Board checks ran.")
        for r in results {
            XCTAssertTrue(r.passed, "\(r.name)\(r.detail.isEmpty ? "" : " — \(r.detail)")")
        }
    }
}
