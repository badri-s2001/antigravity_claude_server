/**
 * Global Store for Antigravity Console
 * Handles Translations, Toasts, and Shared Config
 */

document.addEventListener('alpine:init', () => {
    Alpine.store('global', {
        // App State
        version: '1.0.0',
        activeTab: 'dashboard',
        webuiPassword: localStorage.getItem('antigravity_webui_password') || '',

        // i18n
        lang: localStorage.getItem('app_lang') || 'en',
        translations: {
            en: {
                dashboard: "Dashboard",
                accounts: "Accounts",
                logs: "Logs",
                settings: "Settings",
                online: "ONLINE",
                offline: "OFFLINE",
                totalAccounts: "TOTAL ACCOUNTS",
                active: "ACTIVE",
                operational: "Operational",
                rateLimited: "RATE LIMITED",
                cooldown: "Cooldown",
                searchPlaceholder: "Search models...",
                allAccounts: "All Accounts",
                stat: "STAT",
                modelIdentity: "MODEL IDENTITY",
                globalQuota: "GLOBAL QUOTA",
                nextReset: "NEXT RESET",
                distribution: "ACCOUNT DISTRIBUTION",
                systemConfig: "System Configuration",
                language: "Language",
                pollingInterval: "Polling Interval",
                logBufferSize: "Log Buffer Size",
                showExhausted: "Show Exhausted Models",
                showExhaustedDesc: "Display models even if they have 0% remaining quota.",
                compactMode: "Compact Mode",
                compactModeDesc: "Reduce padding in tables for higher information density.",
                saveChanges: "Save Changes",
                autoScroll: "Auto-scroll",
                clearLogs: "Clear Logs",
                accessCredentials: "Access Credentials",
                manageTokens: "Manage OAuth tokens and session states",
                addNode: "Add Node",
                status: "STATUS",
                enabled: "ENABLED",
                health: "HEALTH",
                identity: "IDENTITY (EMAIL)",
                projectId: "PROJECT ID",
                sessionState: "SESSION STATE",
                operations: "OPERATIONS",
                delete: "Delete",
                confirmDelete: "Are you sure you want to remove this account?",
                connectGoogle: "Connect Google Account",
                manualReload: "Reload from Disk",
                // Tabs
                tabInterface: "Interface",
                tabClaude: "Claude CLI",
                tabModels: "Models",
                tabServer: "Server Info",
                // Dashboard
                registeredNodes: "Registered Nodes",
                noSignal: "NO SIGNAL DETECTED",
                establishingUplink: "ESTABLISHING UPLINK...",
                // Settings - Models
                modelsDesc: "Manage visibility and ordering of models in the dashboard.",
                showHidden: "Show Hidden Models",
                modelId: "Model ID",
                alias: "Alias",
                actions: "Actions",
                pinToTop: "Pin to top",
                toggleVisibility: "Toggle Visibility",
                noModels: "NO MODELS DETECTED",
                // Settings - Claude
                proxyConnection: "Proxy Connection",
                modelSelection: "Model Selection",
                aliasOverrides: "ALIAS OVERRIDES",
                opusAlias: "Opus Alias",
                sonnetAlias: "Sonnet Alias",
                haikuAlias: "Haiku Alias",
                claudeSettingsAlert: "Settings below directly modify ~/.claude/settings.json. Restart Claude CLI to apply.",
                writeToConfig: "Write to Config",
                // Settings - Server
                port: "Port",
                uiVersion: "UI Version",
                debugMode: "Debug Mode",
                environment: "Environment",
                serverReadOnly: "Server settings are read-only. Modify config.json or .env and restart the server to change.",
                dangerZone: "Danger Zone / Advanced",
                reloadConfigTitle: "Reload Account Config",
                reloadConfigDesc: "Force reload accounts.json from disk",
                reload: "Reload",
                // Config Specific
                primaryModel: "Primary Model",
                subAgentModel: "Sub-agent Model",
                advancedOverrides: "Default Model Overrides",
                opusModel: "Opus Model",
                sonnetModel: "Sonnet Model",
                haikuModel: "Haiku Model",
                authToken: "Auth Token",
                saveConfig: "Save to ~/.claude/settings.json",
                envVar: "Env",
            },
            zh: {
                dashboard: "仪表盘",
                accounts: "账号管理",
                logs: "运行日志",
                settings: "系统设置",
                online: "在线",
                offline: "离线",
                totalAccounts: "账号总数",
                active: "活跃状态",
                operational: "运行中",
                rateLimited: "受限状态",
                cooldown: "冷却中",
                searchPlaceholder: "搜索模型...",
                allAccounts: "所有账号",
                stat: "状态",
                modelIdentity: "模型标识",
                globalQuota: "全局配额",
                nextReset: "重置时间",
                distribution: "账号分布",
                systemConfig: "系统配置",
                language: "语言设置",
                pollingInterval: "数据轮询间隔",
                logBufferSize: "日志缓冲大小",
                showExhausted: "显示耗尽模型",
                showExhaustedDesc: "即使配额为 0% 也显示模型。",
                compactMode: "紧凑模式",
                compactModeDesc: "减少表格间距以显示更多信息。",
                saveChanges: "保存更改",
                autoScroll: "自动滚动",
                clearLogs: "清除日志",
                accessCredentials: "访问凭证",
                manageTokens: "管理 OAuth 令牌和会话状态",
                addNode: "添加节点",
                status: "状态",
                enabled: "启用",
                health: "健康度",
                identity: "身份 (邮箱)",
                projectId: "项目 ID",
                sessionState: "会话状态",
                operations: "操作",
                delete: "删除",
                confirmDelete: "确定要移除此账号吗？",
                connectGoogle: "连接 Google 账号",
                manualReload: "重新加载配置",
                // Tabs
                tabInterface: "界面设置",
                tabClaude: "Claude CLI",
                tabModels: "模型管理",
                tabServer: "服务器信息",
                // Dashboard
                registeredNodes: "已注册节点",
                noSignal: "无信号连接",
                establishingUplink: "正在建立上行链路...",
                // Settings - Models
                modelsDesc: "管理仪表盘中模型的可见性和排序。",
                showHidden: "显示隐藏模型",
                modelId: "模型 ID",
                alias: "别名",
                actions: "操作",
                pinToTop: "置顶",
                toggleVisibility: "切换可见性",
                noModels: "未检测到模型",
                // Settings - Claude
                proxyConnection: "代理连接",
                modelSelection: "模型选择",
                aliasOverrides: "别名覆盖",
                opusAlias: "Opus 别名",
                sonnetAlias: "Sonnet 别名",
                haikuAlias: "Haiku 别名",
                claudeSettingsAlert: "以下设置直接修改 ~/.claude/settings.json。重启 Claude CLI 生效。",
                writeToConfig: "写入配置",
                // Settings - Server
                port: "端口",
                uiVersion: "UI 版本",
                debugMode: "调试模式",
                environment: "运行环境",
                serverReadOnly: "服务器设置只读。修改 config.json 或 .env 并重启服务器以生效。",
                dangerZone: "危险区域 / 高级",
                reloadConfigTitle: "重载账号配置",
                reloadConfigDesc: "强制从磁盘重新读取 accounts.json",
                reload: "重载",
                // Config Specific
                primaryModel: "主模型",
                subAgentModel: "子代理模型",
                advancedOverrides: "默认模型覆盖 (高级)",
                opusModel: "Opus 模型",
                sonnetModel: "Sonnet 模型",
                haikuModel: "Haiku 模型",
                authToken: "认证令牌",
                saveConfig: "保存到 ~/.claude/settings.json",
                envVar: "环境变量",
            }
        },

        // Toast Messages
        toast: null,

        t(key) {
            return this.translations[this.lang][key] || key;
        },

        setLang(l) {
            this.lang = l;
            localStorage.setItem('app_lang', l);
        },

        showToast(message, type = 'info') {
            const id = Date.now();
            this.toast = { message, type, id };
            setTimeout(() => {
                if (this.toast && this.toast.id === id) this.toast = null;
            }, 3000);
        }
    });
});
