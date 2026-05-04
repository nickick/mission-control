"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface DeleteTabModalProps {
  open: boolean;
  tabName: string;
  onConfirm: () => void;
  onClose: () => void;
}

export default function DeleteTabModal({
  open,
  tabName,
  onConfirm,
  onClose,
}: DeleteTabModalProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-lg border-[#444] bg-[#1e1e1e] text-[#cccccc]">
        <DialogHeader>
          <DialogTitle className="text-[#e74856]">Delete Tab</DialogTitle>
          <DialogDescription className="text-[#858585]">
            Are you sure you want to delete{" "}
            <span className="text-white font-medium">{tabName}</span>? All
            terminals in this tab will be permanently removed.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="border-t border-[#333] bg-transparent pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="border-[#444] bg-[#333] text-[#cccccc] hover:bg-[#444] hover:text-white"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            className="bg-[#c50f1f] text-white hover:bg-[#e74856]"
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
