// 测试独立的激活码验证模块
import { validateActivationCode, getActivationCodeDetails } from './src/utils/activationCodeValidator'

// 测试用例
const testCodes = [
  "WHALE-TN2-FWQ-FJO5-7G",  // 用户提供的测试码
  "WHALE-ABC-DEF-GHIJ-7D",  // 正确示例
  "WHALE-HAU-W18-BR2H-1C"   // 之前测试的码
];

console.log("=== 激活码验证模块测试 ===\n");

testCodes.forEach((code, index) => {
  console.log(`测试 ${index + 1}: ${code}`);
  const result = validateActivationCode(code);
  console.log(`验证结果: ${result ? '✓ 通过' : '✗ 失败'}`);
  
  if (!result) {
    const details = getActivationCodeDetails(code);
    console.log(`详细信息:`);
    console.log(`  提取字母: ${details.letters}`);
    console.log(`  数字序列: [${details.numbers.join(', ')}]`);
    console.log(`  求和结果: ${details.sum}`);
    console.log(`  计算校验位: ${details.calculatedChecksum}`);
    console.log(`  输入校验位: ${details.inputChecksum}`);
  }
  console.log("---");
});