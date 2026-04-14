import { describe, it, expect } from 'vitest'
import { getCategoryEmoji, CATEGORY_EMOJI } from '../constants'

describe('getCategoryEmoji', () => {
  it('should return correct emoji for "Food & Drink"', () => {
    expect(getCategoryEmoji('Food & Drink')).toBe('🍕')
  })

  it('should return correct emoji for "Outdoors"', () => {
    expect(getCategoryEmoji('Outdoors')).toBe('🌿')
  })

  it('should return correct emoji for "Hobbies"', () => {
    expect(getCategoryEmoji('Hobbies')).toBe('🎨')
  })

  it('should return correct emoji for "Entertainment"', () => {
    expect(getCategoryEmoji('Entertainment')).toBe('🎬')
  })

  it('should return "•" for an unknown category', () => {
    expect(getCategoryEmoji('UnknownCategory')).toBe('•')
  })

  it('should return "•" for empty string', () => {
    expect(getCategoryEmoji('')).toBe('•')
  })

  it('should return all expected categories from CATEGORY_EMOJI', () => {
    const expected = ['Food & Drink', 'Outdoors', 'Hobbies', 'Entertainment', 'Culture', 'Health', 'Lifestyle', 'Professional']
    expected.forEach((cat) => {
      expect(getCategoryEmoji(cat)).toBe(CATEGORY_EMOJI[cat])
    })
  })
})
