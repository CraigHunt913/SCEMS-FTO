# The screens

Six role screens for the field training portal, drawn against the doctrine
rather than against the spreadsheet.

    Main.dc.html        Training Division — the validation queue
    Decision.dc.html    Returning a skill — where the friction belongs
    FTO.dc.html         Field Training Officer — who you rode with
    Trainee.dc.html     Trainee — what each skill still needs
    Medical.dc.html     Medical Director — clinical questions only
    Scoreboard.dc.html  Per-officer accountability, built to be forwarded

`canvas.json` places them and carries the notes.

## What they are arguing

One click and defensible are not in tension, because the click is not empty.
The Chief's card carries the four evidence counts, the FTO's own words, and —
underneath the button — the sign-off row that gets written the moment it is
pressed. You see the record before you commit to it.

Returning a skill is the opposite: the button stays dead until the reasons are
typed. `Never invent an FTO's words` applies to adverse findings, so that is
the one place friction appears, and the only one.

The four bars on every skill are the catalog thresholds: successful reps,
independent reps, distinct dates, distinct FTOs. The same four appear on the
trainee's screen, unsoftened, because "what is still missing" is the only
question they have.

## Colours and type are not new

Lifted from `portal/Index.html`: Barlow Semi Condensed and Source Sans 3,
navy `#12233b`, EMT `#2f7d4f` / Advanced EMT `#1f5f9e` / Paramedic `#a8342b`
as a spine down each card, 9px radii, the existing light and dark palettes.
IBM Plex Mono is the one addition, for identifiers and counts — a UUID set in
a text face reads as decoration.

## Rebuilding the canvas

    node <design-skill>/seed-canvas.mjs \
      --template <design-skill>/payload.template.html \
      --out scems-field-training-screens.html \
      --title "SCEMS Field Training Screens" \
      --artboard Main.dc.html --artboard Decision.dc.html --artboard FTO.dc.html \
      --artboard Trainee.dc.html --artboard Medical.dc.html --artboard Scoreboard.dc.html \
      --canvas canvas.json

The output is gitignored: it is these files wrapped around a 2 MB copy of the
editor, regenerated on demand.
