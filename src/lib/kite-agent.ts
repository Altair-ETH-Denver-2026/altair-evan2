import { KiteAgent } from '@gokite/sdk';

// This agent will handle the 'Intent' parsing and eventually the execution
export const altairAgent = new KiteAgent({
  name: "Altair Concierge",
  description: "A DeFi assistant that helps users swap tokens on Base.",
  // In the MVP, this agent is a 'Concierge' and will always ask for confirmation
  capabilities: ['swap', 'balance_check'],
});