"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemeName } from "./ThemeProvider";
import { cn } from "@/lib/cn";

const OPTIONS: { value: ThemeName; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "enterprise", label: "Enterprise", icon: Monitor },
];

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="flex items-center gap-1 rounded-full border border-line bg-surface p-1"
    >
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(opt.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-[var(--dur-micro)]",
              active
                ? "bg-primary text-on-brand"
                : "text-ink-secondary hover:bg-surface-sunken"
            )}
          >
            <Icon size={14} strokeWidth={2} />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
