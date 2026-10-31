import { describe, it, expect } from 'vitest';
import { jsonDiff, type DiffEntry } from './jsonDiff.js';

describe('jsonDiff', () => {
  describe('identity', () => {
    it('returns empty array for identical primitives', () => {
      expect(jsonDiff(42, 42)).toEqual([]);
      expect(jsonDiff('hello', 'hello')).toEqual([]);
      expect(jsonDiff(true, true)).toEqual([]);
    });

    it('returns empty array for identical objects', () => {
      expect(jsonDiff({ a: 1, b: 2 }, { a: 1, b: 2 })).toEqual([]);
    });

    it('returns empty array for both null/undefined', () => {
      expect(jsonDiff(null, null)).toEqual([]);
      expect(jsonDiff(undefined, undefined)).toEqual([]);
      expect(jsonDiff(null, undefined)).toEqual([]);
    });
  });

  describe('primitive changes', () => {
    it('detects changed primitive at root', () => {
      const diff = jsonDiff(1, 2);
      expect(diff).toEqual([{ path: '$', op: 'changed', oldValue: 1, newValue: 2 }]);
    });

    it('detects string change', () => {
      const diff = jsonDiff('old', 'new');
      expect(diff).toEqual([{ path: '$', op: 'changed', oldValue: 'old', newValue: 'new' }]);
    });
  });

  describe('null transitions', () => {
    it('detects null to value as added', () => {
      const diff = jsonDiff(null, { a: 1 });
      expect(diff).toHaveLength(1);
      expect(diff[0].op).toBe('added');
    });

    it('detects value to null as removed', () => {
      const diff = jsonDiff({ a: 1 }, null);
      expect(diff).toHaveLength(1);
      expect(diff[0].op).toBe('removed');
    });
  });

  describe('type mismatches', () => {
    it('detects number to string as changed', () => {
      const diff = jsonDiff(42, 'hello');
      expect(diff).toEqual([{ path: '$', op: 'changed', oldValue: 42, newValue: 'hello' }]);
    });

    it('detects array vs object as changed', () => {
      const diff = jsonDiff([1, 2], { a: 1 });
      expect(diff).toHaveLength(1);
      expect(diff[0].op).toBe('changed');
    });
  });

  describe('flat objects', () => {
    it('detects added keys', () => {
      const diff = jsonDiff({ a: 1 }, { a: 1, b: 2 });
      expect(diff).toEqual([{ path: 'b', op: 'added', newValue: 2 }]);
    });

    it('detects removed keys', () => {
      const diff = jsonDiff({ a: 1, b: 2 }, { a: 1 });
      expect(diff).toEqual([{ path: 'b', op: 'removed', oldValue: 2 }]);
    });

    it('detects changed values', () => {
      const diff = jsonDiff({ a: 1 }, { a: 2 });
      expect(diff).toEqual([{ path: 'a', op: 'changed', oldValue: 1, newValue: 2 }]);
    });
  });

  describe('nested objects', () => {
    it('reports deep path for nested changes', () => {
      const diff = jsonDiff({ a: { b: { c: 1 } } }, { a: { b: { c: 2 } } });
      expect(diff).toEqual([{ path: 'a.b.c', op: 'changed', oldValue: 1, newValue: 2 }]);
    });
  });

  describe('arrays', () => {
    it('detects changed elements by position', () => {
      const diff = jsonDiff([1, 2, 3], [1, 99, 3]);
      expect(diff).toEqual([{ path: '[1]', op: 'changed', oldValue: 2, newValue: 99 }]);
    });

    it('detects added elements when b is longer', () => {
      const diff = jsonDiff([1], [1, 2]);
      expect(diff).toEqual([{ path: '[1]', op: 'added', newValue: 2 }]);
    });

    it('detects removed elements when a is longer', () => {
      const diff = jsonDiff([1, 2], [1]);
      expect(diff).toEqual([{ path: '[1]', op: 'removed', oldValue: 2 }]);
    });

    it('handles nested arrays with path', () => {
      const diff = jsonDiff({ items: [1, 2] }, { items: [1, 3] });
      expect(diff).toEqual([{ path: 'items[1]', op: 'changed', oldValue: 2, newValue: 3 }]);
    });
  });

  describe('large value summarization', () => {
    it('summarizes values over 200 chars', () => {
      const large = { data: 'x'.repeat(300) };
      const diff = jsonDiff(null, large);
      expect(diff).toHaveLength(1);
      expect(diff[0].op).toBe('added');
      expect(typeof diff[0].newValue).toBe('string');
      expect(diff[0].newValue).toMatch(/\[object \d+ chars\]/);
    });
  });

  describe('MAX_ENTRIES cap', () => {
    it('caps output at 500 entries', () => {
      const a: Record<string, number> = {};
      const b: Record<string, number> = {};
      for (let i = 0; i < 600; i++) {
        a[`k${i}`] = i;
        b[`k${i}`] = i + 1;
      }
      const diff = jsonDiff(a, b);
      expect(diff.length).toBeLessThanOrEqual(500);
    });
  });

  describe('op value contract', () => {
    it('only produces added, removed, or changed ops', () => {
      const cases: Array<[unknown, unknown]> = [
        [null, 1],
        [1, null],
        [1, 'string'],
        [{ a: 1 }, { b: 2 }],
        [[1], [1, 2]],
        [[1, 2], [1]],
        [[], {}],
      ];
      const validOps = new Set(['added', 'removed', 'changed']);
      for (const [a, b] of cases) {
        const diff = jsonDiff(a, b);
        for (const entry of diff) {
          expect(validOps.has(entry.op)).toBe(true);
        }
      }
    });
  });
});
