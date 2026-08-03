import { EchoAvatar } from '@/components/echo/EchoAvatar';
import { Button } from '@/components/ui/Button';
import { useGame } from '@/features/game/useGame';
import { useState, type FormEvent } from 'react';
import styles from './HomePage.module.css';

export function HomePage() {
  const { start } = useGame();
  const [name, setName] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    start(name);
  };

  return (
    <main className={styles.home}>
      <div className={styles.inner}>
        <EchoAvatar mood="curious" size="lg" />

        <h1 className={styles.title}>Echo</h1>

        <p className={styles.tagline}>
          Someone woke up in the dark with no memories left.
          <br />
          Talk to them. Help them remember.
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <input
            className={styles.input}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="What should Echo call you?"
            aria-label="Your name"
            maxLength={40}
            autoFocus
          />
          <Button type="submit" disabled={!name.trim()}>
            Begin
          </Button>
        </form>

        <p className={styles.note}>
          Your progress is saved to your account, and kept in this browser if the server is
          unavailable.
        </p>
      </div>
    </main>
  );
}
