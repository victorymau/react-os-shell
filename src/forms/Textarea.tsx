/**
 * Textarea — a styled multi-line `<textarea>`, same INPUT_BASE look as Input.
 * Forwards its ref and spreads native props (react-hook-form friendly). With
 * `autoGrow`, the field resizes to fit its content as the user types.
 */
import { forwardRef, useCallback, type FormEvent, type TextareaHTMLAttributes } from 'react';
import { inputClasses } from './styles';

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> {
  /** Error state — red border + ring. */
  invalid?: boolean;
  /** Grow the field to fit its content instead of scrolling. */
  autoGrow?: boolean;
  className?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, autoGrow, className = '', onInput, rows = 3, ...rest },
  ref,
) {
  const handleInput = useCallback((e: FormEvent<HTMLTextAreaElement>) => {
    if (autoGrow) {
      const el = e.currentTarget;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
    onInput?.(e);
  }, [autoGrow, onInput]);

  return (
    <textarea
      ref={ref}
      rows={rows}
      onInput={handleInput}
      className={inputClasses({ invalid, className: `${autoGrow ? 'resize-none overflow-hidden' : ''} ${className}`.trim() })}
      {...rest}
    />
  );
});

export default Textarea;
