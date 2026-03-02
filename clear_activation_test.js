// 清除激活状态测试脚本
// 注意：这个脚本需要在浏览器控制台中运行

// 清除激活状态的函数
function clearActivationStatus() {
    // 清除本地存储中的激活配置
    const keysToClear = [
        'desktopFeatureConfig',
        'mobileFeatureConfig',
        'featureConfig'  // 旧版本的配置key
    ];
    
    keysToClear.forEach(key => {
        localStorage.removeItem(key);
        console.log(`已清除配置: ${key}`);
    });
    
    // 重置相关配置对象（如果在全局作用域中可访问）
    if (typeof window !== 'undefined' && window.pluginInstance) {
        const plugin = window.pluginInstance;
        if (plugin.desktopFeatureConfig) {
            plugin.desktopFeatureConfig.authorActivated = false;
            plugin.desktopFeatureConfig.authorCode = '';
        }
        if (plugin.mobileFeatureConfig) {
            plugin.mobileFeatureConfig.authorActivated = false;
            plugin.mobileFeatureConfig.authorCode = '';
        }
        console.log('已重置插件配置对象');
    }
    
    console.log('激活状态已清除完成');
    console.log('请刷新页面以查看未激活状态');
}

// 显示当前激活状态
function showCurrentStatus() {
    const desktopConfig = localStorage.getItem('desktopFeatureConfig');
    const mobileConfig = localStorage.getItem('mobileFeatureConfig');
    
    console.log('=== 当前激活状态 ===');
    
    if (desktopConfig) {
        const desktop = JSON.parse(desktopConfig);
        console.log('电脑端激活状态:', desktop.authorActivated ? '已激活' : '未激活');
        console.log('电脑端激活码:', desktop.authorCode || '无');
    } else {
        console.log('电脑端配置: 未找到');
    }
    
    if (mobileConfig) {
        const mobile = JSON.parse(mobileConfig);
        console.log('手机端激活状态:', mobile.authorActivated ? '已激活' : '未激活');
        console.log('手机端激活码:', mobile.authorCode || '无');
    } else {
        console.log('手机端配置: 未找到');
    }
}

// 执行测试
console.log('开始测试未激活状态...');
showCurrentStatus();

// 询问用户是否要清除激活状态
const shouldClear = confirm('是否要清除当前激活状态以测试未激活界面？\n点击"确定"清除，点击"取消"只查看当前状态');

if (shouldClear) {
    clearActivationStatus();
    alert('激活状态已清除，请刷新页面查看未激活状态');
} else {
    console.log('已取消清除操作，保持当前状态');
}