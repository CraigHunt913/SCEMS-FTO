# Sumter EMS Command — MCI Board (Xcode project)

An iPad app for running a mass-casualty incident board offline. This folder is
the complete Xcode project: the same app as the Swift Playgrounds version, split
into normal source files, with the sketch cards, the source board and the shield
built in, and the built-in checks run as unit tests.

**Status:** this code has not yet been compiled in Xcode. The project was written
in a cloud session with no Mac. Your first build is the first real compile. If
Xcode shows errors, see "If the build fails" below.

## What's in the folder

```
MCIBoard-Xcode/
  MCIBoard.xcodeproj        ← double-click this
  MCIBoard/
    App/                    app entry point and Home screen
    Models/ Rules/          records and the counting rules
    Persistence/            saving, backups
    Incident/               Overview, Command, Triage, Hospitals, Transport, Staging, Sketch
    Export/                 Incident Packet PDF
    Ink/                    PencilKit handwriting
    SharedUI/ Settings/ SourceBoard/ Diagnostics/
    Resources/
      Assets.xcassets       app icon, Sumter shield, accent color
      Sumter_EMS_Scene_Sketch_Cards.pdf        built-in sketch backgrounds
      Sumter_EMS_MCI_Command_Board_11x17.pdf   the original board (opened from Triage)
  MCIBoardTests/            unit tests (the app's built-in checks)
```

## Requirements

- A Mac with Xcode installed from the Mac App Store. Xcode 15 or later.
- An iPad on iPadOS 17 or later (the app is iPad-only).
- A free Apple ID is enough to run it on your own iPad.

## 1. Open the project

1. Get this folder onto the Mac, in one of two ways:
   - Download the attached `MCIBoard-Xcode.zip` and double-click it to unzip.
   - Or clone the repo: `git clone -b claude/new-session-4nfyl4 https://github.com/CraigHunt913/SCEMS-FTO.git`
     The project is in `SCEMS-FTO/MCIBoard-Xcode`.
2. Double-click **MCIBoard.xcodeproj**. Xcode opens it.
3. If Xcode asks whether to trust or open the project, choose **Open**.

## 2. Run it in the iPad Simulator first

1. At the top of the Xcode window, click the device menu next to **MCIBoard**.
2. Pick an iPad simulator, for example **iPad Pro 13-inch** or **iPad (A16)**.
   - If no iPad simulators are listed, open **Xcode → Settings → Components** and
     download the iOS platform.
3. Press **⌘R**, or click the ▶ button. The first build takes a minute or two.
4. The app opens in the simulator.
5. In the app, go to **Settings → Run Built-in Checks**. All 46 checks should pass.

## 3. Run the tests

- Press **⌘U**. Xcode builds the app and runs `MCIBoardTests`:
  - the 46 built-in checks
  - a check that the PDFs and the shield are in the app
  - a check that the sketch cards are 3 Letter landscape pages
- Results appear in the Test navigator (the diamond icon in the left sidebar).

## 4. Put it on your iPad

1. **Add your Apple ID to Xcode:** **Xcode → Settings → Accounts → +** →
   **Apple Account**, and sign in.
2. **Choose a signing team:**
   - Click **MCIBoard** at the top of the left sidebar.
   - Select the **MCIBoard** target, then the **Signing & Capabilities** tab.
   - Leave **Automatically manage signing** checked.
   - Set **Team** to your name, shown as "(Personal Team)".
3. **If Xcode says the bundle identifier is unavailable:** change **Bundle
   Identifier** to something unique, for example
   `org.sumterems.MCIBoard.chunt`.
4. **Connect the iPad:**
   - Plug it into the Mac with a USB-C cable and unlock it.
   - Tap **Trust** on the iPad and enter its passcode.
5. **Turn on Developer Mode** (first time only):
   - On the iPad, open **Settings → Privacy & Security → Developer Mode**, turn
     it on, and restart when asked.
   - After the restart, tap **Turn On** and enter the passcode.
   - The Developer Mode switch only appears after the iPad has been connected to
     Xcode once.
6. **Run it on the iPad:**
   - In Xcode's device menu, choose your iPad (under **iOS Device**), then
     press **⌘R**.
7. **If the iPad says "Untrusted Developer":**
   - Open **Settings → General → VPN & Device Management**, tap your Apple ID,
     then tap **Trust**.
   - Press ⌘R again.

**How long it stays installed:**
- With a free Apple ID (Personal Team), the app stops opening after **7 days**.
  Plug the iPad back in and press ⌘R to renew it. Your incidents stay on the
  iPad.
- A paid Apple Developer Program membership ($99 / year) extends this to a year
  and allows TestFlight.
- For agency use, your agency's own developer account and device management
  (MDM) are the right route.

## If the build fails

1. Open the **Issue navigator**: the ⚠︎ icon in the left sidebar, or **⌘5**.
2. Click the first red error to jump to the line.
3. Right-click the error → **Copy**, and paste the text to Claude, with the file
   name and line. A screenshot works too.

Fix one error at a time. Later errors are often caused by the first one.

## Data and safety notes

- Data is stored only on the iPad, in the app's Documents/MCIBoard folder, with
  iOS file protection. There is no network, account or cloud.
- iPad backups (iCloud or computer) may include the app's data, depending on the
  iPad's settings.
- The Playgrounds version and this Xcode version are separate apps, so their
  saved incidents are separate. To move an incident:
  1. In the Playgrounds app, go to **Export → Create Editable Backup File**.
  2. In this app, go to **Home → Import Incident Backup**.
- This is a manually maintained coordination board. It is not an ePCR, triage
  decision tool, dispatch interface or hospital-capacity feed. It is not
  certified, agency-approved or NIMS/ICS-compliance software.
- The START / JumpSTART / SALT text is the source board's, shown as reference
  only. Have your medical director review it before operational use.
- Exports and backups contain operational information. Handle them under agency
  policy.
