export interface UIThemeDef {
  id: string;
  name: string;
  description: string;
  /** Primary swatch colour shown in the picker (hex) */
  swatchBg: string;
  /** Accent swatch colour shown in the picker (hex) */
  swatchAccent: string;
}

export const UI_THEMES: UIThemeDef[] = [
  {
    id: 'shopfloor',
    name: 'Shop Floor',
    description: 'Dark cockpit — for site operators and supervisors',
    swatchBg: '#0F172A',
    swatchAccent: '#D97706',
  },
  {
    id: 'office',
    name: 'Office',
    description: 'Light document clarity — for compliance officers and auditors',
    swatchBg: '#F0F4F8',
    swatchAccent: '#D97706',
  },
];

export const DEFAULT_UI_THEME_ID = 'shopfloor';
