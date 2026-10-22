import { describe, expect, it } from 'vitest';
import { seal, unseal, type Bundle } from '../../src/main/transfer';

const bundle: Bundle = { workspace: 'Larkspur', exportedAt: '2026-10-22T00:00:00Z', groups: ['EU'], proxies: [{ ref: 'x', password: 'p@ss' }], profiles: [{ ref: 'a', saved: true }], states: { a: 'H4sI' } };

describe('workspace files', () => {
  it('open only with the passphrase they were sealed with, and keep nothing readable', async () => {
    const file = await seal(bundle, 'correct horse battery');
    expect(file.includes(Buffer.from('p@ss'))).toBe(false);
    expect(await unseal(file, 'correct horse battery')).toEqual(bundle);
    await expect(unseal(file, 'wrong horse battery')).rejects.toThrow('wrong_passphrase');
    await expect(unseal(Buffer.from('{"not":"a folio file"}'), 'x')).rejects.toThrow('not_folio');
  });
});
