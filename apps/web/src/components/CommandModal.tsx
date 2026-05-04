"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const STATS_HOSTS = [
  { value: "", label: "Local (this Mac)" },
  { value: "vps-tailscale", label: "VPS (Tailscale)" },
  { value: "rentamac", label: "Rent-a-Mac" },
];

interface CommandModalProps {
  open: boolean;
  onSubmit: (command: string, shell: string, statsHost: string) => void;
  onClose: () => void;
}

export default function CommandModal({ open, onSubmit, onClose }: CommandModalProps) {
  const [command, setCommand] = useState("");
  const [shell, setShell] = useState("/bin/zsh");
  const [statsHost, setStatsHost] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setCommand("");
      setShell("/bin/zsh");
      setStatsHost("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (command.trim()) {
      onSubmit(command.trim(), shell, statsHost);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-lg border-[#444] bg-[#1e1e1e] text-[#cccccc]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-white">New Terminal</DialogTitle>
            <DialogDescription className="text-[#858585]">
              Configure the shell and command to auto-run on launch.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="shell" className="text-[#858585]">Shell</Label>
              <select
                id="shell"
                value={shell}
                onChange={(e) => setShell(e.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-[#cccccc] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 bg-[#252526] border-[#333]"
              >
                <option value="/bin/zsh">zsh</option>
                <option value="/bin/bash">bash</option>
                <option value="/bin/sh">sh</option>
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="command" className="text-[#858585]">Command to run</Label>
              <Input
                ref={inputRef}
                id="command"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="e.g. ssvs molt-0"
                className="bg-[#252526] border-[#333] text-[#cccccc] placeholder:text-[#555] focus-visible:border-[#4fc1ff]"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="stats-host" className="text-[#858585]">Stats source</Label>
              <select
                id="stats-host"
                value={statsHost}
                onChange={(e) => setStatsHost(e.target.value)}
                className="h-9 w-full rounded-lg border border-[#333] bg-[#252526] px-2.5 py-1 text-sm text-[#cccccc] outline-none focus-visible:border-[#4fc1ff]"
              >
                {STATS_HOSTS.map((h) => (
                  <option key={h.value} value={h.value}>
                    {h.label}
                  </option>
                ))}
              </select>
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
              Launch
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
