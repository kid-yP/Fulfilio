import { ORDER_PIPELINE_STAGES, ORDER_TERMINAL_STATES, type OrderStatus } from "@/lib/types";

// The signature visual for the order detail/list views. OrderStatus is a
// genuine sequence in the schema (PENDING → … → DELIVERED), so a segmented
// stage tracker with position markers is informative here — not decoration.
// Terminal exits (CANCELLED/EXPIRED/REFUNDED/FAILED) render as a broken red
// track instead of a position on the pipeline, since they left the sequence
// rather than reaching a step in it.
export function OrderPipeline({ status }: { status: OrderStatus }) {
  const isTerminal = ORDER_TERMINAL_STATES.includes(status);

  if (isTerminal) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-signal-red/25" />
        <span className="font-mono text-xs uppercase tracking-widest2 text-signal-red">{status}</span>
      </div>
    );
  }

  const currentIndex = ORDER_PIPELINE_STAGES.indexOf(status);

  return (
    <div className="flex items-center">
      {ORDER_PIPELINE_STAGES.map((stage, i) => {
        const reached = i <= currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <div key={stage} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`h-2.5 w-2.5 rounded-full border transition-colors duration-200 motion-reduce:transition-none
                  ${
                    isCurrent
                      ? "border-amber-500 bg-amber-500"
                      : reached
                        ? "border-freight-500 bg-freight-500"
                        : "border-graphite-600 bg-graphite-800"
                  }`}
                aria-hidden
              />
              <span
                className={`whitespace-nowrap font-mono text-[10px] uppercase tracking-wide
                  ${isCurrent ? "text-amber-400" : reached ? "text-graphite-300" : "text-graphite-600"}`}
              >
                {stage}
              </span>
            </div>
            {i < ORDER_PIPELINE_STAGES.length - 1 && (
              <div
                className={`mx-1.5 h-px flex-1 transition-colors duration-200 motion-reduce:transition-none
                  ${i < currentIndex ? "bg-freight-500" : "bg-graphite-600"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
