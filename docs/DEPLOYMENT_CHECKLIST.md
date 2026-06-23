# IvyeaOps 部署检查清单

## 当前状态

- Netlify 可以承载前端。
- FastAPI 后端不能只靠 Netlify 长期运行。
- Cloudflare quick tunnel 只能临时测试，不能长期稳定使用。
- 长期部署需要一个固定后端域名。

## 正式上线前必须确认

### 后端

- [ ] 后端部署到 Render/Railway/Fly/VPS 等长期运行环境。
- [ ] 使用项目根目录 `Dockerfile` 构建。
- [ ] `/app/data` 已挂载持久化磁盘。
- [ ] `IVYEA_OPS_SECRET` 已固定，不会每次重启随机变化。
- [ ] 已设置 `ADMIN_PASSWORD` 或 `IVYEA_OPS_PASSWORD_HASH`。
- [ ] 已设置 `IVYEA_OPS_DEV=0`。
- [ ] 已设置 `IVYEA_OPS_ALLOWED_ORIGINS=https://你的-netlify-域名`。
- [ ] `https://你的后端域名/api/health` 可访问。

### 前端 / Netlify

- [ ] `netlify.toml` 的 `/api/*` 代理地址已改成固定后端域名。
- [ ] 没有继续使用 `trycloudflare.com` 临时地址。
- [ ] Netlify 生产部署成功。
- [ ] `https://你的-netlify-域名/api/health` 可访问。
- [ ] 登录成功。

### 数据源

- [ ] 登录后进入系统配置。
- [ ] 填写 Sorftime Key。
- [ ] 填写 SIF Key。
- [ ] 填写文本 AI provider 或确认本地演示降级可接受。
- [ ] 点击测试，确认配置保存成功。
- [ ] 重启后配置仍存在，证明持久化磁盘正常。

## 最小验收命令

```bash
curl https://你的后端域名/api/health
curl https://你的-netlify-域名/api/health
```

## 交接信息

部署完成后，把下面信息补齐：

```text
Netlify site:
Backend provider:
Backend URL:
Admin user:
Data disk path: /app/data
Production env owner:
Last deploy date:
```

不要在这里记录真实密码、API key 或 token。
