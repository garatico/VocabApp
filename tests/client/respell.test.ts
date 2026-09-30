import { describe, it, expect } from 'vitest';
import { respellSpanishIpa } from '../../src/client/utils/respell.ts';

describe('respellSpanishIpa', () => {
  it.each([
    ['/oβ.ˈβja.men.te/', 'ohb-BYAH-mehn-teh'],
    ['/de/', 'deh'],
    ['/ˈe.so/', 'EH-soh'],
    ['/saˈβeɾ/', 'sah-BEHR'],
    ['/ˈɡɾa.θjas/', 'GRAH-thyahs'],
    ['/deˈθiɾ/', 'deh-THEER'],
    ['/ja/', 'yah'],
    ['/ˈaj.ɾe/', 'EYE-reh'],
    ['/ˈtʃi.ko/', 'CHEE-koh'],
    ['/ˈxwe.ɣo/', 'HWEH-goh'],
    ['/noˈso.tɾos/', 'noh-SOH-trohs'],
  ])('%s → %s', (ipa, expected) => expect(respellSpanishIpa(ipa)).toBe(expected));

  it('returns nothing for empty input', () => {
    expect(respellSpanishIpa(null)).toBe('');
    expect(respellSpanishIpa('')).toBe('');
  });
});
