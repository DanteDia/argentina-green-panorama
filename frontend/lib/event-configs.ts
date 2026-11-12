export interface EventConfig {
  name: string;
  dates: string;
  location: string;
  industries?: string[];   // the `industries` tag of this event's nodes; with it the event is offered in the landing's live map
}

export const EVENT_CONFIGS: Record<string, EventConfig> = {
  "blockchainrio-2026": {
    name: "BlockchainRio 2026",
    dates: "Aug 5-7, 2026",
    location: "Rio de Janeiro, Brazil",
    industries: ["blockchain"],
  },
};
