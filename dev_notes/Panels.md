
## Panel Behavior

Panels are persistent UI blocks that appear below the top-right action row and remain visible until explicitly dismissed by the same control that toggled them (or the panel’s close affordance). Unlike dropdowns, panels do **not** dismiss on outside clicks or unrelated UI interactions.

Panel rendering is controlled by the configuration in [`config.ts`](config.ts:1). The [`WALLET_DISPLAY`](config.ts:7) setting defines the allowed display options (`panel`, `drop_down`) and selects which mode is active via `active`. When `active` is `panel`, the UI renders the persistent panel variant; when `active` is `drop_down`, the UI renders the transient dropdown variant instead. This allows components to switch between the two display paradigms without changing their content.

### Example: Wallet content rendered as a panel

The current implementation applies panel behavior to the wallet display in [`UserMenu`](src/components/UserMenu.tsx:10). When the active mode is `panel`, clicking the wallet control toggles a persistent rectangular block that mirrors the dropdown content (address with copy affordance, ETH balance, USDC balance). The panel remains on-screen until toggled off or closed via its “×” control.
