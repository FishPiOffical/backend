import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './styles/themes.css'
import './styles/base.css'

// 初始化根应用实例并依次注入 Pinia 与 Vue Router
const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
