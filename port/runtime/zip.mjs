/** Index stored ZIP members without copying their contents. The APK stores its
 * drawable PNGs this way, and the patch archive stores the original game audio. */
export function readStoredFiles(bytes, include = () => true) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = new Map();
  const decoder = new TextDecoder();
  const firstPossibleEnd = Math.max(0, bytes.length - 22 - 0xffff);
  let end = bytes.length - 22;
  while (end >= firstPossibleEnd && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < firstPossibleEnd) throw Error('ZIP directory missing');

  const count = view.getUint16(end + 10, true);
  let entry = view.getUint32(end + 16, true);
  for (let i = 0; i < count; i++) {
    if (entry + 46 > end || view.getUint32(entry, true) !== 0x02014b50) throw Error('Invalid ZIP directory');
    const method = view.getUint16(entry + 10, true);
    const size = view.getUint32(entry + 20, true);
    const nameLength = view.getUint16(entry + 28, true);
    const extraLength = view.getUint16(entry + 30, true);
    const commentLength = view.getUint16(entry + 32, true);
    const local = view.getUint32(entry + 42, true);
    const name = decoder.decode(bytes.subarray(entry + 46, entry + 46 + nameLength)).toLowerCase();
    entry += 46 + nameLength + extraLength + commentLength;
    if (entry > end) throw Error('ZIP entry exceeds directory');
    if (name.endsWith('/') || !include(name)) continue;
    if (method !== 0) throw Error('Unsupported compressed ZIP member ' + name);
    if (local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50) throw Error('Invalid ZIP member ' + name);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (start + size > bytes.length) throw Error('ZIP member exceeds archive');
    files.set(name, bytes.subarray(start, start + size));
  }
  return files;
}
