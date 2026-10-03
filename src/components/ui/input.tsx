"use client";

import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputPrimitive.Props) {
  return (
    <InputPrimitive
      className={cn(
        "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/24 disabled:opacity-64 aria-invalid:border-destructive",
        className,
      )}
      data-slot="input"
      {...props}
    />
  );
}
