export type Condition = "good" | "warning" | "error" | "unknown";
export type Limits = Partial<
  Record<"warning_low" | "warning_high" | "error_low" | "error_high", number>
>;
export function condition(
  value: number | undefined | null,
  limits?: Limits,
): Condition {
  if (value == null || !Number.isFinite(value) || !limits) return "unknown";
  for (const state of ["error", "warning"] as const) {
    const low = limits[`${state}_low`],
      high = limits[`${state}_high`];
    if (
      (low !== undefined && value < low) ||
      (high !== undefined && value > high)
    )
      return state;
  }
  return "good";
}
export function worst(states: Condition[]): Condition {
  return states.includes("error")
    ? "error"
    : states.includes("warning")
      ? "warning"
      : states.includes("good")
        ? "good"
        : "unknown";
}
export function limitLabel(limits?: Limits): string {
  if (!limits) return "No thresholds";
  return (["warning", "error"] as const)
    .map((state) => {
      const low = limits[`${state}_low`],
        high = limits[`${state}_high`];
      return (
        conditionLabel(state) +
        ": " +
        [
          low !== undefined ? "< " + low : "",
          high !== undefined ? "> " + high : "",
        ]
          .filter(Boolean)
          .join(" or ")
      );
    })
    .join(" · ");
}

export function conditionLabel(state: Condition): string {
  return {
    good: "Good",
    warning: "Warning",
    error: "Critical",
    unknown: "No data",
  }[state];
}
