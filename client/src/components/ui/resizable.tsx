"use client";

import type * as React from "react";
import { GripVertical } from "lucide-react";
import * as ResizablePrimitive from "react-resizable-panels";

import { cn } from "~/lib/utils";

type ResizablePanelGroupProps = Omit<
  React.ComponentProps<typeof ResizablePrimitive.Group>,
  "orientation"
> & {
  direction?: "horizontal" | "vertical";
};

function ResizablePanelGroup({
  className,
  direction = "horizontal",
  ...props
}: ResizablePanelGroupProps) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      orientation={direction}
      className={cn("flex h-full min-h-0 w-full min-w-0", className)}
      {...props}
    />
  );
}

function ResizablePanel({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Panel>) {
  return (
    <ResizablePrimitive.Panel
      data-slot="resizable-panel"
      className={cn("min-h-0 min-w-0", className)}
      {...props}
    />
  );
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Separator> & {
  withHandle?: boolean;
}) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        "focus-visible:ring-ring data-[separator=active]:bg-primary/40 data-[separator=focus]:bg-primary/40 relative flex w-px cursor-col-resize touch-none items-center justify-center bg-transparent transition-colors after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 hover:bg-primary/30 focus-visible:bg-primary/30 focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-none aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:cursor-row-resize aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-1 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2 [&:focus-visible>div]:opacity-100 [&:hover>div]:opacity-100 [&[aria-orientation=horizontal]>div]:rotate-90 data-[separator=active]:[&>div]:opacity-100 data-[separator=focus]:[&>div]:opacity-100",
        className,
      )}
      {...props}
    >
      {withHandle ? (
        <div className="border-border bg-border z-10 flex h-4 w-3 items-center justify-center rounded-xs border opacity-0 transition-opacity">
          <GripVertical className="h-2.5 w-2.5" aria-hidden="true" />
        </div>
      ) : null}
    </ResizablePrimitive.Separator>
  );
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
