"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Rainbow-ordered swatches.
const TAB_COLORS = [
  "#e74856",
  "#f28b25",
  "#f1c40f",
  "#16c60c",
  "#61d6d6",
  "#4fc1ff",
  "#b180d7",
  "#f48fb1",
];

interface RenameTabModalProps {
  open: boolean;
  currentName: string;
  currentColor?: string;
  onSubmit: (name: string, color?: string) => void;
  onClose: () => void;
}

export default function RenameTabModal({
  open,
  currentName,
  currentColor,
  onSubmit,
  onClose,
}: RenameTabModalProps) {
  const [name, setName] = useState(currentName);
  const [color, setColor] = useState<string | undefined>(currentColor);
  const inputRef = useRef<HTMLInputElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const isCustomColor = Boolean(color) && !TAB_COLORS.includes(color!);

  useEffect(() => {
    if (open) {
      setName(currentName);
      setColor(currentColor);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, currentName, currentColor]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) {
      onSubmit(trimmed, color);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-lg border-[#444] bg-[#1e1e1e] text-[#cccccc]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-white">Tab properties</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="tab-name" className="text-[#858585]">
                Tab name
              </Label>
              <Input
                ref={inputRef}
                id="tab-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Servers"
                className="bg-[#252526] border-[#333] text-[#cccccc] placeholder:text-[#555] focus-visible:border-[#4fc1ff]"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-[#858585]">Tab color</Label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setColor(undefined)}
                  title="No color"
                  aria-label="No color"
                  className={`relative h-6 w-6 rounded-[4px] border border-[#555] bg-[#252526] ${
                    !color ? "ring-2 ring-white ring-offset-1 ring-offset-[#1e1e1e]" : ""
                  }`}
                >
                  <span className="absolute left-1/2 top-1/2 h-px w-4 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[#858585]" />
                </button>
                {TAB_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    title={c}
                    aria-label={`Tab color ${c}`}
                    className={`h-6 w-6 rounded-[4px] ${
                      color === c ? "ring-2 ring-white ring-offset-1 ring-offset-[#1e1e1e]" : ""
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <span className="relative ml-1 inline-flex">
                  <button
                    type="button"
                    onClick={() => colorInputRef.current?.click()}
                    title="Custom color..."
                    aria-label="Pick a custom color"
                    className={`relative h-6 w-6 rounded-full ${
                      isCustomColor ? "ring-2 ring-white ring-offset-1 ring-offset-[#1e1e1e]" : ""
                    }`}
                    style={{
                      background:
                        "conic-gradient(#e74856, #f28b25, #f1c40f, #16c60c, #61d6d6, #4fc1ff, #b180d7, #f48fb1, #e74856)",
                    }}
                  >
                    {isCustomColor && (
                      <span
                        className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white"
                        style={{ backgroundColor: color }}
                      />
                    )}
                  </button>
                  <input
                    ref={colorInputRef}
                    type="color"
                    value={isCustomColor ? color : "#4fc1ff"}
                    onChange={(e) => setColor(e.target.value)}
                    aria-hidden="true"
                    tabIndex={-1}
                    className="absolute bottom-0 left-0 h-0 w-0 border-0 p-0 opacity-0"
                  />
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-[#333] bg-transparent">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-[#444] bg-[#333] text-[#cccccc] hover:bg-[#444] hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-[#4fc1ff] text-black hover:bg-[#7dd4ff]"
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
