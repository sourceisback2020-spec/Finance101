import { useChartTheme } from "../ui/charts/chartTheme";

export function useChartAnimation() {
  const { animation } = useChartTheme();

  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const enabled = animation.enabled && !reducedMotion;

  return {
    isAnimationActive: enabled,
    animationDuration: enabled ? animation.duration : 0,
    animationEasing: (enabled ? "ease-out" : "ease") as "ease" | "ease-in" | "ease-out" | "ease-in-out" | "linear",
  };
}

/** Returns a stagger offset in ms for sequential series animation */
export function staggerDelay(seriesIndex: number) {
  return seriesIndex * 120;
}
