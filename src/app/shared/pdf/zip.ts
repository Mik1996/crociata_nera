/**
 * A ZIP archive of some files, without compression ("stored"): the pictures of a PDF's pages are
 * JPEG, already compressed. Browsers let a click start one download only, so several pictures go
 * in one archive. Enough of the format for that: no folders, no ZIP64 (files under 4 GB).
 */
export async function zipFiles(files: readonly File[], name: string): Promise<File> {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const { time, date } = dosDateTime(new Date());
  for (const file of files) {
    const data = new Uint8Array(await file.arrayBuffer());
    const fileName = encoder.encode(file.name);
    const crc = crc32(data);
    const local = header(30, fileName);
    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true); // version needed
    local.view.setUint16(6, 0x0800, true); // names in UTF-8
    local.view.setUint16(10, time, true);
    local.view.setUint16(12, date, true);
    local.view.setUint32(14, crc, true);
    local.view.setUint32(18, data.length, true);
    local.view.setUint32(22, data.length, true);
    local.view.setUint16(26, fileName.length, true);
    parts.push(local.bytes, data);

    const entry = header(46, fileName);
    entry.view.setUint32(0, 0x02014b50, true);
    entry.view.setUint16(4, 20, true); // made by
    entry.view.setUint16(6, 20, true); // version needed
    entry.view.setUint16(8, 0x0800, true);
    entry.view.setUint16(12, time, true);
    entry.view.setUint16(14, date, true);
    entry.view.setUint32(16, crc, true);
    entry.view.setUint32(20, data.length, true);
    entry.view.setUint32(24, data.length, true);
    entry.view.setUint16(28, fileName.length, true);
    entry.view.setUint32(42, offset, true);
    central.push(entry.bytes);
    offset += local.bytes.length + data.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new File([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], name, {
    type: 'application/zip',
  });
}

/** A record of `size` bytes followed by the file name. */
function header(size: number, fileName: Uint8Array): { bytes: Uint8Array; view: DataView } {
  const bytes = new Uint8Array(size + fileName.length);
  bytes.set(fileName, size);
  return { bytes, view: new DataView(bytes.buffer) };
}

/** Date and time in the MS-DOS format of ZIP archives (local time, 2-second steps). */
function dosDateTime(at: Date): { time: number; date: number } {
  return {
    time: (at.getHours() << 11) | (at.getMinutes() << 5) | Math.floor(at.getSeconds() / 2),
    date: ((at.getFullYear() - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate(),
  };
}

let crcTable: Uint32Array | null = null;

/** CRC-32 (IEEE) of some bytes, as ZIP archives store it. */
export function crc32(data: Uint8Array): number {
  crcTable ??= Uint32Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
