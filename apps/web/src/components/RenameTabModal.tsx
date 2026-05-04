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

interface RenameTabModalProps {
  open: boolean;
  currentName: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

export default function RenameTabModal({
  open,
  currentName,
  onSubmit,
  onClose,
}: RenameTabModalProps) {
  const [name, setName] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(currentName);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, currentName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) {
      onSubmit(trimmed);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-lg border-[#444] bg-[#1e1e1e] text-[#cccccc]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-white">Rename Tab</DialogTitle>
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
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
