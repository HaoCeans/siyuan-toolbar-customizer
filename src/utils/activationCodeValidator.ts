/**
 * 激活码验证模块
 * 专门处理WHALE格式激活码的验证逻辑
 */

/**
 * 验证激活码格式和校验位
 * @param code - 激活码字符串
 * @returns boolean - 验证是否通过
 */
export function validateActivationCode(code: string): boolean {
  console.log('开始验证激活码:', code);
  
  // 1. 格式检查：WHALE-XXX-XXX-XXXX-XX (21位)
  if (!code || code.length !== 21) {
    console.log('格式错误：长度不是21位，实际长度:', code.length);
    return false;
  }
  
  if (!code.startsWith('WHALE-') || code.split('-').length !== 5) {
    console.log('格式错误：不以WHALE-开头或分隔符数量不对');
    return false;
  }
  
  // 2. 提取字母字符（只取中间三组）
  const parts = code.split('-');
  if (parts.length !== 5) {
    console.log('格式错误：分组数量不对');
    return false;
  }
  
  // 提取第2、3、4组的字母
  const group2 = parts[1]; // 3位
  const group3 = parts[2]; // 3位  
  const group4 = parts[3]; // 4位
  
  console.log('各组内容:', group2, group3, group4);
  
  // 合并并只保留字母
  const letters = (group2 + group3 + group4).replace(/[^A-Z]/g, '');
  console.log('提取的字母:', letters);
  
  // 不再强制要求10个字母，只要有大写字母即可
  if (letters.length === 0) {
    console.log('错误：中间三组中没有找到大写字母');
    return false;
  }
  
  // 3. 字母转数字(A=1, B=2, ..., Z=26)并求和
  const numbers = letters.split('').map(char => char.charCodeAt(0) - 64);
  console.log('转换的数字:', numbers);
  const sum = numbers.reduce((acc, num) => acc + num, 0);
  console.log('求和结果:', sum);
  
  // 4. 计算校验位
  const firstCheck = (sum % 8).toString(); // 第一校验位：求和%8
  const secondCheck = String.fromCharCode(65 + (sum % 26)); // 第二校验位：求和%26对应字母
  console.log('计算的校验位:', firstCheck + secondCheck);
  
  // 5. 提取输入的校验位并验证
  const inputCheck = parts[4]; // 最后一组作为校验位
  console.log('输入的校验位:', inputCheck);
  
  const result = inputCheck === firstCheck + secondCheck;
  console.log('验证结果:', result);
  return result;
}

/**
 * 获取激活码验证的详细信息（用于调试）
 * @param code - 激活码字符串
 * @returns 验证详情对象
 */
export function getActivationCodeDetails(code: string): {
  isValid: boolean;
  letters: string;
  numbers: number[];
  sum: number;
  calculatedChecksum: string;
  inputChecksum: string;
  groups: string[];
} {
  const parts = code.split('-');
  const group2 = parts[1];
  const group3 = parts[2];
  const group4 = parts[3];
  
  const letters = (group2 + group3 + group4).replace(/[^A-Z]/g, '');
  const numbers = letters.split('').map(char => char.charCodeAt(0) - 64);
  const sum = numbers.reduce((acc, num) => acc + num, 0);
  const firstCheck = (sum % 8).toString();
  const secondCheck = String.fromCharCode(65 + (sum % 26));
  const calculatedChecksum = firstCheck + secondCheck;
  const inputChecksum = parts[4];
  
  return {
    isValid: inputChecksum === calculatedChecksum,
    letters,
    numbers,
    sum,
    calculatedChecksum,
    inputChecksum,
    groups: [group2, group3, group4]
  };
}

// 默认导出
export default {
  validateActivationCode,
  getActivationCodeDetails
};