import { useAppearance } from "../theme/ThemeContext";

export type ChartColors = {
  income: string;
  expense: string;
  net: string;
  balance: string;
  subscription: string;
  debt: string;
  positive: string;
  negative: string;
  piePalette: string[];
  tooltipBg: string;
  tooltipBorder: string;
  axisColor: string;
  gridColor: string;
  brushStroke: string;
};

export type ChartAnimation = {
  enabled: boolean;
  duration: number;
  easing: string;
};

export type ChartVisuals = {
  gradientOpacity: number;
  glowEnabled: boolean;
  gridStyle: "both" | "horizontal" | "none";
  curveType: "monotone" | "natural";
  dotStyle: "none" | "active" | "all";
  strokeWidth: number;
  barRadius: number;
};

export type ChartTheme = {
  colors: ChartColors;
  animation: ChartAnimation;
  visuals: ChartVisuals;
};

const defaultVisuals: ChartVisuals = {
  gradientOpacity: 0.35,
  glowEnabled: false,
  gridStyle: "both",
  curveType: "monotone",
  dotStyle: "active",
  strokeWidth: 2.5,
  barRadius: 6,
};

const themeMap: Record<string, ChartTheme> = {
  neon: {
    colors: {
      income: "#5fd39a", expense: "#ff7c7c", net: "#6ea8fe", balance: "#ffb26b",
      subscription: "#8ed0ff", debt: "#ff8a92", positive: "#84f2c8", negative: "#ff8a92",
      piePalette: ["#5fd39a", "#6ea8fe", "#ffb26b", "#ff7c7c", "#b892ff", "#7fe7ff", "#ffd86a", "#5ff0cf"],
      tooltipBg: "#0f1d43", tooltipBorder: "#2f61c0", axisColor: "#9fb8e9",
      gridColor: "rgba(138,171,230,0.28)", brushStroke: "#2f61c0",
    },
    animation: { enabled: true, duration: 300, easing: "ease-out" },
    visuals: { ...defaultVisuals, gradientOpacity: 0.38 },
  },
  soft: {
    colors: {
      income: "#5fd39a", expense: "#ff7c7c", net: "#6ea8fe", balance: "#ffb26b",
      subscription: "#8ed0ff", debt: "#ff8a92", positive: "#84f2c8", negative: "#ff8a92",
      piePalette: ["#5fd39a", "#6ea8fe", "#ffb26b", "#ff7c7c", "#b892ff", "#7fe7ff", "#ffd86a", "#5ff0cf"],
      tooltipBg: "#0f1d43", tooltipBorder: "#2f61c0", axisColor: "#9fb8e9",
      gridColor: "rgba(138,171,230,0.28)", brushStroke: "#2f61c0",
    },
    animation: { enabled: true, duration: 350, easing: "ease-out" },
    visuals: { ...defaultVisuals, gradientOpacity: 0.32 },
  },
  minimal: {
    colors: {
      income: "#5fd39a", expense: "#ff7c7c", net: "#6ea8fe", balance: "#ffb26b",
      subscription: "#8ed0ff", debt: "#ff8a92", positive: "#84f2c8", negative: "#ff8a92",
      piePalette: ["#5fd39a", "#6ea8fe", "#ffb26b", "#ff7c7c", "#b892ff", "#7fe7ff", "#ffd86a", "#5ff0cf"],
      tooltipBg: "#0f1d43", tooltipBorder: "#2f61c0", axisColor: "#9fb8e9",
      gridColor: "rgba(138,171,230,0.28)", brushStroke: "#2f61c0",
    },
    animation: { enabled: true, duration: 250, easing: "ease" },
    visuals: { ...defaultVisuals, gradientOpacity: 0.22, gridStyle: "horizontal", strokeWidth: 2 },
  },
  terminal: {
    colors: {
      income: "#45ff9a", expense: "#ff6b6b", net: "#66d9ef", balance: "#e6db74",
      subscription: "#66d9ef", debt: "#ff6b6b", positive: "#45ff9a", negative: "#ff6b6b",
      piePalette: ["#45ff9a", "#66d9ef", "#e6db74", "#ff6b6b", "#ae81ff", "#a6e22e", "#fd971f", "#f92672"],
      tooltipBg: "#0a0a0a", tooltipBorder: "#45ff9a", axisColor: "#7cfbc5",
      gridColor: "rgba(69,255,154,0.18)", brushStroke: "#45ff9a",
    },
    animation: { enabled: true, duration: 200, easing: "ease-out" },
    visuals: { ...defaultVisuals, gradientOpacity: 0.28, glowEnabled: true },
  },
  executive: {
    colors: {
      income: "#3FB950", expense: "#F85149", net: "#58A6FF", balance: "#D2A8FF",
      subscription: "#79C0FF", debt: "#F85149", positive: "#3FB950", negative: "#F85149",
      piePalette: ["#58A6FF", "#3FB950", "#D2A8FF", "#F85149", "#79C0FF", "#FFA657", "#FF7B72", "#56D4DD"],
      tooltipBg: "#161B22", tooltipBorder: "#30363D", axisColor: "#8b949e",
      gridColor: "rgba(48,54,61,0.6)", brushStroke: "#30363D",
    },
    animation: { enabled: true, duration: 450, easing: "ease-out" },
    visuals: { ...defaultVisuals, gradientOpacity: 0.32, gridStyle: "horizontal" },
  },
  futurist: {
    colors: {
      income: "#06D6A0", expense: "#EF4444", net: "#7C3AED", balance: "#06B6D4",
      subscription: "#06B6D4", debt: "#EF4444", positive: "#06D6A0", negative: "#EF4444",
      piePalette: ["#06D6A0", "#7C3AED", "#06B6D4", "#EF4444", "#F59E0B", "#EC4899", "#8B5CF6", "#14B8A6"],
      tooltipBg: "#0A1628", tooltipBorder: "#1E3A5F", axisColor: "#64748B",
      gridColor: "rgba(30,58,95,0.5)", brushStroke: "#1E3A5F",
    },
    animation: { enabled: true, duration: 650, easing: "ease" },
    visuals: { ...defaultVisuals, gradientOpacity: 0.48, glowEnabled: true, strokeWidth: 2.5 },
  },
  journalist: {
    colors: {
      income: "#0EA5E9", expense: "#DC2626", net: "#F97316", balance: "#8B5CF6",
      subscription: "#0EA5E9", debt: "#DC2626", positive: "#0EA5E9", negative: "#DC2626",
      piePalette: ["#F97316", "#0EA5E9", "#DC2626", "#8B5CF6", "#10B981", "#F59E0B", "#6366F1", "#EC4899"],
      tooltipBg: "#18181D", tooltipBorder: "#2D2D35", axisColor: "#71717A",
      gridColor: "rgba(45,45,53,0.4)", brushStroke: "#2D2D35",
    },
    animation: { enabled: true, duration: 800, easing: "ease-in-out" },
    visuals: { ...defaultVisuals, gradientOpacity: 0.18, gridStyle: "horizontal", curveType: "natural", strokeWidth: 2 },
  },
};

export function useChartTheme(): ChartTheme {
  const { appearance } = useAppearance();
  return themeMap[appearance.style] ?? themeMap.neon;
}
