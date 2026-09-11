/**
 * Minimaler ZIP-Writer (nur „store", keine Kompression).
 *
 * Reicht für EPUB: dort MUSS der erste Eintrag `mimetype` unkomprimiert sein —
 * genau das erzeugt dieser Writer. Kein externes Paket nötig.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = (CRC_TABLE[(crc ^ (bytes[index] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  path: string;
  data: Uint8Array;
}

export function createStoredZip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const data = entry.data;
    const crc = crc32(data);
    const size = data.length;

    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true); // local file header
    localView.setUint16(4, 20, true); // version needed
    localView.setUint16(6, 0, true); // flags
    localView.setUint16(8, 0, true); // method: store
    localView.setUint16(10, 0, true); // mod time
    localView.setUint16(12, 0, true); // mod date
    localView.setUint32(14, crc, true);
    localView.setUint32(18, size, true); // compressed size
    localView.setUint32(22, size, true); // uncompressed size
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true); // extra length
    local.set(name, 30);

    chunks.push(local, data);

    const directory = new Uint8Array(46 + name.length);
    const directoryView = new DataView(directory.buffer);
    directoryView.setUint32(0, 0x02014b50, true); // central directory header
    directoryView.setUint16(4, 20, true); // version made by
    directoryView.setUint16(6, 20, true); // version needed
    directoryView.setUint16(8, 0, true); // flags
    directoryView.setUint16(10, 0, true); // method
    directoryView.setUint16(12, 0, true); // time
    directoryView.setUint16(14, 0, true); // date
    directoryView.setUint32(16, crc, true);
    directoryView.setUint32(20, size, true);
    directoryView.setUint32(24, size, true);
    directoryView.setUint16(28, name.length, true);
    directoryView.setUint16(30, 0, true); // extra
    directoryView.setUint16(32, 0, true); // comment
    directoryView.setUint16(34, 0, true); // disk number
    directoryView.setUint16(36, 0, true); // internal attributes
    directoryView.setUint32(38, 0, true); // external attributes
    directoryView.setUint32(42, offset, true);
    directory.set(name, 46);
    central.push(directory);

    offset += local.length + data.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true); // end of central directory
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  return new Blob([...chunks, ...central, end], { type: "application/epub+zip" });
}
