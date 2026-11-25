import { describe, expect, it } from 'vitest';

import { isRole } from './role.js';

describe('isRole', () => {
  it('deve aceitar somente os papéis admin, editor e sales', () => {
    expect(isRole('admin')).toBe(true);
    expect(isRole('editor')).toBe(true);
    expect(isRole('sales')).toBe(true);
  });

  it('deve recusar quando o texto não é um desses papéis', () => {
    expect(isRole('Admin')).toBe(false);
    expect(isRole('EDITOR')).toBe(false);
    expect(isRole('sales ')).toBe(false);
    expect(isRole('')).toBe(false);
    expect(isRole('guest')).toBe(false);
  });
});
