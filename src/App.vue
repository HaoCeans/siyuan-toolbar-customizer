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

// 插入换行按钮功能已移除

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
.siyuan-toolbar-customizer-app {
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
