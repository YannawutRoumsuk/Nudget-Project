import { describe, expect, it } from 'vitest';
import { extractLearningKeyword, learnedKeywordMatches, normalizeLearnedText } from '../src/lib/learned-categories';

describe('per-account merchant category keywords', () => {
	it('extracts one specific merchant word and discards amounts and generic terms', () => {
		expect(extractLearningKeyword('ค่าอาหาร Grab 60 บาท')).toBe('grab');
		expect(extractLearningKeyword('ข้าว 60 บาท')).toBeNull();
		expect(extractLearningKeyword('ซื้อ 35 บาท')).toBeNull();
		expect(extractLearningKeyword('สลิปโอนเงิน')).toBeNull();
	});

	it('normalizes user edits and avoids substring collisions for Latin names', () => {
		expect(normalizeLearnedText('  GRAB-food! ')).toBe('grab food');
		expect(learnedKeywordMatches('grab', 'จ่าย Grab 60 บาท', 'expense', 'expense')).toBe(true);
		expect(learnedKeywordMatches('grab', 'upgrade 60 บาท', 'expense', 'expense')).toBe(false);
		expect(learnedKeywordMatches('grab', 'Grab 60 บาท', 'expense', 'income')).toBe(false);
	});
});
