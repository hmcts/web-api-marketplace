import { formatDate } from '../../../main/services/Dates';

describe('formatDate', () => {
  test('a_date_should_read_as_day_month_and_year', () => {
    expect(formatDate('2026-10-29T10:00:00')).toBe('29 October 2026');
  });

  test('no_date_should_be_undefined', () => {
    expect(formatDate(null)).toBeUndefined();
    expect(formatDate(undefined)).toBeUndefined();
    expect(formatDate('')).toBeUndefined();
  });

  test('a_value_that_is_not_a_date_should_come_back_as_it_was', () => {
    expect(formatDate('not a date')).toBe('not a date');
  });
});
