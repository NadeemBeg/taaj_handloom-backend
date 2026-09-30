import { buildWhatsappUrl, buildWhatsappMessage, normalizeWhatsappNumber } from '@taaj/shared';

describe('WhatsApp builder', () => {
  const payload = {
    orderNumber: 'TH-202608-0042',
    items: [
      {
        name: 'Maheshwari Saree',
        sku: 'TH-SAR-001',
        color: 'Green',
        category: 'Sarees',
        image: 'https://cdn.example.com/saree.jpg',
        productUrl: 'https://taaj.example.com/sarees/maheshwari-saree',
        quantity: 2,
        unitPrice: 2499,
      },
    ],
    total: 4998,
    customer: { name: 'Asha', phone: '9876543210' },
    placedAt: '2026-08-15T10:30:00.000Z',
  };

  it('normalizes a number to digits only', () => {
    expect(normalizeWhatsappNumber('+91 99999-99999')).toBe('919999999999');
  });

  it('includes order number, item, variant, image, link and total in the message', () => {
    const msg = buildWhatsappMessage(payload);
    expect(msg).toContain('TH-202608-0042');
    expect(msg).toContain('Maheshwari Saree');
    expect(msg).toContain('SKU: TH-SAR-001');
    expect(msg).toContain('Category: Sarees');
    expect(msg).toContain('Green');
    expect(msg).toContain('Qty: 2');
    expect(msg).toContain('📷 Image: https://cdn.example.com/saree.jpg');
    expect(msg).toContain('🔗 Details: https://taaj.example.com/sarees/maheshwari-saree');
    expect(msg).toContain('Name: Asha');
    expect(msg).toContain('🗓 Placed:');
  });

  it('renders a friendly enquiry message when there are no items', () => {
    const msg = buildWhatsappMessage({ items: [], note: 'Do you deliver to Pune?' });
    expect(msg).toContain('TAAJ Handloom');
    expect(msg).toContain('Do you deliver to Pune?');
  });

  it('builds a wa.me url with the configured number and encoded text', () => {
    const url = buildWhatsappUrl('+91 99999 99999', payload);
    expect(url.startsWith('https://wa.me/919999999999?text=')).toBe(true);
    expect(url).toContain(encodeURIComponent('Maheshwari Saree'));
  });
});
