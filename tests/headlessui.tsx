import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

interface DialogProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
  onClose: (open: boolean) => void;
  children: ReactNode;
}

export function Dialog({ open, onClose: _onClose, children, ...props }: DialogProps) {
  if (!open) return null;
  return <div role="dialog" {...props}>{children}</div>;
}

export const DialogBackdrop = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function DialogBackdrop(props, ref) {
    return <div ref={ref} {...props} />;
  },
);

export const DialogPanel = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function DialogPanel(props, ref) {
    return <div ref={ref} {...props} />;
  },
);

export const DialogTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  function DialogTitle(props, ref) {
    return <h2 ref={ref} {...props} />;
  },
);
