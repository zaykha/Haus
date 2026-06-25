# TODO: Start New Chat popup role-based options

- [ ] Inspect existing chat start modal implementation in `components/chat/chat-screen.tsx`.
- [ ] Implement role-based participant selection rules:
  - [ ] Manager (communication_manager/creative_manager): allow choosing between internal individuals and organization groups.
  - [ ] Designer: allow only internal individuals.
  - [ ] Client: allow only clients within their own org(s); additionally allow managers as individuals within the client’s own org only.
- [ ] Wire UI options in the Start new chat modal to render the correct lists (internal users + client org groups / client org members) based on the logged-in user.
- [ ] Ensure chat creation produces/uses `chat_conversations` and participants consistently with existing schema assumptions.
- [ ] Run `pnpm run check` and ensure no TypeScript/ESLint errors (warnings acceptable if pre-existing).

