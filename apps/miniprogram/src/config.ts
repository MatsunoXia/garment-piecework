/**
 * API 地址配置。
 * - 微信开发者工具本地调试：保持 http://localhost:3000/api，并在「详情 → 本地设置」勾选
 *   「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」。
 * - 真机预览：改成电脑局域网 IP，例如 http://192.168.1.10:3000/api，并确保手机与电脑同一网络。
 * - 正式上线：改成已在小程序后台配置的 HTTPS 域名。
 */
export const API_BASE_URL = 'http://localhost:3000/api';

/**
 * 是否显示「本地开发调试」入口（输入 OpenID 直接登录）。
 * 正式发布前改为 false，避免真实用户看到开发入口。
 */
export const ENABLE_DEV_UI = true;
