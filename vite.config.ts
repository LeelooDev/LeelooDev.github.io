import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 站点部署在 GitHub 用户站根路径（LeelooDev.github.io），所以 base 保持 '/'，
// 文章路由和 /images 图片路径都无需仓库名前缀。
export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  build: {
    // 客户端产物进 dist（最终发布目录），SSR 产物进 dist-ssr（只给 prerender 脚本用）。
    outDir: isSsrBuild ? 'dist-ssr' : 'dist',
    emptyOutDir: true,
  },
}))
