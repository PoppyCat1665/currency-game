# Add "deepseek v4 flash" to the credit

## Goal
Mention `deepseek v4 flash` in the project credit alongside PoppyCat1665.

## Change
1. **index.html** (line 54): change
   `<p class="credit">Made with 💖 by PoppyCat1665</p>`
   to also include deepseek v4 flash, e.g.
   `<p class="credit">Made with 💖 by PoppyCat1665 + deepseek v4 flash</p>`

2. **README.md** (line 16): update the Credits section the same way, e.g.
   `Made with 💖 by [PoppyCat1665](https://github.com/PoppyCat1665) + deepseek v4 flash`

3. **Cache-bust**: bump the `?v=6` query params in `index.html` to `?v=7` so the updated menu credit loads in browsers that cache aggressively.

## Validation
- `node --check game.js` (unaffected, but confirm nothing else broke).
- Open the menu; the credit line shows both names.
- Commit and push to `main` if the user confirms (only commit/push when asked).

## Note
No logic changes. Implementation requires editing `index.html` and `README.md` — switch to an implementation-capable agent to apply.
