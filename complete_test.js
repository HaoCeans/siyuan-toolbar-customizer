// 完整测试激活码验证过程
function validateActivationCode(code) {
  console.log('=== 开始验证激活码 ===');
  console.log('输入的激活码:', code);
  
  // 1. 格式检查
  console.log('\n1. 格式检查:');
  if (!code || code.length !== 21) {
    console.log('✗ 长度错误：期望21位，实际', code.length, '位');
    return false;
  }
  console.log('✓ 长度正确：21位');
  
  if (!code.startsWith('WHALE-') || code.split('-').length !== 5) {
    console.log('✗ 格式错误：不以WHALE-开头或分隔符数量不对');
    return false;
  }
  console.log('✓ 格式正确：WHALE-开头，5组分隔');
  
  // 2. 提取字母
  console.log('\n2. 提取字母:');
  const parts = code.split('-');
  const group2 = parts[1]; // 3位
  const group3 = parts[2]; // 3位  
  const group4 = parts[3]; // 4位
  
  console.log('第2组:', group2);
  console.log('第3组:', group3);
  console.log('第4组:', group4);
  
  const letters = (group2 + group3 + group4).replace(/[^A-Z]/g, '');
  console.log('提取的大写字母:', letters);
  
  if (letters.length === 0) {
    console.log('✗ 错误：没有找到大写字母');
    return false;
  }
  console.log('✓ 找到', letters.length, '个大写字母');
  
  // 3. 字母转数字并求和
  console.log('\n3. 字母转数字:');
  const numbers = letters.split('').map(char => {
    const num = char.charCodeAt(0) - 64;
    console.log(`${char} → ${num}`);
    return num;
  });
  
  const sum = numbers.reduce((acc, num) => acc + num, 0);
  console.log('数字序列:', numbers);
  console.log('求和结果:', sum);
  
  // 4. 计算校验位
  console.log('\n4. 计算校验位:');
  const firstCheck = (sum % 8).toString();
  const secondCheckNum = sum % 26;
  const secondCheck = String.fromCharCode(65 + secondCheckNum);
  
  console.log('sum % 8 =', sum, '% 8 =', firstCheck);
  console.log('sum % 26 =', sum, '% 26 =', secondCheckNum, '→', secondCheck);
  console.log('计算的校验位:', firstCheck + secondCheck);
  
  // 5. 验证校验位
  console.log('\n5. 校验位验证:');
  const inputCheck = parts[4];
  console.log('输入的校验位:', inputCheck);
  console.log('计算的校验位:', firstCheck + secondCheck);
  
  const result = inputCheck === firstCheck + secondCheck;
  console.log('验证结果:', result ? '✓ 通过' : '✗ 失败');
  
  return result;
}

// 测试用户提供的激活码
console.log("测试激活码: WHALE-TN2-FWQ-FJO5-7G\n");
const result = validateActivationCode("WHALE-TN2-FWQ-FJO5-7G");
console.log("\n=== 最终结果 ===");
console.log(result ? "✓ 激活成功" : "✗ 激活失败");