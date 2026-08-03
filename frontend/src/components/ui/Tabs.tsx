import styles from './Tabs.module.css';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  /** Optional count shown as a pill, e.g. restored memories. */
  badge?: number;
}

export interface TabsProps<T extends string> {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}

/** Segmented control. Drives the single-column layout on small screens. */
export function Tabs<T extends string>({ items, value, onChange, label }: TabsProps<T>) {
  return (
    <div className={styles.tabs} role="tablist" aria-label={label}>
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            className={[styles.tab, selected ? styles.active : ''].filter(Boolean).join(' ')}
            onClick={() => onChange(item.id)}
          >
            {item.label}
            {item.badge !== undefined && item.badge > 0 && (
              <span className={styles.badge}>{item.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
