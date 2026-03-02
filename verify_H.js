// 专门验证H的对应关系
console.log("验证字母H的数字对应：");

// 方法1：直接查看ASCII码
const H_ascii = 'H'.charCodeAt(0);
console.log(`H的ASCII码: ${H_ascii}`);
console.log(`H - 64 = ${H_ascii - 64}`);

// 方法2：查看完整的A-Z映射
console.log("\n完整A-Z映射验证：");
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
for (let i = 0; i < alphabet.length; i++) {
    const letter = alphabet[i];
    const number = letter.charCodeAt(0) - 64;
    console.log(`${letter} = ${number}`);
    if (letter === 'H') {
        console.log(`>>> H的位置: 索引${i}, 对应数字${number} <<<`);
    }
}

// 验证111%26=7对应的字母
console.log("\n验证111%26的结果：");
const result = 111 % 26;
console.log(`111 % 26 = ${result}`);
const correspondingLetter = String.fromCharCode(65 + result);
console.log(`数字${result}对应的字母: ${correspondingLetter}`);