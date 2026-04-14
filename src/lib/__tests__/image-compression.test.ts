import { describe, it, expect, vi, beforeEach } from 'vitest'
import { compressImage, createThumbnail } from '../image-compression'

vi.mock('browser-image-compression', () => ({
  default: vi.fn(async (file: File, options: { maxSizeMB: number }) => {
    // Return a smaller mock file
    const blob = new Blob(['compressed'], { type: file.type })
    return new File([blob], file.name, { type: file.type })
  }),
}))

import imageCompression from 'browser-image-compression'

describe('compressImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return the original file if it is smaller than 100KB', async () => {
    const smallFile = new File(['x'.repeat(50 * 1024)], 'small.jpg', { type: 'image/jpeg' })
    const result = await compressImage(smallFile)
    expect(result).toBe(smallFile)
    expect(imageCompression).not.toHaveBeenCalled()
  })

  it('should call imageCompression for files larger than 100KB', async () => {
    const largeFile = new File(['x'.repeat(200 * 1024)], 'large.jpg', { type: 'image/jpeg' })
    await compressImage(largeFile)
    expect(imageCompression).toHaveBeenCalledOnce()
  })

  it('should pass maxSizeMB=0.5 by default', async () => {
    const largeFile = new File(['x'.repeat(200 * 1024)], 'large.jpg', { type: 'image/jpeg' })
    await compressImage(largeFile)
    expect(imageCompression).toHaveBeenCalledWith(largeFile, expect.objectContaining({ maxSizeMB: 0.5 }))
  })

  it('should use custom maxSizeMB when provided', async () => {
    const largeFile = new File(['x'.repeat(200 * 1024)], 'large.jpg', { type: 'image/jpeg' })
    await compressImage(largeFile, 1.0)
    expect(imageCompression).toHaveBeenCalledWith(largeFile, expect.objectContaining({ maxSizeMB: 1.0 }))
  })
})

describe('createThumbnail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should call imageCompression with maxSizeMB=0.05', async () => {
    const file = new File(['x'.repeat(200 * 1024)], 'photo.jpg', { type: 'image/jpeg' })
    await createThumbnail(file)
    expect(imageCompression).toHaveBeenCalledWith(file, expect.objectContaining({ maxSizeMB: 0.05 }))
  })

  it('should call imageCompression with maxWidthOrHeight=300', async () => {
    const file = new File(['x'.repeat(200 * 1024)], 'photo.jpg', { type: 'image/jpeg' })
    await createThumbnail(file)
    expect(imageCompression).toHaveBeenCalledWith(file, expect.objectContaining({ maxWidthOrHeight: 300 }))
  })
})
