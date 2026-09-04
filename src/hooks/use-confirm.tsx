// Replaces window.confirm() with the app's actual styled dialog.
// src/components/ui/alert-dialog.tsx existed, unused, before this -- every
// destructive action in the app (delete booking/customer/coupon/equipment/
// inventory item/PO/service, void invoice) used the native browser
// confirm() instead, and Refund used no confirmation at all (audit findings
// P4 / CC-confirm-dialog).
//
//   const { confirm, ConfirmDialog } = useConfirm();
//   ...
//   async function handleDelete() {
//     if (!(await confirm({ title: `Delete "${item.name}"?` }))) return;
//     deleteItem(item.id);
//   }
//   return <>{ConfirmDialog}...</>;
//
// One hook call per component is enough even when it has several distinct
// confirmations (e.g. delete vs. cancel) -- each call to `confirm()` just
// passes its own title/description; the single dialog is reused.
import { useCallback, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useStepUpAuth } from "./use-step-up";

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button. Defaults to true: every caller of this hook so far
   *  is replacing a confirm() that gated a delete/void/cancel/refund. */
  destructive?: boolean;
  /** Re-prompt for the caller's own PIN after they confirm, before resolving
   *  true -- for actions sensitive enough that the confirm dialog alone
   *  isn't enough (deleting a record). See src/hooks/use-step-up.tsx. */
  requirePin?: boolean;
}

export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);
  const { requireStepUp, StepUpDialog } = useStepUpAuth();

  const confirm = useCallback(
    (opts: ConfirmOptions): Promise<boolean> => {
      setOptions(opts);
      return new Promise<boolean>((resolve) => {
        resolveRef.current = async (confirmed: boolean) => {
          if (confirmed && opts.requirePin) {
            resolve(await requireStepUp());
          } else {
            resolve(confirmed);
          }
        };
      });
    },
    [requireStepUp],
  );

  // Idempotent: Radix's AlertDialogAction closes the dialog on click (firing
  // onOpenChange(false) after our own onClick already settled true), and a
  // second settle() after resolveRef is cleared is a no-op either way.
  const settle = useCallback((result: boolean) => {
    setOptions(null);
    resolveRef.current?.(result);
    resolveRef.current = null;
  }, []);

  const isDestructive = options?.destructive ?? true;

  const ConfirmDialog = (
    <AlertDialog
      open={options !== null}
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{options?.title}</AlertDialogTitle>
          {options?.description && (
            <AlertDialogDescription>{options.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>
            {options?.cancelLabel ?? "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => settle(true)}
            className={cn(
              isDestructive && "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            )}
          >
            {options?.confirmLabel ?? "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return {
    confirm,
    ConfirmDialog: (
      <>
        {ConfirmDialog}
        {StepUpDialog}
      </>
    ),
  };
}
