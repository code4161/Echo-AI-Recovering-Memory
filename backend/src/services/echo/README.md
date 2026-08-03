# services/echo

The AI boundary. Nothing else in the backend knows how Echo's dialogue is
produced — callers depend only on the `EchoProvider` interface.

| File               | Purpose                                                          |
| ------------------ | ---------------------------------------------------------------- |
| `echo.provider.ts` | The interface and its context/reply types. The contract.          |
| `rules.provider.ts`| Default implementation: keyword matching, no network.             |
| `dialogue.ts`      | Echo's personality as data — rules, lines, moods, trust values.   |
| `index.ts`         | Resolves the provider named by `AI_PROVIDER`, once.               |

```ts
interface EchoProvider {
  name: string;
  greet(context: EchoGreetContext): Promise<EchoReply>;
  respond(context: EchoPromptContext): Promise<EchoReply>;
}
```

## Adding a real provider

1. Create `openai.provider.ts` exporting a factory that returns an `EchoProvider`.
2. Register it in the switch in `index.ts`.
3. Set `AI_PROVIDER=openai` and `AI_API_KEY` in `backend/.env`.

Build the prompt from `EchoPromptContext`, which already carries the recent
transcript, Echo's trust and mood, and the player's name. Keep prompt
construction inside this folder — the rest of the codebase should never see a
prompt string.

The provider returns a *requested* `trustDelta`. It is advisory: the game state
service clamps it before anything is persisted, so a misbehaving model cannot
hand out 500% trust.

> `EchoPromptContext.history` is the transcript **before** the current message.
> Passing a history that already contains it makes Echo think the player
> repeated themselves.
