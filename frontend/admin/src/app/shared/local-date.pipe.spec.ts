import { formatLocalDate } from './local-date.pipe';

describe('formatLocalDate', () => {
  const evening = new Date(2026, 9, 31, 23, 38);
  const morning = new Date(2026, 9, 31, 9, 5);

  it('uses 12-hour time with AM/PM in English', () => {
    expect(formatLocalDate(evening, 'time', 'en')).toBe('11:38 PM');
    expect(formatLocalDate(morning, 'time', 'en')).toBe('9:05 AM');
    expect(formatLocalDate(evening, 'hour', 'en')).toBe('11 PM');
  });

  it('uses 12-hour time with ص/م and Latin digits in Arabic', () => {
    expect(formatLocalDate(evening, 'time', 'ar')).toBe('11:38 م');
    expect(formatLocalDate(morning, 'time', 'ar')).toBe('9:05 ص');
  });
});
