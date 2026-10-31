# Phase 3: deliver and archive

**Goal:** every open day, automatically, turn the decision into the technician's instruction, send it, record everything, hear back when the plate is up, and keep safe copies of it all.
**You end with:** a daily job that has run unattended for several weeks of rehearsal, sending to you instead of the museum, with a complete log and a tested backup.

This phase needs the reading from [phase 2](2-build-the-reading.md).
It can start in parallel with phase 2 on colour readings, since the decision looks the same either way.

## Opening prompt for your assistant

> Read AGENTS.md, docs/HANDOFF.md, docs/ARCHITECTURE.md (especially "Output seam" and "Known debts"), docs/next/3-deliver-and-archive.md, and spec.md (sections "Daily museum communication" and "Archive and interface").
> We are in phase 3: delivering and archiving the daily instruction.
> First explain in plain language what happens each day, from data to the technician's phone, and which decisions in this phase are mine.
> Then propose a plan for the first step only, and wait for my go-ahead.

## What happens each day

```
 at the agreed time
   1. gather the day's data package                     (phase 2)
   2. check the previous plate was confirmed installed
   3. decide the day's plate                            (the engine)
   4. compose the message, the record and the diagram
   5. send the message
   6. write everything to the log
   7. back up the log
   8. signal the museum antenna                         (separate hardware work in the brief)
 later
   9. the technician confirms, by photo or reply
  10. log the confirmation; the next day builds on it
```

Steps 3 and 4 are pure, the functional core: they decide and compose, and touch nothing.
The rest are the shell: they fetch, send and store, and decide nothing.
Ideally the core returns the day's effects as plain data, for example "send this text to the technician" and "write this record", and a small shell carries them out.
That way the whole day can be tested without sending anything, and a rehearsal is the real thing with the shell pointed at you.

### The log is the state

The engine keeps nothing between runs.
The log of confirmed decisions is the composition: each day, the job passes the confirmed decisions to `grow` as `kept`, and the engine reinstalls them exactly and decides only the new day (see "The engine's public interface" in `docs/ARCHITECTURE.md`).

The brief's rules for missed days follow from this:

- The next decision is not finalised until the previous plate is confirmed.
- If a day is missed, its instruction stands, and two plates can be installed on the next open day in their original order.
- If the technician placed a plate differently from the instruction, the log must record where it really went, since the next day depends on the real wall.
  Ask the artist how strictly the installation must follow the instruction, and design the confirmation around the answer.

## The steps

### 1. Move composing out of the page

Today the message (`messageLines`, `plainMessage`), the archive record (`renderRecord`) and the diagram drawing are written inside `index.html`, so nothing outside a browser can produce them.
Move them into a pure module, for example `report.js`, that takes a decision and returns the message text, the record and the diagram.
The page then uses that module too, so the screen and the sent message can never disagree.
Add tests: a known decision gives exactly the expected message and record.

The diagram is SVG today.
Many messaging apps do not show SVG, so the sent diagram probably needs to be a PNG image.
Converting one to the other is a technical decision for the assistant; it should explain the options and pick one.

### 2. Decide where the daily job runs and where its data lives

This is the most important technical decision in the phase, and it is constrained by one fact: **this repository is public, so the daily job's settings, keys, data and log cannot live in it.**
The job can reuse the engine from here; only its private side needs a home.

| Option | What it means | For | Against |
|---|---|---|---|
| A second, private repository for operations | This one stays the public bench and the home of the engine; the private one holds the daily job, its settings, the packages and the log, and takes the engine from here. | The public page stays exactly as it is; the private data is cleanly separate. | Two repositories to look after; the job must pick up engine changes from this one. |
| Make this repository private | Everything in one private place. | One repository. | Free GitHub Pages needs a public repository, so the bench page would need a paid GitHub plan or a different host. |
| A computer at the museum | The brief's museum-side Raspberry Pi runs the job and keeps the log. | Matches the brief; works through internet cuts for sending once the connection returns. | One machine to keep alive; backups must leave the building. |

Whichever is chosen, the job needs to run on a schedule on something that is always on: a small computer at the museum or the remote site, or a scheduled cloud service.
A personal laptop is not reliable enough.

Settle this with the original developer or a technical adviser if you can; it is hard to change later.

### 3. Choose how the instruction reaches the technician

Ask the technician what they actually use and would read every morning.
The brief names WhatsApp first and email as the backup.
Sending on two channels is sensible: if one fails, the other still arrives.

| Channel | Setup needed | Diagram image | Confirmation by reply | Notes |
|---|---|---|---|---|
| Email | An email account the job can send from, or a sending service. | Yes, as an attachment. | Yes, by replying, though reading replies automatically takes more work. | Simplest and most reliable. The brief's backup. |
| WhatsApp | A WhatsApp Business account through Meta, used directly or through a provider such as Twilio. | Yes. | Yes, including a photo. | Messages the business starts must use templates approved in advance; free-form replies are allowed for a limited time after the technician writes. Account verification can take weeks; start early. Check the current rules. |
| Text message (SMS) | A sending service and a phone number. | Only as a link. | Yes, by text. | Works on any phone; costs per message. |
| Telegram | A free bot, set up in minutes. | Yes. | Yes, including a photo. | Easiest to automate; only useful if the technician uses Telegram. |
| A web page | A private page showing today's instruction and diagram, and a button to confirm. | Yes, full size. | Yes, through the page. | Good as the reference everyone checks, alongside a short message that links to it. Must not be publicly visible. |

Whatever channel: keys and passwords for these services go in the job's private settings, never in a file in this repository.

### 4. Write the log

One record per open day, written when the instruction is sent and never edited afterwards.
It holds everything the brief's archive list asks for, most of which the page's archive record already produces:

- the raw data package and the reading made from it;
- the family, every candidate considered with its score, and why the winner was chosen;
- the state of the wall before the day;
- the plate, its position, nail, joins, orientation and relationship;
- the message exactly as sent, the diagram, where it was sent, and whether sending succeeded.

Confirmations, corrections and notes are separate entries appended later, pointing at the day they belong to.
Keeping the log append-only is what makes it trustworthy: nothing that happened can be silently rewritten.

Plain files (one JSON file per day, plus the diagram) are enough, and are easy to read, back up and export after the exhibition.

### 5. Back up

The log is the exhibition's memory; losing it means losing the composition.

- Keep at least three copies, on at least two different kinds of storage, at least one away from the museum.
  For example: the machine that runs the job, a private online repository, and a cloud storage folder.
- Make backups automatic, after every daily run.
- **Test a restore** before the exhibition opens: wipe a copy and rebuild the wall from the backup alone.
- After the exhibition, export the complete archive, as the brief asks.

### 6. Alerts

Someone must hear about it when something breaks: a data source is down, the visitor counter stops reporting, a message fails to send, the disk is filling, a confirmation has not arrived.
Send alerts to you, not the technician, on a different channel from the instruction if possible.

### 7. Rehearse

Run the whole job daily for several weeks with every message going to you instead of the museum.
Then rehearse the hard cases on purpose: a closed weekend, a missed day with two plates the next, a data source failing, the internet dropping, a wrong confirmation, a restore from backup.
The brief's testing phase lists these too.

## Done means

- [ ] The message, record and diagram come from one pure module that the page and the job share, with tests.
- [ ] Where the job runs and where its data lives is decided, written down, and nothing private is in this public repository.
- [ ] The technician has chosen the channel, and a backup channel is set up.
- [ ] Each day's record and every confirmation are logged append-only.
- [ ] Backups run automatically, and a restore has been tested.
- [ ] Failures raise alerts to you.
- [ ] Several weeks of rehearsal ran unattended, including the hard cases.
- [ ] `node tools/test.mjs` passes.
