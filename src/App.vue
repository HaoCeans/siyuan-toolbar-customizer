<template>
  
</template>

<script setup lang="ts">
import SyButton from '@/components/SiyuanTheme/SyButton.vue'
import SyCheckbox from '@/components/SiyuanTheme/SyCheckbox.vue'
import SyIcon from '@/components/SiyuanTheme/SyIcon.vue'
import SyInput from '@/components/SiyuanTheme/SyInput.vue'
import SySelect from '@/components/SiyuanTheme/SySelect.vue'
import SyTextarea from '@/components/SiyuanTheme/SyTextarea.vue'
import { usePlugin } from '@/main'
import { onMounted } from 'vue'


/*  =====  纯 JS：给思源编辑器工具栏插入“H”换行按钮  =====  */
(function () {
    const BTN_ID = 'btn-insert-br';          // 按钮唯一标识
    const POLL_INTERVAL = 700;               // 轮询间隔
    let protyleCache = null;                 // 缓存当前 protyle 实例

    /* 创建按钮 */
    function createBtn() {
        const btn = document.createElement('button');
        btn.id = BTN_ID;
        btn.className = 'block__icon fn__flex-center ariaLabel';
        btn.setAttribute('aria-label', '插入换行');
        btn.textContent = 'H';
        btn.style.cssText = 'font-size:16px;font-weight:bold;line-height:1;';
        btn.title = '插入换行';
        btn.onclick = () => insertNewline();
        return btn;
    }

    /* 真正插入换行 */
    function insertNewline() {
        const editor = document.querySelector('.protyle-wysiwyg');
        if (!editor) return;

        /* 方案：直接派 Enter 键盘事件 */
        const down = new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true
        });
        const up = new KeyboardEvent('keyup', {
            key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true
        });
        editor.dispatchEvent(down);
        editor.dispatchEvent(up);

        /* 可选：触发 input 让思源感知内容变化 */
        setTimeout(() => editor.dispatchEvent(new Event('input', { bubbles: true })), 10);
    }

    /* 主逻辑：找到工具栏并插入按钮 */
    function install() {
        const bar = document.querySelector('.protyle-breadcrumb');
        if (!bar) return;                      // 未打开文档，等下次轮询
        if (bar.querySelector('#' + BTN_ID)) return; // 已存在

        const exitBtn = bar.querySelector('[data-type="exit-focus"]');
        if (!exitBtn) return;

        exitBtn.insertAdjacentElement('afterend', createBtn());
    }

    /* 轮询启动 */
    const timer = setInterval(() => {
        if (document.querySelector('.protyle-wysiwyg')) {
            install();
        }
    }, POLL_INTERVAL);

    /* 插件卸载时清理（可选） */
    window.addEventListener('beforeunload', () => clearInterval(timer));
})();




</script>

<!-- 局部样式 -->
<style lang="scss" scoped>
.plugin-app-main {
  width: 100%;
  height: 100%;
  max-height: 100vh;
  box-sizing: border-box;
  pointer-events: none;

  position: absolute;
  top: 0;
  left: 0;
  z-index: 4;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: nowrap;

  .demo {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    pointer-events: auto;

    z-index: 10;

    background-color: var(--b3-theme-surface);
    border-radius: var(--b3-border-radius);
    border: 1px solid var(--b3-border-color);
    padding: 16px;
  }
}
</style>

<!-- 全局样式 -->
<style lang="scss">
.plugin-sample-vite-vue-app {
  width: 100vw;
  height: 100dvh;
  max-height: 100vh;
  position: absolute;
  top: 0px;
  left: 0px;
  pointer-events: none;
  box-sizing: border-box;
}

.row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
</style>