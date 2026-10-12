/**
 * Registry of structural configurations that have been physically built and
 * checked. It is intentionally empty: no physical builds have been recorded.
 * Add an entry only after a real test build, with who/when/notes. Live
 * (unattended) fulfillment requires the configuration to appear here.
 */
export interface PhysicalValidationRecord {
  structuralKey: string;
  builtBy: string;
  builtOn: string; // ISO date
  notes: string;
}

export const PHYSICAL_VALIDATIONS: PhysicalValidationRecord[] = [];

export function physicallyValidatedKeys(extra: string[] = []): Set<string> {
  return new Set([...PHYSICAL_VALIDATIONS.map((r) => r.structuralKey), ...extra]);
}
