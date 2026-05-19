import * as React from "react";
import { cn } from "../cn";

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn("text-xs font-medium uppercase tracking-wider opacity-70", className)}
      {...props}
    />
  )
);
Label.displayName = "Label";
