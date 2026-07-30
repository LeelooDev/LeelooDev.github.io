---
title: 极光推送 iOS 证书过期续期完整教程
date: 2026-06-07
category: code
tags: [iOS, 极光推送, APNs, 推送通知]
cover: /images/cover-swans.jpg
coverAlt: 蓝色湖面上的两只天鹅
excerpt: 极光推送 iOS 证书每年过期都要重做一次？本教程用 APNs Auth Key（.p8）替代传统 .p12 证书，配置一次永不过期，附 Apple Developer 与极光控制台完整图文步骤。
dek: 一劳永逸方案——用 APNs Auth Key（.p8）替代传统 .p12 证书，永不过期，配置一次终身使用。
---

> 一劳永逸方案：用 APNs Auth Key（.p8）替代传统 .p12 证书，**永不过期**

* * *

## 背景知识

极光推送本身没有证书，过期的实际是你上传到极光控制台的 **Apple APNs 推送凭证**。Apple 提供两种鉴权方式：

| 方式          | 文件     | 有效期      | 推荐         |
| ----------- | ------ | -------- | ---------- |
| 证书鉴权（旧）     | `.p12` | 1 年      | ❌ 每年都要重做一次 |
| Token 鉴权（新） | `.p8`  | **永不过期** | ✅ 一次配置终身使用 |

**本教程采用 Token 鉴权方式，配置一次以后再也不用管。**

* * *

## 你需要准备

-   Apple Developer 账号（付费会员）
-   极光推送账号 + 你的 App 已经在极光后台注册
-   你的 App Bundle ID（在极光后台或 Xcode 项目里都能看到）
-   一台能登录 Apple Developer 的电脑

* * *

## 第一步：在 Apple Developer 创建 APNs Auth Key

### 1.1 进入 Keys 页面

登录 [Apple Developer](https://developer.apple.com/account) → 左侧菜单 **Certificates, Identifiers & Profiles** → 点击 **Keys** → 点右上角 **+** 新建。

### 1.2 填写 Key 信息

| 字段                        | 填什么                                              |
| ------------------------- | ------------------------------------------------ |
| **Key Name**              | `JPush APNs AuthKey`（自定义，仅供识别，不能含特殊字符）           |
| **Key Usage Description** | `For Jiguang Push iOS notifications`（可选）         |
| **ENABLE 列**              | 勾选 ✅ **Apple Push Notifications service (APNs)** |

### 1.3 配置 APNs

勾选 APNs 后，右侧会出现 **Configure** 按钮，必须点进去配置：

| 字段                  | 选择                                                 |
| ------------------- | -------------------------------------------------- |
| **Environment**     | `Sandbox & Production`（开发+生产通用）                    |
| **Key Restriction** | `Team Scoped (All Topics)`（最通用，整个 Team 下所有 App 共用） |

⚠️ **保存后这两项不能修改**，但选最通用的组合即可。

点 **Save** 返回。

### 1.4 注册并下载 .p8 文件

1.  右上角 **Continue** → 确认信息 → **Register**
1.  出现下载页面，**立刻点 Download** 拿到 `.p8` 文件
1.  ⚠️ **只能下载一次！** 关掉页面就再也下不到了，丢了只能 Revoke 重做
1.  同时**手动复制 Key ID**（10 位字符）

### 1.5 妥善保存文件

```
# 推荐放到固定目录，别留在下载文件夹
mkdir -p ~/Documents/AppleKeys
mv ~/Downloads/AuthKey_*.p8 ~/Documents/AppleKeys/
```

最好同时备份一份到密码管理器或安全网盘。

* * *

## 第二步：收集配置极光所需的四件套

完成第一步后，你应该有：

| 信息            | 在哪里找                                  |
| ------------- | ------------------------------------- |
| **`.p8` 文件**  | 第 1.4 步下载到本地的 `AuthKey_xxxxxxxxxx.p8` |
| **Key ID**    | 第 1.4 步复制的 10 位字符串                    |
| **Team ID**   | Apple Developer 账户右上角，10 位字符串         |
| **Bundle ID** | 你 App 的包名，如 `com.example.app`         |

* * *

## 第三步：在极光控制台切换鉴权方式

### 3.1 进入应用设置

登录 [极光控制台](https://www.jiguang.cn/) → 选择你的应用 → **应用设置**。

### 3.2 进入推送设置

下方 **产品服务配置** → **推送设置** → 点击 **去设置**。

### 3.3 切换到 iOS Tab

页面顶部 Tab 栏切换到 **iOS**。

### 3.4 切换鉴权方式

找到“选择鉴权方式”区域：

-   默认选中：`● iOS证书配置`（旧方式，已过期就显示红色“已过期”标签）
-   **点击切换为：`● Token Authentication配置`**

### 3.5 填写配置

切换后表单变成下面 4 个字段：

| 字段                | 填什么                       |
| ----------------- | ------------------------- |
| **Bundle ID**     | 你的 App Bundle ID（通常已自动填好） |
| **APNs Auth Key** | 上传 `.p8` 文件               |
| **Key ID**        | 第 1.4 步的 10 位字符串          |
| **Team ID**       | 你的 Team ID                |

点 **保存**。

* * *

## 第四步：验证

### 4.1 配置状态检查

保存后页面应该显示：

-   APNs Auth Key 上传状态：🟢 **已上传**
-   各字段显示正确的 Key ID 和 Team ID

### 4.2 发送测试推送

极光控制台 → **推送** → **发送通知** → 选择目标设备发一条测试。能收到即配置成功。

* * *

## 常见疑问

### Q1：旧的“iOS 证书配置”显示已过期，要不要删除或更新？

**不用管。** 极光官方明确说过两种鉴权方式二选一，已选 Token 鉴权后，旧的过期证书不会再影响推送。

### Q2：换鉴权方式后需要重新打包 App 上架吗？

**不需要。** 整个过程只在服务端配置，App 端代码不变。

### Q3：.p8 文件丢了怎么办？

无法找回，只能：

1.  去 Apple Developer → Keys → 把旧 Key **Revoke**
1.  重新走一遍第一步流程创建新 Key
1.  用新的 .p8 + Key ID 在极光后台重新配置

### Q4：什么情况下还会失效？

只有以下三种情况会让 .p8 失效：

-   Apple Developer 账号过期/欠费
-   你手动在 Apple 后台 Revoke 了这个 Key
-   你换了 Apple Developer 账号（Team ID 变了）

正常使用永不过期。

### Q5：开发环境和生产环境要分别配置吗？

**不用。** 创建 Key 时选了 `Sandbox & Production`，一个 Key 同时管两个环境。

* * *

## 关键文件清单

配置完成后，请妥善保管以下信息（建议存入密码管理器）：

```
AuthKey_XXXXXXXXXX.p8        ← .p8 文件备份
Key ID: XXXXXXXXXX           ← 10 位字符
Team ID: XXXXXXXXXX          ← 10 位字符
Bundle ID: com.example.app   ← App 包名
Apple Developer 账号 + 密码
```

⚠️ **以上信息属于敏感凭证，切勿提交到 Git 仓库或公开渠道，建议使用 1Password / Bitwarden 等密码管理工具保存。**

* * *

## 参考资料

-   [极光官方：iOS SDK 证书设置指南](https://docs.jiguang.cn/jpush/client/iOS/ios_cer_guide)
-   [极光社区：官网推送证书配置常见疑问](https://community.jiguang.cn/article/318344)
-   [Apple Developer: Establishing a token-based connection to APNs](https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns)

* * *

*本教程基于 2026 年 5 月极光控制台和 Apple Developer 后台界面编写，如界面有变化请以官方文档为准。*
