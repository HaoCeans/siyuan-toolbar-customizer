// 验证字母与数字的对应关系
console.log("字母与数字对应关系：");
for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i);
    const number = i + 1; // A=1, B=2, ..., Z=26
    console.log(`${letter} = ${number}`);
}

console.log("\n验证计算逻辑：");
const sum = 111;
const modResult = sum % 26;
console.log(`111 % 26 = ${modResult}`);

// modResult = 7，对应哪个字母？
const letter = String.fromCharCode(65 + modResult);
console.log(`数字 ${modResult} 对应字母: ${letter}`);

// 让我们验证一下A到Z的完整映射
console.log("\n完整验证A-Z映射：");
for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i);
    const calculatedNumber = letter.charCodeAt(0) - 64;
    console.log(`${letter} → ${calculatedNumber} (计算方式: ${letter}.charCodeAt(0) - 64)`);
}