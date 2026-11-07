# Sumter EMS Command (Xcode project)

One app, two tabs, for **iPhone and iPad** (iOS / iPadOS 17 or later):

- **Shift Board:** your Sumter County EMS shift command board. It covers units
  by station, status and run times, crews, calls holding, system status,
  handwriting, PDF export and backups.
- **MCI Board:** the incident command board. It covers Command, Triage counts,
  Hospitals and Aid, Transport, Staging, scene sketches on the original cards,
  and the 11×17 incident packet.

Each board keeps its own saved data. Both work offline with no account.

**Status:** this code has not yet been compiled in Xcode. It was written in a
cloud session with no Mac, so your first build is the first real compile. If
Xcode shows errors, see "If the build fails" below.

## What's in the folder

```
SumterCommand-Xcode/
  SumterCommand.xcodeproj       ← double-click this
  SumterCommand/
    App/SumterCommandApp.swift  the two tabs
    ShiftBoard/                 Shift Board (App, Board, Models, Rules, Persistence, Ink, Export, Settings, Shared)
    MCI/                        MCI Board (App, Incident, Models, Rules, Persistence, Ink, Export, Settings, SharedUI, SourceBoard)
    Resources/
      Assets.xcassets           app icon, Sumter shield, accent color
      Sumter_EMS_Scene_Sketch_Cards.pdf        built-in sketch backgrounds
      Sumter_EMS_MCI_Command_Board_11x17.pdf   original MCI board (opened from Triage)
  SumterCommandTests/           unit tests: both boards' built-in checks
```

## Requirements

- A Mac with Xcode from the Mac App Store, Xcode 15 or later.
- An iPhone or iPad on iOS / iPadOS 17 or later.
- A free Apple ID is enough to run it on your own devices.

## 1. Open the project

1. Get the folder onto the Mac:
   - Unzip the attached `SumterCommand-Xcode.zip`.
   - Or clone the repo:
     `git clone -b claude/new-session-4nfyl4 https://github.com/CraigHunt913/SCEMS-FTO.git`
     The project is in `SCEMS-FTO/SumterCommand-Xcode`.
2. Double-click **SumterCommand.xcodeproj**.

## 2. Try it in the Simulator

1. In the device menu at the top of Xcode, pick a simulator, for example
   **iPhone 16** or **iPad Pro 13-inch**.
   - If the list is empty, open **Xcode → Settings → Components** and download
     the iOS platform.
2. Press **⌘R**.
3. In the app, open each tab's **Settings → Run Built-in Checks**:
   - Shift Board: 41 checks.
   - MCI Board: 46 checks.
   - All of them should pass.

Try both an iPhone and an iPad simulator. On iPhone the screens stack
vertically, and the MCI sections and handwriting tools scroll sideways.

## 3. Run the tests

Press **⌘U**. This runs both boards' built-in checks, plus checks that the PDFs
and shield are bundled and that the sketch cards are 3 Letter landscape pages.

## 4. Put it on your iPhone or iPad

1. Add your Apple ID: **Xcode → Settings → Accounts → +** → **Apple Account**.
2. Choose a team:
   - Click **SumterCommand** at the top of the left sidebar.
   - Select the **SumterCommand** target, then the **Signing & Capabilities**
     tab.
   - Set **Team** to "(Personal Team)".
3. If Xcode says the bundle identifier is unavailable, change it to something
   unique, for example `org.sumterems.SumterCommand.chunt`.
4. Plug in the iPhone or iPad with a cable, unlock it, and tap **Trust**.
5. Turn on Developer Mode (first time on each device):
   - On the device, open **Settings → Privacy & Security → Developer Mode**.
   - Turn it on, restart, then tap **Turn On**.
6. Choose the device in Xcode's device menu and press **⌘R**.
7. If the device says "Untrusted Developer":
   - Open **Settings → General → VPN & Device Management**, tap your Apple ID,
     then tap **Trust**.
   - Press **⌘R** again.

Repeat steps 4–6 for the second device. The same project installs on both.

**How long it stays installed:**
- With a free Apple ID, the app stops opening after **7 days**. Reconnect the
  device and press **⌘R** to renew it. Your data stays on the device.
- A free Apple ID can also have only a few such apps installed per device.
- A paid Apple Developer Program membership ($99 / year) extends this to a year
  and allows TestFlight.
- For agency rollout, use the agency's developer account and device management
  (MDM).

## If the build fails

1. Open the Issue navigator: press **⌘5**.
2. Click the first red error.
3. Right-click it → **Copy**, and paste the text to Claude with the file name.

Fix one error at a time; later errors often come from the first one.

## Notes

- **Where data is stored:**
  - Shift Board: `Documents/SumterCommand`.
  - MCI Board: `Documents/MCIBoard`.
  - Both use iOS file protection. Nothing goes over the network.
  - iCloud or computer backups of the device may include this data, depending
    on device settings.
- **Moving data between the Playgrounds apps and this app:**
  1. Export a backup in the Playgrounds app.
  2. Import it in the matching tab of this app.
  3. The import arrives read-only. Tap **Reopen** to edit it.
- **What this app is:** a manually maintained working board. It is not an ePCR,
  dispatch system, triage decision tool or hospital-capacity feed. It is not
  certified, agency-approved or NIMS/ICS-compliance software.
- **Triage reference:** the START / JumpSTART / SALT text is the source board's,
  shown as reference only. Have it reviewed by your medical director before
  operational use.
- **Exports and backups** contain operational information. Handle them under
  agency policy.
