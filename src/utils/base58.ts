/**
 * Base58 编解码（与 gen-code.mjs 保持一致）
 * 字母表移除了 0/O/I/l 等易混淆字符
 */
const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const B58_INDEX: Record<string, number> = {};
for (let i = 0; i < B58_ALPHABET.length; i++) {
  B58_INDEX[B58_ALPHABET[i]] = i;
}

export function base58Decode(s: string): Uint8Array {
  if (!s) throw new Error("empty string");
  const bytes = [0];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const digit = B58_INDEX[c];
    if (digit === undefined) throw new Error(`invalid base58 char: ${c}`);
    let carry = digit;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // 统计前导零
  let zeros = 0;
  while (zeros < s.length && s[zeros] === B58_ALPHABET[0]) zeros++;
  const result = new Uint8Array(bytes.length + zeros);
  for (let i = 0; i < zeros; i++) result[i] = 0;
  for (let i = 0; i < bytes.length; i++) result[zeros + i] = bytes[bytes.length - 1 - i];
  return result;
}
