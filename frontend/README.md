# Frontend

React 19 + TypeScript + Vite.

Echo lives on the server, reached over Socket.io. The same game also **runs
standalone**: if the backend cannot be reached when a new game starts, a rules
engine in the browser takes over and the UI says so. Both sit behind one
interface, so no component knows which is running.

## Layout

```
src/
├── main.tsx              Mounts <App> into #root
├── App.tsx               Provider + which screen to show
├── pages/                Full screens: HomePage, GamePage
├── features/             Stateful slices of the game
│   ├── game/             All state: reducer, provider, useGame
│   ├── echo/             EchoStage — Echo's presence and status
│   ├── chat/             ChatPanel — the conversation
│   └── memories/         MemoryJournal, MemoryToast
├── components/           Reusable and presentational: props in, markup out
│   ├── echo/             EchoAvatar, EmotionBadge, TrustMeter
│   ├── chat/             SpeechBubble, ChatMessage, MessageList,
│   │                     TypingIndicator, ChatComposer, QuickReplies
│   ├── memories/         MemoryCard
│   └── ui/               Button, Panel, ProgressBar, Tabs
├── services/
│   ├── game/             The connection: socket, offline, one interface
│   └── echo/             The in-browser dialogue engine (offline play)
├── hooks/                useAutoScroll, useMediaQuery
├── lib/                  api, friendship, storage, time, id
├── data/                 memories.ts — chapter 1 content, offline only
├── types/                Domain types, mirroring the server
├── config.ts             API/socket URLs and the offline switch
└── styles/               tokens.css, global.css
```

## The three rules

1. **`components/` never holds state or fetches anything.** Every component
   there takes props and renders. That is what makes them reusable: `EchoAvatar`
   is the 210px character on the home screen *and* the 44px portrait beside each
   chat bubble, with no changes.
2. **`features/` owns state.** All of it lives in one reducer under
   `features/game/`, reached through `useGame()`.
3. **`services/` owns the connection.** Nothing else knows where a reply comes
   from.

## How it talks to the backend

`lib/api.ts` makes one REST call to open a session. Everything after that is
Socket.io, and `services/game/types.ts` defines the seam:

```ts
interface GameConnection {
  readonly mode: 'server' | 'offline';
  send(content: string): void;
  close(): void;
}
```

A connection emits events — `snapshot`, `message`, `typing`, `echoState`,
`memoryRestored` — and `GameProvider` turns each one into a dispatch. There are
two implementations producing the identical stream:

- **`socketConnection.ts`** — the real one. Bootstraps a session over REST, then
  connects with `io(url, { auth: { sessionId } })`.
- **`offlineConnection.ts`** — the same game refereed in the browser, using the
  rules engine in `services/echo/` and saving to `localStorage`.

`services/game/index.ts` picks between them. It prefers the server, and falls
back only when the server is genuinely unreachable *and* the player is starting
fresh — resuming a server game offline would show them a different conversation
than the one they left.

## Game state

The reducer in `features/game/gameState.ts` **applies events; it does not decide
anything.** Trust changes and memory unlocks arrive already computed by whichever
referee is running. There is no local rule to tamper with, which is what makes
progress impossible to fake from the console.

The client also renders nothing optimistically — even the player's own message
is drawn only when the referee sends it back — so the transcript is always in
the order the server recorded it.

Only two things are persisted in the browser: the session ids needed to resume
(`echo:identity:v1`), and, for offline play, the whole save (`echo:offline:v1`).
In server mode the conversation itself lives in Postgres.

> `EchoTurn.history` is the transcript **before** the current message. Passing a
> history that already contains it makes Echo think the player repeated
> themselves.

## Emotions

Six moods drive the whole visual language: `neutral`, `happy`, `curious`,
`sad`, `afraid`, `nostalgic`.

Any element with `data-emotion` re-points a `--mood` custom property, and every
descendant picks up the colour. That is why a nostalgic reply tints its speech
bubble, the avatar, the emotion badge and the memory card without a single
JavaScript branch. Echo's face is drawn per mood — the eyes, mouth, blush,
tears and sparkles all change shape.

## Responsive design

One breakpoint at 1024px:

- **Wide** — three columns: Echo, conversation, memory journal.
- **Narrow** — Echo collapses to a horizontal strip on top, and a segmented
  control swaps between Talk and Memories so the conversation keeps full height.

The app shell uses `dvh`, so the composer stays visible when mobile browser
chrome slides away. Every animation is disabled under
`prefers-reduced-motion`.

## Setup

```bash
npm install
npm run dev --workspace frontend
```

Then open http://localhost:5173. With no backend running, the game falls back to
offline play and the badge beside Echo reads **Offline** instead of **Live**.

For the full stack, run `npm run dev` from the repository root. Vite proxies
`/api` and `/socket.io` to `localhost:4000`, so the browser stays same-origin
and never meets CORS. Copy `.env.example` to `.env.local` to point at a deployed
backend, or to force offline play with `VITE_OFFLINE=true`.

## Testing

`npm run e2e` from the root boots a throwaway database and the real server, then
drives this client's `openSocketConnection` and reducer against it. The harness
is in `scripts/client-check.ts`.
