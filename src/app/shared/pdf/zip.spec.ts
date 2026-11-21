import { crc32, zipFiles } from './zip';

describe('zipFiles', () => {
  it('computes the CRC-32 of ZIP archives', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('stores the files with their names, readable by any unzip', async () => {
    const files = [new File(['ciao'], 'page-1.jpg'), new File(['mondo!'], 'pàgina-2.jpg')];
    const zip = await zipFiles(files, 'pages.zip');
    expect(zip.name).toBe('pages.zip');
    expect(zip.type).toBe('application/zip');
    const bytes = new Uint8Array(await zip.arrayBuffer());
    const view = new DataView(bytes.buffer);
    // Local header of the first file, its name and its content right after.
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(18, true)).toBe(4);
    expect(new TextDecoder().decode(bytes.slice(30, 30 + 10))).toBe('page-1.jpg');
    expect(new TextDecoder().decode(bytes.slice(40, 44))).toBe('ciao');
    // End of the central directory: two entries.
    const end = bytes.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    // Central directory starts where it says.
    expect(view.getUint32(view.getUint32(end + 16, true), true)).toBe(0x02014b50);
  });
});
