import { lookupOwnBrandStore } from './ownBrands';

describe('lookupOwnBrandStore', () => {
  test('null input returns null', () => {
    expect(lookupOwnBrandStore(null)).toBeNull();
  });

  test('empty string returns null', () => {
    expect(lookupOwnBrandStore('')).toBeNull();
  });

  test('unknown brand returns null', () => {
    expect(lookupOwnBrandStore('Danone')).toBeNull();
  });

  test('Hacendado → Mercadona (exact case)', () => {
    expect(lookupOwnBrandStore('Hacendado')).toBe('Mercadona');
  });

  test('hacendado → Mercadona (lowercase)', () => {
    expect(lookupOwnBrandStore('hacendado')).toBe('Mercadona');
  });

  test('HACENDADO → Mercadona (uppercase)', () => {
    expect(lookupOwnBrandStore('HACENDADO')).toBe('Mercadona');
  });

  test('Bosque Verde → Mercadona', () => {
    expect(lookupOwnBrandStore('Bosque Verde')).toBe('Mercadona');
  });

  test('Deliplus → Mercadona', () => {
    expect(lookupOwnBrandStore('Deliplus')).toBe('Mercadona');
  });

  test('Compy → Mercadona', () => {
    expect(lookupOwnBrandStore('Compy')).toBe('Mercadona');
  });

  test('Milbona → Lidl', () => {
    expect(lookupOwnBrandStore('Milbona')).toBe('Lidl');
  });

  test('Realvalle → Lidl', () => {
    expect(lookupOwnBrandStore('Realvalle')).toBe('Lidl');
  });

  test('GutBio → Aldi', () => {
    expect(lookupOwnBrandStore('GutBio')).toBe('Aldi');
  });

  test('Milsani → Aldi', () => {
    expect(lookupOwnBrandStore('Milsani')).toBe('Aldi');
  });

  test('Auchan → Alcampo', () => {
    expect(lookupOwnBrandStore('Auchan')).toBe('Alcampo');
  });

  test('Eroski → Eroski', () => {
    expect(lookupOwnBrandStore('Eroski')).toBe('Eroski');
  });

  test('Aliada → El Corte Inglés', () => {
    expect(lookupOwnBrandStore('Aliada')).toBe('El Corte Inglés');
  });

  test('IFA Eliges → Gadis', () => {
    expect(lookupOwnBrandStore('IFA Eliges')).toBe('Gadis');
  });

  test('Consum → Consum', () => {
    expect(lookupOwnBrandStore('Consum')).toBe('Consum');
  });

  test('DIA → DIA', () => {
    expect(lookupOwnBrandStore('DIA')).toBe('DIA');
  });

  test('Alipende → Ahorramas', () => {
    expect(lookupOwnBrandStore('Alipende')).toBe('Ahorramas');
  });

  test('leading/trailing whitespace is ignored', () => {
    expect(lookupOwnBrandStore('  Hacendado  ')).toBe('Mercadona');
  });
});
