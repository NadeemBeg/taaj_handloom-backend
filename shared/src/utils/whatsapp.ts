import { formatINR } from './price.js';

/**
 * WhatsApp deep-link builder. The business number is NEVER hardcoded — it is
 * always passed in from configuration (env-seeded WebsiteSetting.whatsappNumber).
 *
 * A wa.me link can only carry text, so the product image and product page are
 * included as links inside the message: the seller taps the image link to see
 * exactly which saree/product the customer selected.
 */

export interface WhatsappOrderLine {
  name: string;
  sku: string;
  color?: string;
  size?: string;
  quantity: number;
  unitPrice: number;
  /** Category name shown to the seller for quick identification. */
  category?: string;
  /** Absolute image URL of the exact product/variant the customer selected. */
  image?: string;
  /** Absolute product-page URL, when available. */
  productUrl?: string;
}

export interface WhatsappOrderPayload {
  orderNumber?: string;
  items: WhatsappOrderLine[];
  total?: number;
  coupon?: { code: string; discount: number };
  customerType?: 'individual' | 'wholesale';
  customer?: {
    name?: string;
    phone?: string;
    address?: string;
  };
  note?: string;
  /** When the order was placed. Defaults to now for item orders. */
  placedAt?: string | number | Date;
}

/** Normalize a phone number to the digits-only form wa.me expects (with country code, no +). */
export function normalizeWhatsappNumber(raw: string): string {
  return (raw || '').replace(/[^\d]/g, '');
}

/** Human-readable order timestamp in India Standard Time. */
function formatPlacedAt(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Kolkata',
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

const DIVIDER = '━━━━━━━━━━━━';

/** A short enquiry message (no order lines) — used by the floating chat CTA and contact pages. */
function buildEnquiryMessage(payload: WhatsappOrderPayload): string {
  const wholesale = payload.customerType === 'wholesale';
  const lines: string[] = ['🧵 *TAAJ Handloom*', '', 'Namaste 🙏', ''];
  lines.push(
    payload.note ||
      (wholesale
        ? 'I am interested in wholesale Maheshwari handloom. Please share pricing and minimum order details.'
        : 'I would like to know more about your Maheshwari handloom products.'),
  );
  lines.push('', 'Thank you!');
  return lines.join('\n');
}

/** Build the human-readable order message body (pre-encoding). */
export function buildWhatsappMessage(payload: WhatsappOrderPayload): string {
  if (!payload.items || payload.items.length === 0) {
    return buildEnquiryMessage(payload);
  }

  const wholesale = payload.customerType === 'wholesale';
  const lines: string[] = ['🧵 *TAAJ Handloom — New Order*', ''];

  if (payload.orderNumber) {
    lines.push(`*Order No:* ${payload.orderNumber}`, '');
  }

  lines.push(
    wholesale
      ? 'Namaste 🙏 I am interested in a wholesale order:'
      : 'Namaste 🙏 I would like to place the following order:',
    '',
  );

  let computedSubtotal = 0;
  let totalPieces = 0;

  payload.items.forEach((item, index) => {
    const lineTotal = item.unitPrice * item.quantity;
    computedSubtotal += lineTotal;
    totalPieces += item.quantity;

    const variant = [item.color, item.size].filter(Boolean).join(' / ');

    lines.push(`*${index + 1}. ${item.name}*`);
    if (item.category) lines.push(`   Category: ${item.category}`);
    if (variant) lines.push(`   Variant: ${variant}`);
    lines.push(`   SKU: ${item.sku}`);
    lines.push(
      `   Qty: ${item.quantity} × ${formatINR(item.unitPrice)} = ${formatINR(lineTotal)}`,
    );
    if (item.image) lines.push(`   📷 Image: ${item.image}`);
    if (item.productUrl) lines.push(`   🔗 Details: ${item.productUrl}`);
    lines.push('');
  });

  lines.push(DIVIDER, '🧾 *Order Summary*');

  const discount = payload.coupon && payload.coupon.discount > 0 ? payload.coupon.discount : 0;
  const total =
    typeof payload.total === 'number' ? payload.total : Math.max(0, computedSubtotal - discount);

  lines.push(`Items: ${payload.items.length}  •  ${totalPieces} pcs`);

  if (discount > 0) {
    lines.push(`Subtotal: ${formatINR(computedSubtotal)}`);
    lines.push(`Coupon ${payload.coupon!.code}: − ${formatINR(discount)}`);
  }
  lines.push(`*Total: ${formatINR(total)}*`);
  lines.push(`Customer Type: ${wholesale ? 'Wholesale' : 'Individual'}`);

  if (payload.customer) {
    const { name, phone, address } = payload.customer;
    if (name || phone || address) {
      lines.push('', '👤 *Customer Details*');
      if (name) lines.push(`Name: ${name}`);
      if (phone) lines.push(`Phone: ${phone}`);
      if (address) lines.push(`Address: ${address}`);
    }
  }

  if (payload.note) lines.push('', `📝 Note: ${payload.note}`);

  const placed = formatPlacedAt(payload.placedAt ?? Date.now());
  if (placed) lines.push('', `🗓 Placed: ${placed}`);

  lines.push(
    '',
    wholesale
      ? 'Please share wholesale pricing and availability. Thank you! 🙏'
      : 'Please confirm availability and delivery. Thank you! 🙏',
  );

  return lines.join('\n');
}

/** Full wa.me link with URL-encoded message. */
export function buildWhatsappUrl(number: string, payload: WhatsappOrderPayload): string {
  const digits = normalizeWhatsappNumber(number);
  const text = encodeURIComponent(buildWhatsappMessage(payload));
  return `https://wa.me/${digits}?text=${text}`;
}
