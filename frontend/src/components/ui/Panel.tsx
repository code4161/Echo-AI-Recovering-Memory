import type { ReactNode } from 'react';
import styles from './Panel.module.css';

export interface PanelProps {
  title?: string;
  /** Small muted text on the right of the header, e.g. a count. */
  aside?: ReactNode;
  /** Removes body padding for panels that own their own scroll area. */
  flush?: boolean;
  className?: string;
  children: ReactNode;
  'aria-label'?: string;
}

/** Frosted surface used for every major region of the game. */
export function Panel({ title, aside, flush = false, className, children, ...rest }: PanelProps) {
  return (
    <section className={[styles.panel, className].filter(Boolean).join(' ')} {...rest}>
      {title && (
        <header className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          {aside && <span className={styles.aside}>{aside}</span>}
        </header>
      )}
      <div className={[styles.body, flush ? styles.bodyFlush : ''].filter(Boolean).join(' ')}>
        {children}
      </div>
    </section>
  );
}
