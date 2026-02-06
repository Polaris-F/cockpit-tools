# Copilot 页面 UI 美化 & 仪表盘集成 — 执行计划

## 背景

当前 Copilot 页面功能已通，但 UI 相比 Antigravity（AccountsPage）和 Codex（CodexAccountsPage）两个标签页差距较大。需要对齐到同一水准，并在 Dashboard 仪表盘中加入 Copilot 面板。

---

## 一、Copilot 页面增加视图切换（卡片 / 列表）

**参考**: `CodexAccountsPage.tsx` 的 `viewMode` 实现（grid / list 切换）

**文件**: `src/pages/CopilotAccountsPage.tsx`

1. 添加 state：`const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');`
2. 在 toolbar 的搜索框右边，加上视图切换按钮组，和 Codex 页面一样：
   ```tsx
   <div className="view-switcher">
     <button className={`view-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}>
       <List size={16} />
     </button>
     <button className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')}>
       <LayoutGrid size={16} />
     </button>
   </div>
   ```
3. 需要 import `LayoutGrid` 和 `List`（从 lucide-react）。
4. 渲染区域根据 `viewMode` 切换：
   - `grid` 模式：保持当前的 `codex-accounts-grid` 卡片网格布局不变。
   - `list` 模式：渲染成表格/紧凑行，每行显示：用户名 | 套餐 | 已用/总量 (百分比) | 进度条 | 操作按钮。参考 CodexAccountsPage 的 list 视图样式（`.codex-list-table`）。

**列表视图每行结构**：
```
[用户名] [套餐badge] [已用进度条 xx/300 (34%)] [刷新|切换|删除]
```

---

## 二、Copilot 页面增加排序和标签功能

**参考**: `CodexAccountsPage.tsx` 的排序下拉和标签筛选

**文件**: `src/pages/CopilotAccountsPage.tsx`

1. 添加排序功能：
   - 新增 state：`const [sortBy, setSortBy] = useState<'last_used' | 'used_asc' | 'used_desc' | 'remaining'>('last_used');`
   - 在 toolbar 中加排序下拉（用 `<ArrowDownWideNarrow>` 图标），选项：最近使用、已用升序、已用降序、剩余最多。
   - 在 `sortedAccounts` 的 useMemo 中根据 sortBy 排序。

2. 添加标签功能（如果后端已支持 tags 字段——目前 CopilotAccount 模型已有 `tags: Option<Vec<String>>`）：
   - 复用已有的 `TagEditModal` 组件。
   - 在卡片上显示标签。
   - 在 toolbar 中加标签筛选下拉，参考 CodexAccountsPage 的 tagFilter 实现。

---

## 三、Copilot 卡片 UI 细节优化

**文件**: `src/pages/CopilotAccountsPage.tsx` + `src/styles/pages/codex.css`

1. **卡片顶部**：用户名 + 套餐 badge + 当前标记，和 Codex 卡片保持一致的布局。
2. **配额区域简化**：只保留"已用"一行即可（进度条 + 百分比 + 数字），不需要分"已用"和"剩余"两行，太占空间。改为：
   - 一行进度条，左边标签"已用"，右边 `102 / 300 (34%)`
   - 进度条颜色用 `getUsedQuotaClass`（已用越多越红）
   - 进度条下方可以显示剩余数字作为补充文字：`剩余 198`
3. **卡片底部操作按钮**：刷新 | 切换 | 删除，图标样式和 Codex 卡片对齐。
4. **批量选择和删除**：参考 Codex 页面的批量选择功能，给 Copilot 也加上多选 checkbox + 批量删除按钮。后端已有 `delete_copilot_accounts` 命令支持批量删除。

---

## 四、Dashboard 仪表盘增加 Copilot 面板

**参考**: `DashboardPage.tsx` 中已有的 Antigravity 和 Codex 面板

### 4.1 数据接入

**文件**: `src/pages/DashboardPage.tsx`

1. 引入 Copilot store：
   ```tsx
   import { useCopilotAccountStore } from '../stores/useCopilotAccountStore';
   ```
2. 在组件中获取数据：
   ```tsx
   const {
     accounts: copilotAccounts,
     currentAccount: copilotCurrent,
     switchAccount: switchCopilotAccount,
     fetchAccounts: fetchCopilotAccounts,
     fetchCurrentAccount: fetchCopilotCurrent
   } = useCopilotAccountStore();
   ```
3. useEffect 中加入 `fetchCopilotAccounts()` 和 `fetchCopilotCurrent()`。

### 4.2 统计卡片

在顶部 stats-row 中加一张 Copilot 统计卡，和 Antigravity、Codex 并列：

```tsx
<div className="stat-card">
  <div className="stat-icon-bg warning">
    <CopilotIcon size={24} />  {/* 需要一个 Copilot 图标，可以用 lucide 的 Github 或自定义 SVG */}
  </div>
  <div className="stat-info">
    <span className="stat-label">Copilot</span>
    <span className="stat-value">{stats.copilot}</span>
  </div>
</div>
```

stats 计算中加入 copilot：
```tsx
const stats = useMemo(() => ({
  total: agAccounts.length + codexAccounts.length + copilotAccounts.length,
  antigravity: agAccounts.length,
  codex: codexAccounts.length,
  copilot: copilotAccounts.length,
}), [agAccounts, codexAccounts, copilotAccounts]);
```

### 4.3 Copilot 详情面板

在 `cards-split-row` 中加第三张卡片（Copilot Card），结构和 Antigravity/Codex 的面板一致：

- 左半边：当前账户的 mini 卡片（用户名 + 套餐 + 进度条 + 刷新/切换按钮）
- 右半边：推荐账号（剩余额度最多的非当前账号）
- 底部："查看所有账号"按钮，点击跳转到 copilot 页面

新增 `renderCopilotAccountContent` 函数，参考 `renderCodexAccountContent`：
```tsx
const renderCopilotAccountContent = (account: CopilotAccount | null) => {
  if (!account) return <div className="empty-slot">{t('dashboard.noAccount', '无账号')}</div>;
  const included = account.quota?.included_requests ?? 0;
  const used = account.quota?.used_requests ?? 0;
  const remaining = account.quota?.remaining_requests ?? 0;
  const usedPct = included ? Math.min(100, Math.round((used / included) * 100)) : 0;
  const planLabel = account.quota?.copilot_plan || account.plan || '-';

  return (
    <div className="account-mini-card">
      <div className="account-mini-header">
        <div className="account-info-row">
          <span className="account-email" title={account.username}>{account.username}</span>
          <span className="tier-tag">{planLabel}</span>
        </div>
      </div>
      <div className="account-mini-quotas">
        <div className="mini-quota-row-stacked">
          <div className="mini-quota-header">
            <span className="model-name">Premium</span>
            <span className="model-pct">{used} / {included} ({usedPct}%)</span>
          </div>
          <div className="mini-progress-track">
            <div className="mini-progress-bar" style={{ width: `${usedPct}%` }} />
          </div>
        </div>
      </div>
      <div className="account-mini-actions icon-only-row">
        <button className="mini-icon-btn" onClick={() => handleRefreshCopilot(account.id)}>
          <RotateCw size={14} />
        </button>
        <button className="mini-icon-btn" onClick={() => switchCopilotAccount(account.id)}>
          <Play size={14} />
        </button>
      </div>
    </div>
  );
};
```

Copilot 推荐逻辑：选 remaining_requests 最多的非当前账号。

### 4.4 布局调整

Dashboard 当前是两列布局（Antigravity + Codex），加入 Copilot 后有两种方案：

- **方案 A**：改成三列（在宽屏下三张卡片并排，窄屏自动折行）。需要把 `.cards-split-row` 的 grid 从 `1fr 1fr` 改成 `repeat(auto-fit, minmax(400px, 1fr))`。
- **方案 B**：保持两列，Copilot 卡片独占第二行居中或左对齐。

**推荐方案 A**，更整齐。修改 `src/pages/DashboardPage.css` 中 `.cards-split-row` 的 grid 样式。

### 4.5 需要的图标

Copilot 需要一个图标，在 `src/components/icons/` 下创建 `CopilotIcon.tsx`，可以用 GitHub Copilot 的 logo SVG（一个飞行员头盔样的图标），或者直接用 lucide-react 的 `<Github>` 图标作为临时替代。

---

## 五、需要引入的 import（汇总）

**CopilotAccountsPage.tsx** 新增 import：
- `LayoutGrid`, `List`, `ArrowDownWideNarrow`, `Tag` from lucide-react
- `TagEditModal` from components

**DashboardPage.tsx** 新增 import：
- `useCopilotAccountStore` from stores
- `CopilotAccount` from types/copilot
- Copilot 图标组件

---

## 六、执行顺序建议

1. 先做 **第四部分（Dashboard 集成）**，因为不影响 Copilot 页面现有代码。
2. 再做 **第三部分（卡片 UI 优化）**，把卡片打磨好。
3. 然后做 **第一部分（视图切换）**，加 grid/list 切换。
4. 最后做 **第二部分（排序和标签）**，锦上添花。

每一步做完后确认 UI 效果再进行下一步。
