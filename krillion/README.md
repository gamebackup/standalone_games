# Krillion — Offline Deep Dive

An offline, single-player reconstruction of [Krillion](https://playdaily.org/krillion): the rarest-answer dive where an open prompt, one accepted answer, and a bank of graded answers decide how deep your krill sinks.

No server, no account, no network requests. Open `index.html` and play.

## Play

| Mode | Rules |
|---|---|
| **Classic** | 7 prompts, 25 seconds each. One accepted answer ends a prompt. 700 points is a perfect dive: 7,000 m. |
| **Endless** | One prompt at a time with 3 tanks of air. Passing or timing out loses a tank; a **One in a Krillion** answer gives one back. Prompts get harder as you sink. |

- Every point = **10 metres**.
- Tiers: **One in a Krillion 100** · **Deep Cut 85** · **Rare 60** · **Schooler 30** · **Too Clever 15** · **Plankton 10**.
- Speed earns nothing. A refused answer only costs time, so you can keep reaching until the clock runs out.
- If the clock expires while text is in the box, that answer is submitted for you.
- Progress, personal bests and the last 280 prompts you saw are saved in `localStorage`.

## The answer bank

`data.js` is a generated bank of **859 prompts and 998,865 accepted answers** (about 16 MB, loaded locally as a plain script). It was merged from two public Krillion reveal datasets:

- [Microhx/krillion-answers](https://github.com/Microhx/krillion-answers) — full public reveal rows (prompt, answer, tier, category). Its `DATA-NOTICE.md` applies: prompts, answer lists and tiers remain the property of their respective owner; this copy is for personal offline reference and play, not a competing product.
- [KrillionHQ / StruggleYang krillion-dataset](https://github.com/StruggleYang/krillion-dataset) — daily dive tier samples, CC BY 4.0.

Duplicate prompts were merged. Where the same answer appeared with different grades across reveals, the most common grade won (ties go to the rarer grade). Answers longer than 100 characters and entries with no letters or digits were dropped; nothing else was invented or re-graded.

Matching is local and forgiving: case, accents, punctuation, `&`/`and`, leading articles, simple plurals and a one-character typo are accepted when the match is unambiguous. Anything outside the bank is refused. There is deliberately no AI fallback and no crowd lookup.

## Files

```
krillion/
├── index.html   markup and screens
├── style.css    ocean scene and UI
├── game.js      matching, scoring, timers, modes, persistence
├── data.js      generated answer bank (~16 MB)
└── README.md
```

The merged bank is already generated in `data.js`; no build step is needed to play. Regenerating it means downloading the two datasets above, flattening their rows, merging duplicate prompts, and choosing the modal tier per answer.

## Attribution

This is an unofficial tribute, not affiliated with or endorsed by Daily, playdaily.org, or the original Krillion. The game code here is original; the prompt/answer data is derived from the public datasets above and keeps their notices. If you are a rights holder and want data removed, delete `data.js`.
