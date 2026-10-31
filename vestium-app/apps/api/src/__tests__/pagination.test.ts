import { describe, it, expect } from 'vitest';
import { PaginationSchema } from '../utils/pagination.js';

describe('PaginationSchema', () => {
  it('applies default values when no params given', () => {
    const result = PaginationSchema.parse({});
    expect(result).toEqual({ limit: 100, offset: 0 });
  });

  it('coerces string query params to numbers', () => {
    const result = PaginationSchema.parse({ limit: '50', offset: '10' });
    expect(result).toEqual({ limit: 50, offset: 10 });
  });

  it('clamps limit to max 500', () => {
    expect(() => PaginationSchema.parse({ limit: 501 })).toThrow();
  });

  it('rejects limit below 1', () => {
    expect(() => PaginationSchema.parse({ limit: 0 })).toThrow();
  });

  it('rejects negative offset', () => {
    expect(() => PaginationSchema.parse({ offset: -1 })).toThrow();
  });

  it('accepts boundary values', () => {
    expect(PaginationSchema.parse({ limit: 1, offset: 0 })).toEqual({ limit: 1, offset: 0 });
    expect(PaginationSchema.parse({ limit: 500, offset: 9999 })).toEqual({ limit: 500, offset: 9999 });
  });
});
