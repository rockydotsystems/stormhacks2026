"use client";

import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "@/components/ui/select";
import { useTheme } from "./theme-provider";

const items = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function ThemeSelect({ id }: { id?: string }) {
  const { preference, setPreference } = useTheme();
  return (
    <Select
      items={items}
      value={preference}
      onValueChange={(next) => {
        if (next === "system" || next === "light" || next === "dark")
          setPreference(next);
      }}
    >
      <SelectTrigger id={id} aria-label="Color theme">
        <SelectValue />
      </SelectTrigger>
      <SelectPopup>
        {items.map(({ value, label }) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}
