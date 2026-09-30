/**
 * Canonical filterable colors for product variants, plus the TAAJ Handloom
 * brand palette (used by storefront/admin theming and design tokens).
 */

export const PRODUCT_COLORS = [
  { name: 'Green', hex: '#2C6E49' },
  { name: 'Red', hex: '#B03A2E' },
  { name: 'Pink', hex: '#D98CA6' },
  { name: 'Blue', hex: '#2E5A88' },
  { name: 'Black', hex: '#1C1C1C' },
  { name: 'Yellow', hex: '#E4B93C' },
  { name: 'Purple', hex: '#6C4A78' },
  { name: 'Orange', hex: '#D9812E' },
  { name: 'Beige', hex: '#D9CBB2' },
  { name: 'White', hex: '#FBFBF8' },
  { name: 'Other', hex: '#9AA0A6' },
] as const;

export type ProductColorName = (typeof PRODUCT_COLORS)[number]['name'];
export const PRODUCT_COLOR_NAMES = PRODUCT_COLORS.map((c) => c.name) as ProductColorName[];

/** Brand tokens — deep forest-green primary, cream grounds, antique-gold accent. */
export const BRAND = {
  primary: '#2C6E49',
  primaryDeep: '#123B2A',
  ivory: '#F7F3EA',
  white: '#FFFFFF',
  gold: '#A67C24',
  charcoal: '#1D2A22',
} as const;
