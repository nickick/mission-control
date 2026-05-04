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

interface SetCommandModalProps {
  open: boolean;
  terminalName: string;
  currentCommand: string;
  currentStatsHost: string;
  onSubmit: (values: { name: string; command: string; statsHost: string }) => void;
  onClose: () => void;
}

export default function SetCommandModal({
  open,
  terminalName,
  currentCommand,
  currentStatsHost,
  onSubmit,
  onClose,
}: SetCommandModalProps) {
  const [name, setName] = useState(terminalName);
  const [command, setCommand] = useState(currentCommand);
  const [statsHost, setStatsHost] = useState(currentStatsHost);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(terminalName);
      setCommand(currentCommand);
      setStatsHost(currentStatsHost);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, terminalName, currentCommand, currentStatsHost]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name: name.trim() || terminalName,
      command: command.trim(),
      statsHost: statsHost.trim(),
    });
  };

  const handleClear = () => {
    setCommand("");
    setStatsHost("");
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-lg border-[#444] bg-[#1e1e1e] text-[#cccccc]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-white">
              Configure {terminalName}
            </DialogTitle>
            <DialogDescription className="text-[#858585]">
              Set name, command to run on spawn / refresh, and stats source.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="term-name" className="text-[#858585]">
                Name
              </Label>
              <Input
                id="term-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. molt-0"
                className="bg-[#252526] border-[#333] text-[#cccccc] placeholder:text-[#555] focus-visible:border-[#4fc1ff]"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="set-cmd" className="text-[#858585]">
                Command to run on spawn / refresh
              </Label>
              <Input
                ref={inputRef}
                id="set-cmd"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="e.g. npm run dev, ssvta molt-0"
                className="bg-[#252526] border-[#333] text-[#cccccc] placeholder:text-[#555] focus-visible:border-[#4fc1ff]"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="stats-host" className="text-[#858585]">
                Stats source
              </Label>
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
              onClick={handleClear}
              className="border-[#444] bg-[#333] text-[#cccccc] hover:bg-[#444] hover:text-white"
            >
              Clear
            </Button>
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
              Set
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
