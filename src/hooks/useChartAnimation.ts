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
    animationEasing: animation.easing as "ease" | "ease-in" | "ease-out" | "ease-in-out" | "linear",
  };
}
