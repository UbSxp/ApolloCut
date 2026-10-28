/* ============================================================
   APOLLOCUT — Simple Tests
   ============================================================ */

import { describe, it, expect } from 'vitest';
import { fmtTime, fmtBytes, clamp, pad2, baseName, fileExt } from '../src/utils/helpers.js';

describe('helpers', () => {
  describe('fmtTime', () => {
    it('formats seconds as MM:SS', () => {
      expect(fmtTime(0)).toBe('00:00');
      expect(fmtTime(59)).toBe('00:59');
      expect(fmtTime(60)).toBe('01:00');
      expect(fmtTime(90)).toBe('01:30');
    });
    
    it('formats hours as H:MM:SS', () => {
      expect(fmtTime(3600)).toBe('1:00:00');
      expect(fmtTime(3661)).toBe('1:01:01');
    });
  });
  
  describe('fmtBytes', () => {
    it('formats bytes correctly', () => {
      expect(fmtBytes(0)).toBe('—');
      expect(fmtBytes(500)).toBe('1 KB');
      expect(fmtBytes(1024)).toBe('1 KB');
      expect(fmtBytes(1024 * 1024)).toBe('1,0 MB');
    });
  });
  
  describe('clamp', () => {
    it('clamps values within range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
    });
  });
});