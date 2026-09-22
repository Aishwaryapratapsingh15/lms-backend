import { BadRequestException } from '@nestjs/common';

type AttachmentType = {
  extensions: string[];
  matchesSignature: (buffer: Buffer) => boolean;
};

const startsWith = (buffer: Buffer, bytes: number[]) => bytes.every((byte, i) => buffer[i] === byte);

const ATTACHMENT_TYPES: AttachmentType[] = [
  { extensions: ['pdf'], matchesSignature: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]) },
  { extensions: ['png'], matchesSignature: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { extensions: ['jpg', 'jpeg'], matchesSignature: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  { extensions: ['gif'], matchesSignature: (b) => startsWith(b, [0x47, 0x49, 0x46, 0x38]) },
  {
    extensions: ['webp'],
    matchesSignature: (b) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && b.slice(8, 12).toString('ascii') === 'WEBP',
  },
  // Modern Office formats are zip archives (PK\x03\x04).
  { extensions: ['docx', 'xlsx', 'pptx'], matchesSignature: (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) },
  // Legacy Office formats are OLE compound files.
  { extensions: ['doc', 'xls', 'ppt'], matchesSignature: (b) => startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) },
];

export function sanitizeFilename(name: string): string {
  const base = name.replace(/^.*[\\/]/, '');
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (cleaned || 'attachment').slice(0, 150);
}

export function assertSafeAttachment(filename: string, buffer: Buffer): void {
  const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : '';
  const type = ATTACHMENT_TYPES.find((t) => t.extensions.includes(ext));

  if (!type) {
    throw new BadRequestException(
      `"${filename}" has an unsupported file type. Allowed: PDF, Word, Excel, PowerPoint, PNG, JPG, GIF, WEBP.`,
    );
  }
  if (!type.matchesSignature(buffer)) {
    throw new BadRequestException(`"${filename}" does not look like a valid ${ext.toUpperCase()} file.`);
  }
}
