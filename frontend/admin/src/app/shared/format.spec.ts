import { PhonePipe, SAUDI_MOBILE_PATTERN, toHalalas, toSar } from './format';

describe('money helpers', () => {
  it('converts riyals to integer halalas without float drift', () => {
    expect(toHalalas(249.99)).toBe(24999);
    expect(toHalalas(0.1 + 0.2)).toBe(30);
    expect(toSar(24999)).toBe(249.99);
  });
});

describe('PhonePipe', () => {
  it('formats E.164 Saudi mobiles the local way', () => {
    expect(new PhonePipe().transform('+966551234567', false)).toBe('055 123 4567');
    expect(new PhonePipe().transform('+966551234567')).toBe('\u2066055 123 4567\u2069');
  });
  it('leaves other values untouched', () => {
    expect(new PhonePipe().transform('+971501234567', false)).toBe('+971501234567');
    expect(new PhonePipe().transform(null)).toBe('');
  });
});

describe('SAUDI_MOBILE_PATTERN', () => {
  it.each(['0551234567', '551234567', '966551234567', '+966551234567', '00966551234567'])('accepts %s', (v) => {
    expect(SAUDI_MOBILE_PATTERN.test(v)).toBe(true);
  });
  it.each(['0112345678', '05512345', '+971551234567'])('rejects %s', (v) => {
    expect(SAUDI_MOBILE_PATTERN.test(v)).toBe(false);
  });
});
