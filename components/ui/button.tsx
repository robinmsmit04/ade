import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime-300 disabled:pointer-events-none disabled:opacity-40 min-h-12 px-5 py-3",
  {
    variants: {
      variant: {
        default: "bg-lime-300 text-zinc-950 hover:bg-lime-200",
        secondary: "bg-zinc-800 text-white hover:bg-zinc-700",
        destructive: "bg-red-950 text-red-200 hover:bg-red-900",
        ghost: "text-zinc-300 hover:bg-zinc-800",
      },
    },
    defaultVariants: { variant: "default" },
  },
);
export function Button({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, className }))}
      {...props}
    />
  );
}
