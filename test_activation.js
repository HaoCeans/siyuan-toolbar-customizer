// 激活码验证测试
function validateActivationCode(code) {
  console.log('开始验证激活码:', code);
  
  // 检查格式：WHALE-XXX-XXX-XXXX-XX (21位)
  if (!code || code.length !== 21) {
    console.log('格式错误：长度不是21位，实际长度:', code.length);
    return false;
  }
  
  if (!code.startsWith('WHALE-') || code.split('-').length !== 5) {
    console.log('格式错误：不以WHALE-开头或分隔符数量不对');
    return false;
  }
  
  // 提取字母字符（只取中间三组）
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
  
  if (letters.length !== 10) {
    console.log('字母数量错误：期望10个，实际', letters.length, '个');
    return false;
  }
  
  // 字母转数字(A=1, B=2, ..., Z=26)
  const numbers = letters.split('').map(char => char.charCodeAt(0) - 64);
  console.log('转换的数字:', numbers);
  const sum = numbers.reduce((acc, num) => acc + num, 0);
  console.log('求和结果:', sum);
  
  // 计算校验位
  const firstCheck = (sum % 8).toString(); // 第一校验位：求和%8
  const secondCheck = String.fromCharCode(65 + (sum % 26)); // 第二校验位：求和%26对应字母
  console.log('计算的校验位:', firstCheck + secondCheck);
  
  // 提取输入的校验位
  const inputCheck = parts[4]; // 最后一组作为校验位
  console.log('输入的校验位:', inputCheck);
  
  // 验证校验位
  const result = inputCheck === firstCheck + secondCheck;
  console.log('验证结果:', result);
  return result;
}

// 测试用户提供的激活码
const testCode = "WHALE-HAU-W18-BR2H-1C";
console.log("=== 测试激活码:", testCode, "===\n");
const result = validateActivationCode(testCode);
console.log("\n最终结果:", result ? "✓ 通过验证" : "✗ 验证失败");