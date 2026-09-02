import { looksLikeAnEmailAddress, newReference, toAnswerList, toAnswerText } from '../../../main/services/answers';

describe('answers', () => {
  test('a_text_answer_should_be_trimmed', () => {
    expect(toAnswerText({ name: '  Joe  ' }, 'name')).toBe('Joe');
  });

  test('a_missing_text_answer_should_be_empty', () => {
    expect(toAnswerText({}, 'name')).toBe('');
    expect(toAnswerText(undefined, 'name')).toBe('');
  });

  test('an_object_sent_in_place_of_a_text_answer_should_be_read_as_empty', () => {
    // String()-ing one would produce the literal "[object Object]" and pass validation.
    expect(toAnswerText({ name: { $ne: null } }, 'name')).toBe('');
  });

  test('a_single_ticked_checkbox_should_be_read_as_a_list', () => {
    expect(toAnswerList('one')).toEqual(['one']);
  });

  test('several_ticked_checkboxes_should_be_read_as_a_list', () => {
    expect(toAnswerList(['one', 'two'])).toEqual(['one', 'two']);
  });

  test('a_non_string_checkbox_entry_should_be_discarded_rather_than_stringified', () => {
    expect(toAnswerList([{ toString: () => 'one' }, 'two'])).toEqual(['two']);
  });

  test('no_ticked_checkboxes_should_be_an_empty_list', () => {
    expect(toAnswerList(undefined)).toEqual([]);
    expect(toAnswerList('')).toEqual([]);
  });

  test.each([
    ['no at sign', 'joe.example.gov.uk'],
    ['two at signs', 'joe@@justice.gov.uk'],
    ['nothing before the at sign', '@justice.gov.uk'],
    ['no dot in the domain', 'joe@justice'],
    ['a domain starting with a dot', 'joe@.gov.uk'],
    ['a domain ending with a dot', 'joe@justice.'],
  ])('an_address_with_%s_should_be_rejected', (_description: string, email: string) => {
    expect(looksLikeAnEmailAddress(email)).toBe(false);
  });

  test.each([['joe.bloggs@justice.gov.uk'], ['j@a.b'], ["o'brien+tag@sub.domain.gov.uk"]])(
    'a_valid_address_%s_should_be_accepted',
    (email: string) => {
      expect(looksLikeAnEmailAddress(email)).toBe(true);
    }
  );

  test('a_reference_should_be_unguessable_hex_rather_than_a_predictable_sequence', () => {
    expect(newReference()).toMatch(/^AMP-[0-9A-F]{8}$/);
  });

  test('two_references_should_differ', () => {
    expect(newReference()).not.toBe(newReference());
  });
});
