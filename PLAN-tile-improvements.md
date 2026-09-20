# ReelGravity — Animation Fix v3: Surgical Search Animation

## Diagnosed Problems (root cause)

### Problem 1: "Remaining cards still fall from the top"
The heap effect depends on `[heapKey, reduced]`. Every search changes `heapKey` → full Matter engine recreation. The position preservation logic preserved positions in React state but the body creation read stale `positions` (from before the effect callback), falling back to seed → rest position → gravity drop.

### Problem 2: "Rising cards just appear at the top"
`setVelocity({ y: -1.5 })` gave tiny upward velocity from heap-bottom spawn position — barely visible rise before gravity + floor stopped it.

## Fix: Two distinct animation paths

### A. Intro (first load) — unchanged
- Tiles spawn above viewport, gravity does dramatic drop

### B. Search — "rise from heap bottom" for new tiles only
- **Existing heap tiles**: position preserved in `prevPositionsRef`, copied directly to body position, NO velocity → truly "does nothing"
- **New heap tiles** (were shortlisted, now back in heap): spawn at heap bottom rest position, get `vy = -3.5` + fan spread velocity → rises visibly out of the heap
- **Tiles moving to lifted zone**: handled by CSS `lift-in` animation (no Matter involvement)

### C. Root-cause fixes
- Line 152: `positions[id]` → `prevPositionsRef.current[id]` (no more stale closure)
- `setPositions` now only preserves positions for tiles still in heap (`previous[id]` check), new tiles get seeded
- Removed `"from-previous"` mode (simplified to intro/search/rest, rest handled by position preservation)
- Removed stagger `useEffect` (no longer needed — position preservation prevents fighting)

### D. Speed
- Gravity 0.825 (50% faster than 0.55), frictionAir 0.02

## Files
- `app/page.tsx` — seed modes, position preservation, velocity fan

## Acceptance
1. First load: cards drop from top ✓
2. Search: existing heap cards stay motionless, only new-from-shortlist cards rise
3. Shortlisted cards rise via CSS lift-in ✓
4. Build passes TS ✓