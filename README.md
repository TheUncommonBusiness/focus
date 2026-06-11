# Uncommon Focus

Endless focus music with a built-in session timer. Built by The Uncommon Business team, for the team.

**Live app:** https://theuncommonbusiness.github.io/focus/

## What it does

- **8 endless channels** — lofi, synthwave, binaural beats, piano, jazz, rain, space ambient, and classical. Sourced from 24/7 YouTube live streams and long-form focus videos. If a stream ever dies, the channel rotates to a backup source automatically.
- **Session timer** — pick 25/5, 50/10, 90/15, or set your own focus/break lengths. The ring fills as you work, a chime marks each phase change, and the tab title shows your countdown.
- **Keyboard control** — `Space` to play/pause, `N` for the next stream, `R` to reset.
- Your channel, volume, and session settings are saved in your browser.

## How to use it

Open the live link, pick a channel, hit play. That's the whole onboarding.

## Stack

Plain HTML, CSS, and JavaScript on GitHub Pages. The YouTube IFrame API handles playback. No build step, no dependencies, no accounts.

## Adding or fixing a channel

Channels live at the top of `app.js`. Each one is a name, a description, a swatch gradient, and a list of YouTube video IDs (first ID is primary, the rest are fallbacks). Add an ID, push to `main`, and Pages redeploys.
