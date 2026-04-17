export interface EventConfig {
  name: string;
  dates: string;
  location: string;
}

export const EVENT_CONFIGS: Record<string, EventConfig> = {
  "blockchainrio-2026": {
    name: "BlockchainRio 2026",
    dates: "Aug 5-7, 2026",
    location: "Rio de Janeiro, Brazil",
  },
};
