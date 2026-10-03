import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "flex min-h-24 w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink shadow-sm placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
