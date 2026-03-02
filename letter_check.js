// 详细验证字母到数字的转换
const letters = "TNFWQFJO";
console.log("字母序列:", letters);

// 按照A=1, B=2, ..., Z=26的规则转换
const numbers = letters.split('').map(char => {
    const num = char.charCodeAt(0) - 64;
    console.log(`${char} = ${num}`);
    return num;
});

console.log("转换结果:", numbers);
console.log("求和:", numbers.reduce((acc, num) => acc + num, 0));

// 验证第7个字母
const seventhLetter = letters[6]; // 索引从0开始，第7个是索引6
const seventhNumber = seventhLetter.charCodeAt(0) - 64;
console.log(`第7个字母 ${seventhLetter} 对应数字: ${seventhNumber}`);

// 计算校验位
const sum = numbers.reduce((acc, num) => acc + num, 0);
const firstCheck = (sum % 8).toString();
const secondCheckNum = sum % 26;
const secondCheck = String.fromCharCode(65 + secondCheckNum);

console.log(`总和: ${sum}`);
console.log(`第一校验位 (sum % 8): ${sum} % 8 = ${firstCheck}`);
console.log(`第二校验位 (sum % 26): ${sum} % 26 = ${secondCheckNum} → ${secondCheck}`);
console.log(`计算的校验位: ${firstCheck}${secondCheck}`);