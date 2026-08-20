# Fulfilio client — design notes

Kept functional and minimal on purpose (the AI SaaS "Chat with PDF" project
already demonstrates polish/frontend range — this one is here to demonstrate
correct integration with a real backend: auth, RBAC-aware UI, optimistic +
realtime state, idempotent writes).

**Direction:** graphite ops console, not a marketing page. Background is a
near-black graphite (`#14161A`), not the warm-cream template look. One
signal color pair does the work: **amber** (`#E0A526`) for attention/pending
states and stock warnings, **freight-blue** (`#4C7EF3`) for "in motion"
states (PROCESSING/FULFILLING/SHIPPED). Red/green are reserved strictly for
terminal failure/success, never decoration.

**Type:** system sans for UI chrome, `ui-monospace` for anything that's
actually data — order IDs, SKUs, quantities, prices, timestamps — so scannable
numbers line up in a fixed-width grid the way they would in a real ops tool.

**Signature element:** the order **stage pipeline** (`OrderPipeline`
component) — a segmented tracker across the seven forward-moving order
states. This uses numbered/sequential markers deliberately, because
`OrderStatus` genuinely is a sequence in the schema, not a stylistic choice
applied to non-sequential content. Terminal states (CANCELLED / EXPIRED /
FAILED / REFUNDED) render as a broken red track instead of a pipeline
position, since they're exits from the sequence, not a step in it.

**Motion:** kept to short (150–200ms) transitions on state changes (status
badge color, pipeline fill, presence dot) — enough to make realtime updates
legible as *changes* rather than jarring reflows. No page-load choreography.
`prefers-reduced-motion` is respected via Tailwind's built-in `motion-reduce`
handling on the few transition utilities used.
