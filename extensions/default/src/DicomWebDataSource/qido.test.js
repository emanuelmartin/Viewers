import { mapParams, replaceUnsafeChars, matchesPatientId } from './qido.js';

describe('qido unsafe PatientID characters', () => {
  it('replaces characters that would be percent-encoded with "*"', () => {
    expect(replaceUnsafeChars('380/26')).toBe('380*26');
    expect(replaceUnsafeChars('A B/C')).toBe('A*B*C');
    expect(replaceUnsafeChars('38041220260309')).toBe('38041220260309');
    expect(replaceUnsafeChars(undefined)).toBeUndefined();
  });

  it('only rewrites the PatientID when the option is on', () => {
    const params = { patientId: '380/26', disableWildcard: true };
    expect(mapParams(params, {})['00100020']).toBe('380/26');
    expect(mapParams(params, { unsafeCharsAsWildcard: true })['00100020']).toBe('380*26');
  });

  it('narrows wildcard results back to the requested PatientID', () => {
    expect(matchesPatientId('380/26', '380/26', false)).toBe(true);
    expect(matchesPatientId('380126', '380/26', false)).toBe(false);
    expect(matchesPatientId('X380/26', '380/26', true)).toBe(true);
    expect(matchesPatientId('380126', undefined, false)).toBe(true);
  });
});
