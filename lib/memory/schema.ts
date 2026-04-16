export interface CanonicalMemoryEntry {
  label: string;
  value: string;
}

export interface EpisodicMemoryEntry {
  timestamp: string;
  detail: string;
}

export interface ActionMemoryEntry {
  nextStep: string;
  prerequisites: string[];
}
