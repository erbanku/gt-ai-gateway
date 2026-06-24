# 客户端管理模块 (Client Management) 设计方案

本方案旨在设计并在本地 AI 网关的左侧导航栏中加入「客户端管理」模块。由于网关运行在本地环境，可以通过 Node.js 直接操作本地文件系统，从而实现**一键自动配置本地 AI 工具（第一版仅支持 Claude Code 和 Codex）**，让其无缝连接并使用网关代理的模型。

## 范围与设计约束

1. **第一版支持范围**
   - 仅支持 Claude Code 和 Codex。
   - Cursor、Cline、Windsurf 等客户端作为后续扩展项，不纳入第一版实现范围。
   - 第一版优先支持 macOS 本地环境；Windows/Linux 后续按客户端配置文件路径差异扩展。

2. **配置方式**
   - 只通过直接修改客户端配置文件实现。
   - 不修改 `.zshrc`、`.bashrc` 等 shell 配置文件，不要求用户手动配置全局环境变量。
   - Claude Code 的网关认证配置写入 `~/.claude/settings.json`，不写入 shell 启动脚本。
   - 不通过执行客户端 CLI 命令写配置，例如不执行 `claude config`。
   - 对于没有稳定配置文件入口的客户端，先不做自动配置。

3. **文件安全**
   - 执行任何修改之前，必须先备份原配置文件。
   - 后端接口必须限制可访问文件路径，只允许读写预定义客户端配置文件。
   - 写入时保留原配置文件中的无关字段，只合并或更新网关相关配置。

---

## 页面与交互设计 (前端)

1. **左侧导航栏入口**
   - 在 `AppSidebar.vue` 中新增「客户端管理」菜单项（图标建议使用 `AppstoreAddOutlined` ），置于「接入配置」或「API 测试」附近。

2. **视图组件 (`/client-manager`)**
   - **全局设置区**: 让用户选择用于注入的「网关 API Key」（可选择现有 Token 或一键生成新 Token）和「默认模型」。
   - **客户端卡片列表区**:
     - 展示当前支持的客户端：Claude Code、Codex。
     - **状态检测**: 卡片上会实时显示该工具的安装状态（本地是否找到配置文件）以及配置状态（是否已连接至本地网关）。
     - **一键配置**: 点击按钮后，后端直接注入 `baseURL`、`apiKey` 等信息至该工具配置。
     - **恢复默认**: 支持从备份文件恢复工具原本的配置。
     - **手动指引**: 对于暂不支持自动改文件的情况，只提供对应客户端配置文件的手动修改说明，不提供环境变量配置方案。

---

## 技术方案 (后端)

### 1. 路由与控制器 (Controller)
新增 `ClientConfigController`，提供以下 REST API 接口：
- `GET /client-config/status.json`: 扫描本地环境，**通过检测 Claude Code 和 Codex 对应的配置文件是否在磁盘上存在，来判断客户端是否安装过**，并返回检测状态（已安装/已配置/未安装）。
- `POST /client-config/apply.json`: 接收客户端名称、网关 URL、API Key 和 模型名，执行配置文件的读写和备份操作。
- `POST /client-config/restore.json`: 从备份恢复指定客户端的原始配置。

### 2. 核心服务 (Service) 与 ConfigAdapter 架构
新增 `ClientConfigService` 作为统一入口，针对底层不同的客户端，采用 **ConfigAdapter (配置适配器) 设计模式**：

#### 基础类 `BaseConfigAdapter`
定义抽象基类，所有客户端配置逻辑均继承此类，要求实现以下核心方法：
- `checkIsInstalled(): boolean`: 检查对应的配置文件是否在磁盘上存在。
- `readConfig(): any`: 读取并解析本地配置文件内容。
- `writeConfig(config: any): void`: 备份原文件后，直接将新的配置写入文件。
- `restoreConfig(): void`: 从备份文件恢复原始配置。

#### 各个客户端的具体 ConfigAdapter 实现：
- **`ClaudeCodeConfigAdapter`** (继承自 `BaseConfigAdapter`):
  - 读取解析 Claude Code 的用户配置文件 `~/.claude/settings.json`，在原 JSON 结构中注入网关 API 配置后写回。
- **`CodexConfigAdapter`** (继承自 `BaseConfigAdapter`):
  - 读取解析 Codex 的用户配置文件 `~/.codex/config.toml`，在原配置结构中注入网关 API 配置后写回。

## Verification Plan

### Automated Tests
- 为 `ClientConfigService` 编写单元测试，使用模拟的文件系统（Mock FS）来验证：
  - JSON 配置文件的正确合并与写入。
  - 备份逻辑是否有效触发。
  - 各种异常情况（如文件不存在、权限不足）的处理逻辑。

### Manual Verification
1. 启动网关并在前端导航栏进入「客户端管理」。
2. 分别点击 Claude Code 和 Codex 的「一键配置」按钮。
3. 打开本机的 Claude Code 和 Codex，检查其请求是否已正确指向本地网关地址。
4. 点击「恢复默认」按钮，检查对应客户端配置是否成功还原。
