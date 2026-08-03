import type { ComponentPropsWithRef, ReactNode } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'soft' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'icon';

// ComponentPropsWithRef so callers can pass `ref` directly (React 19).
export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const classes = [styles.button, styles[variant], styles[size], block ? styles.block : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
