// ─── Shared workplace intake options ─────────────────────────────────────────
// Extracted from WorkplaceIntakePanel for reuse in Onboarding wizard.

export const HAZARD_OPTIONS = [
  { id: 'chemicals', label: 'Hazardous substances / chemicals' },
  { id: 'lifting', label: 'Lifting operations / lifting equipment' },
  { id: 'work-equipment', label: 'Work equipment / machinery' },
  { id: 'manual-handling', label: 'Manual handling / heavy loads' },
  { id: 'explosive-atmo', label: 'Explosive or flammable atmospheres' },
  { id: 'construction', label: 'Construction / demolition activities' },
  { id: 'hot-work', label: 'Hot work / welding / cutting' },
  { id: 'working-at-height', label: 'Working at height' },
  { id: 'confined-space', label: 'Confined space entry' },
  { id: 'lone-working', label: 'Lone working' },
  { id: 'young-persons', label: 'Young persons / new starters' },
  { id: 'new-expectant', label: 'New or expectant mothers' },
] as const;

export const WORKFORCE_SIZE_OPTIONS = [
  { value: '1-4', label: 'Micro (1–4 employees)' },
  { value: '5-49', label: 'Small (5–49 employees)' },
  { value: '50-249', label: 'Medium (50–249 employees)' },
  { value: '250+', label: 'Large (250+ employees)' },
] as const;

export const INDUSTRY_OPTIONS = [
  { value: 'oil-gas-offshore', label: 'Oil & Gas / Offshore' },
  { value: 'chemical-process', label: 'Chemical / Process Industry' },
  { value: 'construction', label: 'Construction' },
  { value: 'manufacturing-general', label: 'Manufacturing' },
  { value: 'welding-metal', label: 'Welding / Metal Fabrication' },
  { value: 'warehouse-logistics', label: 'Warehouse / Logistics' },
  { value: 'construction-cdm', label: 'Construction (CDM Notifiable)' },
  { value: 'utilities', label: 'Utilities / Energy' },
  { value: 'mining-quarrying', label: 'Mining / Quarrying' },
  { value: 'healthcare', label: 'Healthcare / Social Care' },
  { value: 'food-production', label: 'Food Production' },
  { value: 'general-office', label: 'Office / Professional Services' },
] as const;
