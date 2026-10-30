# Phase 1: choose the inputs

**Goal:** decide which public data sources and which on-site sensor will feed the system, and see real samples of each.
**You end with:** a written decision record, a saved sample of real data from every chosen source, and nothing in the engine changed yet.

## Opening prompt for your assistant

> Read AGENTS.md, docs/HANDOFF.md, docs/ARCHITECTURE.md, docs/next/1-choose-inputs.md and spec.md.
> We are in phase 1: choosing the inputs.
> First summarise in plain language what data the brief asks for and what each measurement would be used for.
> Then, one input at a time, lay out the realistic options with their trade-offs, check that each option is still available and what its terms are, and help me choose.
> Do not change the engine or the page in this phase.

## What the brief asks for

The brief (`spec.md`, section "Satellite") wants three kinds of signal, recorded as parallel streams:

- **Atmospheric electromagnetic activity**: VLF/ELF radio activity, local field variation, electrical noise, lightning-related activity.
- **Geomagnetic fluctuation**: three-axis magnetic field change.
- **Human presence**: an anonymous visitor count or occupancy at the remote site.
- Optionally, **sound or vibration**, kept as amplitude and frequency only, never as recordings.

From these the Interface computes standardised parameters: signal amplitude, variability, dominant frequency, directional magnetic bias, occupancy, and optionally vibration.
The current engine already has a slot for each of those (`params` in the reading; see `docs/ARCHITECTURE.md`).

The brief insists the system describe its data honestly.
In particular, it must not claim to measure Schumann resonances unless the hardware genuinely isolates them.
The same honesty applies to public data: a regional observatory's magnetometer is not a measurement at the remote site, and the exhibition text should say what the data really is.

## The big choice first: public data, on-site sensors, or both

The brief originally imagined a sensor station at the remote site measuring everything.
Public data sources can replace some of it, which changes how much hardware the site needs.
Settle this with the artist, and with the electronics specialist the brief mentions, before comparing individual sources.

| Approach | What it means | For | Against |
|---|---|---|---|
| All on site | VLF receiver, magnetometer and visitor counter at the remote site, as in the brief. | Every measurement is genuinely of that place. | Most hardware, most expertise, most that can fail; VLF is hard to measure cleanly near buildings. |
| Public data plus an on-site counter | Electromagnetic and geomagnetic data from public services; only the visitor counter (and maybe vibration) on site. | Far less hardware; data quality is professional; easy to test from anywhere. | The electromagnetic data is regional or global, not of the site; depends on outside services staying up. |
| Mixed | Public data as the backbone, plus one simple on-site electromagnetic or magnetic sensor. | Some genuinely local signal; public data covers outages. | Two kinds of system to maintain. |

## Candidate public data sources

These are starting points, not recommendations.
Before relying on any of them, your assistant must check that it still exists, how often it updates, whether it needs an account or key, and its terms of use, including whether data may be shown in an artwork and how it must be credited.

| Source | What it offers | Fits which parameter | Notes |
|---|---|---|---|
| NOAA Space Weather Prediction Center (swpc.noaa.gov) | Planetary K index, solar wind, geomagnetic storm alerts, as free JSON files. | Overall geomagnetic activity; a global "energy". | No key needed. Global, not local. |
| GFZ Potsdam Kp index (kp.gfz-potsdam.de) | The official Kp and related indices, updated through the day. | Overall geomagnetic activity. | Open licence with attribution. Global. |
| USGS Geomagnetism Program (usgs.gov/programs/geomagnetism) | Minute-by-minute three-axis readings from observatories, through a web service. | Directional magnetic bias, fluctuation, variability. | Free. Only useful if an observatory is reasonably near the site. |
| INTERMAGNET (intermagnet.org) | The worldwide network of magnetic observatories. | Same as USGS, for observatories outside the US. | Access and terms vary by observatory. |
| SuperMAG (supermag.jhuapl.edu) | Combined data from hundreds of ground magnetometers. | Fluctuation, direction. | Research service; check terms and timeliness. |
| Lightning networks: Blitzortung (blitzortung.org), WWLLN (wwlln.net), or a commercial provider | Lightning strike locations and counts. | Lightning-related activity; a stand-in for VLF atmospherics, which come mostly from lightning. | Community and academic networks have restrictive terms; commercial ones cost money. |
| NASA DONKI (via api.nasa.gov) | A catalogue of space-weather events: flares, storms, coronal mass ejections. | Event days; context. | Free key. Events, not a continuous signal. |
| Open-Meteo (open-meteo.com) | Weather at any location. | Context only; thunderstorm likelihood near the site. | Free, no key. |

Note what is missing: no public service offers a reliable, live feed of VLF radio activity or Schumann resonances at a given place.
If the artist wants genuinely local VLF data, it has to come from a receiver on site.

## Candidate on-site sensors

The visitor count is the one input that can only come from the site.
The brief prefers a time-of-flight bidirectional people counter, and allows a simple motion sensor only if counting is unnecessary.
Everything must stay anonymous: no cameras that store images, no microphones that keep sound, no phone or Wi-Fi tracking.

| Option | Measures | Anonymous | For | Against |
|---|---|---|---|---|
| Time-of-flight people counter, mounted over the doorway | Entries and exits, with direction. | Yes: depth only, no image. | The brief's preference; accurate counts. | Needs a doorway to mount over; commercial units can tie you to the vendor's cloud. |
| Do-it-yourself time-of-flight counter (a small distance sensor on a Raspberry Pi) | Entries and exits. | Yes. | Cheap; data stays local; full control. | Needs building and tuning; needs the electronics specialist. |
| Dual infrared break-beam | Passes through a doorway, with direction. | Yes. | Simple, cheap, robust. | Groups walking together count as one. |
| Low-resolution thermal sensor | People in a space, roughly counted. | Yes, if resolution is low. | Works without a doorway. | Less accurate; check the resolution truly cannot identify anyone. |
| Radar presence sensor | Whether people are present, and how many in some models. | Yes. | Works through enclosures, in the dark. | Counting is unreliable. |
| Passive infrared (motion) | Whether anyone is moving. | Yes. | Cheapest and simplest. | Presence only, no count. |
| Vibration or contact sensor (optional) | Footfall, structural vibration, sound level. | Yes, if only levels are kept. | Adds a "ritual" signal. | Optional in the brief; decide if it is wanted. |

Whatever the choice, the sensor's data must be readable by the system without a person in the loop.
Prefer sensors that keep data locally or expose it through a documented interface over ones that only show it in a vendor's app.
The brief also requires that the site keep recording during an internet outage and send the missing data when the connection returns.

## How to compare options

For each candidate, your assistant should answer:

1. **What exactly does it measure,** and how should the exhibition describe it honestly?
2. **Which parameter does it feed** (amplitude, variability, frequency, bias, occupancy, vibration)?
3. **How often does it update,** and is that enough for a daily decision?
4. **What does access require:** an account, a key, payment, hardware?
5. **What are the terms:** may it be used in an artwork, and how must it be credited?
6. **What happens when it fails:** how often is it down, and what would the system fall back to?
7. **Can we get historical data?** A few months of past data are needed in phase 2 to calibrate the numbers.

## What to produce

- **`docs/inputs.md`**: the decision record.
  For each chosen input: what it is, what it measures, which parameter it feeds, update rate, access and terms, credit line, fallback, and why it was chosen over the alternatives.
  Also list the options rejected and why.
  Keep it free of keys, passwords, exact site addresses and anything else private; this repository is public.
- **A small sample of real data from every chosen public source**, saved under `fixtures/` with a note of where and when it was fetched.
  Phase 2 builds and tests against these.
  Check the source's terms allow keeping a copy.
- **A small script per public source** (for example `tools/fetch-kp.mjs`) that fetches a day of data and prints it.
  These are shell code: fetch and print, no decisions.
- **For the on-site sensor:** a sample of the data it produces, from a test unit or the vendor's documentation, saved the same way.

## Done means

- [ ] The artist has agreed which approach (all on site, public plus counter, or mixed) to take.
- [ ] Every parameter the engine uses has a chosen source, or a written decision to drop or replace it.
- [ ] `docs/inputs.md` exists and records the choices and the reasons.
- [ ] A real sample from every chosen source is saved under `fixtures/`.
- [ ] Every chosen source has been checked for terms of use and credit requirements.
- [ ] Nothing private has been committed; `node tools/test.mjs` still passes.
