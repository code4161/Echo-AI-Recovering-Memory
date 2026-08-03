import { GameProvider } from '@/features/game/GameProvider';
import { useGame } from '@/features/game/useGame';
import { GamePage } from '@/pages/GamePage';
import { HomePage } from '@/pages/HomePage';

/**
 * Which screen shows is a function of game state, not a URL: a player either
 * has a name and a conversation, or they do not.
 */
function Screen() {
  const { started } = useGame();
  return started ? <GamePage /> : <HomePage />;
}

export function App() {
  return (
    <GameProvider>
      <Screen />
    </GameProvider>
  );
}
