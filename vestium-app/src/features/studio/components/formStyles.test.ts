import { describe, it, expect } from 'vitest';
import { slugify, validateModuleId, inputClass } from './formStyles';

describe('slugify', () => {
  it('lowercases and joins first two words', () => {
    expect(slugify('Welding Safety Course')).toBe('weldingsafety');
  });

  it('strips non-alphanumeric characters', () => {
    expect(slugify("Bob's Kitchen!")).toBe('bobskitchen');
  });

  it('handles single word', () => {
    expect(slugify('Manufacturing')).toBe('manufacturing');
  });

  it('trims leading/trailing whitespace', () => {
    expect(slugify('  hello world  ')).toBe('helloworld');
  });

  it('returns empty string for empty input', () => {
    expect(slugify('')).toBe('');
  });
});

describe('validateModuleId', () => {
  it('returns null for valid IDs', () => {
    expect(validateModuleId('weldingsafety')).toBeNull();
    expect(validateModuleId('abc123')).toBeNull();
  });

  it('rejects IDs shorter than 3 characters', () => {
    expect(validateModuleId('ab')).toBe('ID must be at least 3 characters.');
  });

  it('rejects IDs starting with a digit', () => {
    expect(validateModuleId('123abc')).toBe('ID must start with a letter and contain only lowercase letters/digits.');
  });

  it('rejects IDs with uppercase letters', () => {
    expect(validateModuleId('Abc')).toBe('ID must start with a letter and contain only lowercase letters/digits.');
  });

  it('rejects reserved IDs', () => {
    expect(validateModuleId('controller', ['controller', 'sales'])).toBe('This ID is reserved.');
  });

  it('returns null for empty string (no validation needed)', () => {
    expect(validateModuleId('')).toBeNull();
  });
});

describe('inputClass', () => {
  it('includes violet focus color by default', () => {
    expect(inputClass()).toContain('focus:border-violet-500');
  });

  it('includes amber focus color when specified', () => {
    expect(inputClass('amber')).toContain('focus:border-amber-500');
  });
});
