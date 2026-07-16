# AETHER-2 · 字符终端

## 所有人都能打开（公网链接）

当前公网地址（电脑保持开机且终端不要关）：

### **http://bore.pub:50115/**

发给任何人即可，不限同一 Wi‑Fi。

再次分享时运行：

```bash
cd aether-2
./share-public.sh
```

终端会打印新的 `http://bore.pub:端口`，把该链接发出去。窗口关掉后公网地址会失效。

## 仅本机 / 同一 Wi‑Fi

```bash
ruby serve.rb
# 本机 http://127.0.0.1:5173/
# 局域网 http://你的IP:5173/ （不要发 localhost）
```
