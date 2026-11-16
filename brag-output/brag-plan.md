# coffeeCart — brag plan

**What it is:** a coffee ordering system for when friends and family come over. Guests order from their phone, you run the bar from `/admin`, and their phone calls them when the cup is ready.
**For:** anyone with an espresso machine and guests. **Sets it apart:** one Python file, standard library only, runs on a Raspberry Pi 2, no build step.
**Most fun claim:** a full "your coffee is ready" alert, chime and vibration for a drink made ten feet away in your kitchen.
**Visual hook:** the glowing ASCII cup (the app's own `fx.js` swirl) on the espresso-dark stage.
**Share caption:** see `share-copy.txt`.

## Angle
Treat the living-room coffee bar like a real café launch, using the app's own copy ("Coffee, made to order", "the moment it is poured"). Show the full loop: order on the phone → card on the barista board → ready call on the phone.

## Tone & identity
`default`: punchy, clean, soft transitions. Real `app.css` / `admin.css`, Geist + Geist Mono, caramel `#b58459`, espresso `#1c0f08`, cream `#fff5e8`, accent `#f08a45`, ok-glow `#9be08a`. All CSS animations are disabled in the video and re-driven from the timeline so every frame is a pure function of time.

Names in the UI (Sam, Maya, Dev, Nana) are fictional stand-ins.

## Music
96 BPM (beat = 0.625s), C major, 36 beats = 22.5s. Chords per bar: C · Am · F · G · Am · F · C · G · C.
Soft kick/hat/bass/pad, marimba pluck lead from beat 10. Sound effects in key: taps as soft wood ticks, the app's own chimes (new order E5→A5 on beat 18 over Am; ready C5-E5-G5-C6 on beat 24 over C), quiet noise swells into each cut.

## Storyboard (all cuts on beats)
| # | Beats | Time | Scene | On-screen line |
|---|---|---|---|---|
| 1 Hook | 0–4 | 0–2.5s | Full-frame espresso stage, ASCII cup swirling; words land on beats | "Friends over? Open the bar." |
| 2 Reveal | 4–10 | 2.5–6.25s | Caramel wipe; phone rises showing the real guest hero (nav, "Coffee, made to order", ASCII stage, chips) | coffeeCart · "A coffee bar for your living room." |
| 3 Order | 10–18 | 6.25–11.25s | Phone scrolls to the form: type "Sam", tap Flat white, Oat, sugar 2 (cubes drop), Send → toast + live ticket "07" | "Guests order from their phone." |
| 4 Board | 18–24 | 11.25–15s | Admin board, three lanes; Sam's card lands (new-order chime), moves to Brewing, "Ready, call Sam" tapped → Ready lane | "You run the bar from /admin." |
| 5 Ready | 24–30 | 15–18.75s | Phone: full-screen ready call, ASCII glow, chime, phone buzz | "We call you the moment it's poured." |
| 6 Outro | 30–36 | 18.75–22.5s | coffeeCart wordmark over the ASCII cup | "Coffee, made to order. Made at home." |

Poster: settled frame from scene 5.
