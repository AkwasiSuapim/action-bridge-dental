import { describe, expect, it } from 'vitest';
import { mimeTypeFor } from './file-types';

describe('upload file types', () => {
  it('trusts only supported reported types and falls back to the extension', () => {
    expect(mimeTypeFor('file:///x/estimate.pdf', 'application/pdf')).toBe('application/pdf');
    expect(mimeTypeFor('file:///x/photo.JPG', undefined)).toBe('image/jpeg');
    expect(mimeTypeFor('file:///x/photo', 'image/jpg')).toBe('image/jpeg');
    expect(mimeTypeFor('file:///x/note.m4a', null)).toBe('audio/mp4');
    expect(mimeTypeFor('file:///x/page.heic', 'image/heic')).toBeNull();
    expect(mimeTypeFor('file:///x/doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBeNull();
  });
});
