import { useEffect, useMemo, useState, type ChangeEvent, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { buildDiagnostics, accountBalance, categoryTotals, currentMonthKey, monthTotals } from "./diagnostics";
import { emptyState, initialState } from "./data";
import { Icon, type IconName } from "./Icon";
import { isPlaceholderTitle, parseMoney, parseStatement, simplifyBankText } from "./importers";
import { loadState, saveState } from "./storage";
import type { Account, AccountType, AppState, Budget, Category, CategoryRule, Goal, ImportCandidate, PaymentMethod, Transaction, TransactionKind } from "./types";

type Tab = "home" | "transactions" | "plan" | "analysis";
type PlanTab = "accounts" | "budgets" | "goals";
type Modal =
  | { type: "transaction"; kind: TransactionKind; transaction?: Transaction }
  | { type: "import" }
  | { type: "settings" }
  | { type: "navLab" }
  | { type: "rules" }
  | { type: "categories" }
  | { type: "account"; account?: Account }
  | { type: "budget"; budget?: Budget }
  | { type: "goal"; goal?: Goal }
  | { type: "demoInfo" }
  | { type: "availableInfo" }
  | null;

type HistoryImportUpdate = {
  pattern: string;
  place?: string;
  categoryId: string;
  before: string;
  excludeId?: string;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const uid = (prefix: string) => prefix + "-" + (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
const localISODate = (date = new Date()) => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
};
const localTime = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
const addMonths = (date: string, amount: number) => {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(year, month - 1 + amount, 1, 12);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return localISODate(result);
};
const displayDate = (date: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(date + "T12:00:00"));
const dateGroupLabel = (date: string) => {
  const label = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long" }).format(new Date(date + "T12:00:00"));
  return label.charAt(0).toUpperCase() + label.slice(1);
};
const cleanLegacySettings = (settings?: (Partial<AppState["settings"]> & { userName?: string })) => Object.fromEntries(Object.entries(settings || {}).filter(([key]) => key !== "userName")) as Partial<AppState["settings"]>;
const monthLabel = (key: string) => {
  const [year, month] = key.split("-").map(Number);
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
};
const hideableMoney = (value: number, hidden: boolean) => hidden ? "R$ •••••" : money.format(value);
const toneColor: Record<string, string> = {
  blue: "#1677ff", yellow: "#ffc94d", orange: "#ff9f43", violet: "#8358f5", green: "#42b883",
  pink: "#ef5da8", indigo: "#4e7fea", teal: "#19a99a", coral: "#ff6f73", emerald: "#28a96b", slate: "#7d8797",
};
const categoryIconOptions: Array<{ value: IconName; label: string }> = [
  { value: "home", label: "Casa" }, { value: "basket", label: "Compras" }, { value: "food", label: "Comida" },
  { value: "car", label: "Transporte" }, { value: "heart", label: "Saúde" }, { value: "smile", label: "Lazer" },
  { value: "repeat", label: "Recorrente" }, { value: "briefcase", label: "Trabalho" }, { value: "sparkles", label: "Especial" },
  { value: "income", label: "Renda" }, { value: "wallet", label: "Carteira" }, { value: "more", label: "Outros" },
];
const navDefaults = {
  navCustomEnabled: false,
  navShowLabels: true,
  navIconSize: 27,
  navTextSize: 9,
  navHeight: 54,
  navCornerRadius: 20,
  navBorderWidth: 1,
  navSideInset: 24,
  navShadow: "soft" as const,
  navBackgroundColor: "#ffffff",
  navBorderColor: "#e3e8e4",
  navInactiveColor: "#929a95",
  navActiveBackgroundColor: "#eef5f0",
  navActiveColor: "#0b4a34",
  navAddBackgroundColor: "#0b4a34",
};

const navVariables = (settings: AppState["settings"]): CSSProperties => ({
  "--nav-height": `${settings.navCustomEnabled ? settings.navHeight : 72}px`,
  "--nav-radius": `${settings.navCustomEnabled ? settings.navCornerRadius : 24}px`,
  "--nav-border-width": `${settings.navCustomEnabled ? settings.navBorderWidth : 1}px`,
  "--nav-inset": `${settings.navCustomEnabled ? settings.navSideInset : 24}px`,
  "--nav-text-size": `${settings.navCustomEnabled ? settings.navTextSize : 8.5}px`,
  ...(settings.navCustomEnabled ? {
    "--nav-bg": settings.navBackgroundColor,
    "--nav-border-color": settings.navBorderColor,
    "--nav-inactive": settings.navInactiveColor,
    "--nav-active-bg": settings.navActiveBackgroundColor,
    "--nav-active": settings.navActiveColor,
    "--nav-add": settings.navAddBackgroundColor,
  } : {}),
} as CSSProperties);
const mergeLearnedRules = (current: CategoryRule[], additions: CategoryRule[]) => additions.reduce((rules, addition) => {
  const key = simplifyBankText(addition.keyword) || addition.keyword.toLowerCase().trim();
  return [addition, ...rules.filter((rule) => (simplifyBankText(rule.keyword) || rule.keyword.toLowerCase().trim()) !== key)];
}, current);
const isImportedTransaction = (transaction: Transaction) => transaction.source === "csv" || transaction.source === "ofx";
const importMoment = (transaction: Pick<Transaction, "date" | "time">) => transaction.date + "T" + (transaction.time || "00:00");
const hasSameImportPattern = (transaction: Transaction, pattern: string) => !!pattern
  && isImportedTransaction(transaction)
  && !!transaction.originalDescription
  && simplifyBankText(transaction.originalDescription) === pattern;

function PigMark() {
  return <svg viewBox="0 0 48 38" aria-hidden="true"><path d="M7 15c0-7 7-12 17-12 5 0 9 1 12 4l6-2-2 7c2 2 3 5 3 8 0 7-5 12-13 14v4h-6v-3h-8v3h-6v-5c-5-3-7-9-7-15V9l5 4"/><circle cx="33" cy="15" r="1.4"/><path d="M20 8c3-2 7-2 10 0M43 22h3"/></svg>;
}

function AppHeader({ state, onSettings, onToggleValues, onDemoInfo }: { state: AppState; onSettings: () => void; onToggleValues: () => void; onDemoInfo: () => void }) {
  return <header className="app-header">
    <div className="brand"><span className="brand-mark"><PigMark /></span><strong>Meu Dinheiro</strong></div>
    <div className="header-actions">
      <button className="icon-button" onClick={onToggleValues} aria-label={state.settings.hiddenValues ? "Mostrar valores" : "Ocultar valores"}><Icon name={state.settings.hiddenValues ? "eyeOff" : "eye"} /></button>
      <button className="icon-button" onClick={onSettings} aria-label="Ajustes"><Icon name="settings" /></button>
    </div>
    {state.demoMode && <button className="header-demo-info" onClick={onDemoInfo} aria-label="Informações sobre os dados de exemplo"><Icon name="info" size={17} /></button>}
  </header>;
}

function MonthPicker({ value, onChange, transactionDates = [] }: { value: string; onChange: (value: string) => void; transactionDates?: string[] }) {
  const recent = Array.from({ length: 12 }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - index);
    return localISODate(date).slice(0, 7);
  });
  const options = [...new Set([value, ...recent, ...transactionDates.map((date) => date.slice(0, 7)).filter((month) => /^\d{4}-\d{2}$/.test(month))])]
    .sort((a, b) => b.localeCompare(a));
  return <label className="month-picker"><Icon name="calendar" size={18} /><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((item) => <option key={item} value={item}>{monthLabel(item)}</option>)}</select><Icon name="down" size={16} /></label>;
}

function TransactionRow({ transaction, state, onClick }: { transaction: Transaction; state: AppState; onClick: () => void }) {
  const category = state.categories.find((item) => item.id === transaction.categoryId);
  const transfer = transaction.kind === "transfer";
  return <button className="transaction-row" onClick={onClick}>
    <span className={"category-icon tone-" + (category?.tone || "slate")}><Icon name={(transfer ? "transfer" : category?.icon || "wallet") as IconName} size={20} /></span>
    <span className="transaction-copy"><span className="transaction-title-line"><strong>{transaction.description}</strong>{transaction.needsReview && <i className="review-tag">Revisar detalhes</i>}</span><small>{transaction.time}</small></span>
    <span className={"transaction-value " + transaction.kind}>{transaction.kind === "expense" ? "−" : transaction.kind === "income" ? "+" : ""}{hideableMoney(transaction.amount, state.settings.hiddenValues)}</span>
  </button>;
}

function TransactionGroups({ transactions, state, onClick }: { transactions: Transaction[]; state: AppState; onClick: (transaction: Transaction) => void }) {
  const groups = transactions.reduce<Array<{ date: string; items: Transaction[] }>>((result, transaction) => {
    const current = result[result.length - 1];
    if (current?.date === transaction.date) current.items.push(transaction);
    else result.push({ date: transaction.date, items: [transaction] });
    return result;
  }, []);
  return <>{groups.map((group) => <div className="transaction-date-group" key={group.date}>
    <div className="transaction-date-divider"><span>{dateGroupLabel(group.date)}</span></div>
    {group.items.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} state={state} onClick={() => onClick(transaction)} />)}
  </div>)}</>;
}

function HomeView({ state, month, setMonth, onModal, onTab, onReviewPending }: { state: AppState; month: string; setMonth: (month: string) => void; onModal: (modal: Modal) => void; onTab: (tab: Tab) => void; onReviewPending: () => void }) {
  const totals = monthTotals(state.transactions, month);
  const result = totals.income - totals.expense;
  const today = localISODate();
  const transactionsUntilToday = state.transactions.filter((transaction) => transaction.date <= today);
  const availableToUse = state.accounts
    .filter((account) => account.type === "checking" || account.type === "cash")
    .reduce((sum, account) => sum + accountBalance(account, transactionsUntilToday), 0);
  const recent = state.transactions.filter((item) => item.date.startsWith(month)).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, 5);
  const diagnostics = buildDiagnostics(state, month);
  const homeDiagnostics = diagnostics.slice(0, Math.max(1, Math.min(5, state.settings.diagnosticMaxCards)));
  const spent = totals.expense;
  const budget = state.budgets.reduce((sum, item) => sum + item.limit, 0);
  const progress = budget ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  const pendingCount = state.transactions.filter((transaction) => transaction.needsReview).length;

  return <main className="page home-page">
    <div className="home-toolbar">
      <MonthPicker value={month} onChange={setMonth} transactionDates={state.transactions.map((item) => item.date)} />
      <button className="home-import-button" onClick={() => onModal({ type: "import" })}><Icon name="import" size={19} /><span>Importar</span></button>
    </div>

    <section className="monthly-overview-card">
      <div className="money-flow">
        <button className="flow-action income" onClick={() => onModal({ type: "transaction", kind: "income" })}>
          <span className="flow-arrow"><Icon name="arrowRight" size={30} /></span><small>Entradas</small><strong>{hideableMoney(totals.income, state.settings.hiddenValues)}</strong><em>Registrar</em>
        </button>
        <div className="flow-balance">
          <span className="available-label"><small>Disponível agora</small><button onClick={() => onModal({ type: "availableInfo" })} aria-label="Entender o valor disponível"><Icon name="info" size={15} /></button></span>
          <strong className={availableToUse < 0 ? "negative" : ""}>{hideableMoney(availableToUse, state.settings.hiddenValues)}</strong>
          <small className={"flow-result " + (result < 0 ? "expense" : "income")}>Mês: {result > 0 ? "+" : ""}{hideableMoney(result, state.settings.hiddenValues)}</small>
        </div>
        <button className="flow-action expense" onClick={() => onModal({ type: "transaction", kind: "expense" })}>
          <span className="flow-arrow"><Icon name="arrowRight" size={30} /></span><small>Saídas</small><strong>{hideableMoney(totals.expense, state.settings.hiddenValues)}</strong><em>Registrar</em>
        </button>
      </div>
    </section>

    {pendingCount > 0 && <button className="pending-review-card" onClick={onReviewPending}>
      <span className="pending-review-icon"><Icon name="edit" /></span><span><strong>{pendingCount} {pendingCount === 1 ? "movimentação precisa" : "movimentações precisam"} de detalhes</strong><small>Complete títulos e categorias para melhorar seus diagnósticos.</small></span><span>Revisar <Icon name="chevron" size={15} /></span>
    </button>}

    <button className="transfer-shortcut" onClick={() => onModal({ type: "transaction", kind: "transfer" })}><Icon name="transfer" size={19} /><span><strong>Transferir entre contas</strong><small>Movimente dinheiro sem contar como entrada ou saída</small></span><Icon name="chevron" size={17} /></button>

    {state.settings.diagnosticsEnabled && homeDiagnostics.length > 0 && <section className="home-diagnostics">
      <div className="home-diagnostics-heading"><h2>Recados desse mês</h2><button onClick={() => onTab("analysis")}>Ver todos</button></div>
      <div className="diagnostic-card-stack">{homeDiagnostics.map((diagnostic) => <button className={"diagnostic-card " + diagnostic.tone} key={diagnostic.id} onClick={() => onTab("analysis")}>
        <span className="diagnostic-topline"><span className="diagnostic-icon"><Icon name={diagnostic.icon as IconName} /></span><span className="diagnostic-title"><small>{diagnostic.tone === "warning" ? "AVISO" : diagnostic.tone === "positive" ? "BOA NOTÍCIA" : "DICA"} · SEM IA</small><strong>{diagnostic.title}</strong></span><Icon name="chevron" size={18} /></span><p>{diagnostic.message}</p>
      </button>)}</div>
    </section>}

    <section className="list-card recent-list">
      <div className="section-heading"><h2>Movimentações recentes</h2><button onClick={() => onTab("transactions")}>Ver todas</button></div>
      {recent.length ? <TransactionGroups transactions={recent} state={state} onClick={(transaction) => onModal({ type: "transaction", kind: transaction.kind, transaction })} /> : <EmptyState icon="receipt" title="Nenhum lançamento" text="Registre um gasto, uma entrada ou importe seu extrato." />}
    </section>

    <section className="budget-card">
      <div className="section-heading"><div><span className="eyebrow">LIMITE DE GASTOS</span><h2>{budget ? progress + "% utilizado" : "Defina seu planejamento"}</h2></div><button onClick={() => onTab("plan")}>Ajustar</button></div>
      <div className="progress-track"><span style={{ width: progress + "%" }} /></div>
      <div className="budget-numbers"><span><small>Utilizado</small><strong>{hideableMoney(spent, state.settings.hiddenValues)}</strong></span><span><small>Disponível</small><strong>{hideableMoney(Math.max(0, budget - spent), state.settings.hiddenValues)}</strong></span></div>
    </section>
  </main>;
}

function TransactionsView({ state, month, setMonth, onEdit, onCategories, reviewPending = false }: { state: AppState; month: string; setMonth: (month: string) => void; onEdit: (transaction: Transaction) => void; onCategories: () => void; reviewPending?: boolean }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "expense" | "income" | "pending">(reviewPending ? "pending" : "all");
  useEffect(() => { if (reviewPending) setFilter("pending"); }, [reviewPending]);
  const items = useMemo(() => state.transactions
    .filter((item) => item.date.startsWith(month))
    .filter((item) => filter === "all" || filter === "pending" ? filter !== "pending" || item.needsReview : item.kind === filter)
    .filter((item) => (item.description + " " + (item.place || "") + " " + (item.originalDescription || "") + " " + item.notes).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)), [state.transactions, month, filter, search]);
  const totals = monthTotals(state.transactions, month);
  return <main className="page">
    <div className="page-title"><div><span className="eyebrow">EXTRATO</span><h1>Todos os lançamentos</h1></div><div className="page-title-actions"><MonthPicker value={month} onChange={setMonth} transactionDates={state.transactions.map((item) => item.date)} /><button className="category-access-button" onClick={onCategories}><Icon name="filter" size={17} /> Categorias</button></div></div>
    <section className="mini-summary"><span><small>Entradas</small><strong className="income">{hideableMoney(totals.income, state.settings.hiddenValues)}</strong></span><span><small>Saídas</small><strong className="expense">{hideableMoney(totals.expense, state.settings.hiddenValues)}</strong></span><span><small>Resultado</small><strong>{hideableMoney(totals.income - totals.expense, state.settings.hiddenValues)}</strong></span></section>
    <label className="search-field"><Icon name="search" size={20} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou observação" /></label>
    <div className="filter-chips"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Todos</button><button className={filter === "expense" ? "active" : ""} onClick={() => setFilter("expense")}>Saídas</button><button className={filter === "income" ? "active" : ""} onClick={() => setFilter("income")}>Entradas</button><button className={filter === "pending" ? "active pending-filter" : "pending-filter"} onClick={() => setFilter("pending")}><Icon name="edit" size={15} /> Pendentes ({state.transactions.filter((item) => item.needsReview).length})</button></div>
    <section className="list-card transaction-list">{items.length ? <TransactionGroups transactions={items} state={state} onClick={onEdit} /> : <EmptyState icon="search" title="Nada encontrado" text="Altere os filtros ou registre uma movimentação." />}</section>
  </main>;
}

function PlanView({ state, month, onModal }: { state: AppState; month: string; onModal: (modal: Modal) => void }) {
  const [section, setSection] = useState<PlanTab>("accounts");
  const monthCategories = categoryTotals(state, month);
  return <main className="page">
    <div className="page-title"><div><span className="eyebrow">PLANEJAMENTO</span><h1>Organize o próximo passo</h1></div></div>
    <div className="segmented compact"><button className={section === "accounts" ? "active" : ""} onClick={() => setSection("accounts")}>Contas</button><button className={section === "budgets" ? "active" : ""} onClick={() => setSection("budgets")}>Limites</button><button className={section === "goals" ? "active" : ""} onClick={() => setSection("goals")}>Metas</button></div>
    {section === "budgets" && <button className="category-access-button standalone" onClick={() => onModal({ type: "categories" })}><Icon name="filter" size={17} /> Ver e configurar categorias</button>}
    {section === "accounts" && <section className="stack-list">
      <button className="add-line" onClick={() => onModal({ type: "account" })}><Icon name="plus" size={19} /> Adicionar conta ou cartão</button>
      {state.accounts.map((account) => {
        const balance = accountBalance(account, state.transactions);
        const credit = account.type === "credit";
        const percentage = credit && account.creditLimit ? Math.min(100, (balance / account.creditLimit) * 100) : 0;
        return <button className="account-card" key={account.id} onClick={() => onModal({ type: "account", account })}>
          <span className={"account-icon tone-" + account.color}><Icon name={credit ? "card" : account.type === "cash" ? "wallet" : "bank"} /></span>
          <span className="grow"><small>{credit ? "CARTÃO DE CRÉDITO" : account.type === "investment" ? "INVESTIMENTO" : "CONTA"}</small><strong>{account.name}</strong>{credit && <span className="micro-progress"><i style={{ width: percentage + "%" }} /></span>}</span>
          <span className="align-right"><small>{credit ? "Fatura atual" : "Saldo"}</small><strong className={credit ? "expense" : ""}>{hideableMoney(balance, state.settings.hiddenValues)}</strong></span>
        </button>;
      })}
    </section>}
    {section === "budgets" && <section className="stack-list">
      <button className="add-line" onClick={() => onModal({ type: "budget" })}><Icon name="plus" size={19} /> Criar limite por categoria</button>
      {state.budgets.map((budget) => {
        const category = state.categories.find((item) => item.id === budget.categoryId);
        const spent = monthCategories.find((item) => item.categoryId === budget.categoryId)?.amount || 0;
        const progress = budget.limit ? Math.min(100, (spent / budget.limit) * 100) : 0;
        return <button className="planning-card" key={budget.id} onClick={() => onModal({ type: "budget", budget })}>
          <div className="planning-title"><span className={"category-icon tone-" + (category?.tone || "slate")}><Icon name={(category?.icon || "wallet") as IconName} size={19} /></span><span className="grow"><strong>{category?.name}</strong><small>{hideableMoney(spent, state.settings.hiddenValues)} de {hideableMoney(budget.limit, state.settings.hiddenValues)}</small></span><b>{Math.round(progress)}%</b></div>
          <div className={"progress-track " + (progress >= 100 ? "over" : "")}><span style={{ width: progress + "%" }} /></div>
        </button>;
      })}
      {!state.budgets.length && <EmptyState icon="target" title="Sem limites definidos" text="Crie valores mensais por categoria para receber avisos." />}
    </section>}
    {section === "goals" && <section className="stack-list">
      <button className="add-line" onClick={() => onModal({ type: "goal" })}><Icon name="plus" size={19} /> Adicionar meta</button>
      {state.goals.map((goal) => {
        const progress = goal.target ? Math.min(100, (goal.current / goal.target) * 100) : 0;
        return <button className="planning-card goal-card" key={goal.id} onClick={() => onModal({ type: "goal", goal })}>
          <div className="planning-title"><span className="account-icon tone-green"><Icon name="target" size={20} /></span><span className="grow"><strong>{goal.name}</strong><small>Faltam {hideableMoney(Math.max(0, goal.target - goal.current), state.settings.hiddenValues)}</small></span><b>{Math.round(progress)}%</b></div>
          <div className="progress-track"><span style={{ width: progress + "%" }} /></div><div className="goal-values"><span>{hideableMoney(goal.current, state.settings.hiddenValues)}</span><span>{hideableMoney(goal.target, state.settings.hiddenValues)}</span></div>
        </button>;
      })}
    </section>}
  </main>;
}

function ComparisonChart({ state, month, kind, count, onCount }: { state: AppState; month: string; kind: "income" | "expense"; count: number; onCount: (count: number) => void }) {
  const [selectedIndex, setSelectedIndex] = useState(Math.max(0, count - 1));
  const [year, monthNumber] = month.split("-").map(Number);
  const series = Array.from({ length: count }, (_, index) => {
    const date = new Date(year, monthNumber - 1 - (count - 1 - index), 1, 12);
    const key = localISODate(date).slice(0, 7);
    const totals = monthTotals(state.transactions, key);
    return { key, label: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", ""), value: kind === "income" ? totals.income : totals.expense };
  });
  useEffect(() => setSelectedIndex(Math.max(0, count - 1)), [count, month]);
  const maximum = Math.max(...series.map((item) => item.value), 1);
  const selected = series[Math.min(selectedIndex, series.length - 1)];
  return <section className={"chart-card multi-month-card " + kind}>
    <div className="comparison-heading"><div><span className="eyebrow">{kind === "income" ? "COMPARAÇÃO DE ENTRADAS" : "COMPARAÇÃO DE SAÍDAS"}</span><h2>{selected ? monthLabel(selected.key) : monthLabel(month)}</h2></div><select value={count} onChange={(event) => onCount(Number(event.target.value))} aria-label={"Período da comparação de " + (kind === "income" ? "entradas" : "saídas")}>{[2, 3, 6, 12].map((value) => <option value={value} key={value}>Últimos {value} meses</option>)}</select></div>
    <div className="comparison-selected-value"><small>{selected?.label}</small><strong className={kind}>{hideableMoney(selected?.value || 0, state.settings.hiddenValues)}</strong></div>
    <div className="multi-month-bars" style={{ "--bar-count": count } as CSSProperties}>{series.map((item, index) => <button type="button" key={item.key} className={selectedIndex === index ? "active" : ""} onClick={() => setSelectedIndex(index)} aria-label={monthLabel(item.key) + ": " + money.format(item.value)}><span><i style={{ height: Math.max(item.value ? 8 : 3, item.value / maximum * 100) + "%" }} /></span><small>{item.label}</small></button>)}</div>
    <p>Toque em uma barra para ver o valor daquele mês.</p>
  </section>;
}

function AnalysisView({ state, month, setMonth, onCategories, onComparisonMonths }: { state: AppState; month: string; setMonth: (month: string) => void; onCategories: () => void; onComparisonMonths: (kind: "income" | "expense", count: number) => void }) {
  const items = categoryTotals(state, month);
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  let cursor = 0;
  const segments = items.length ? items.map((item) => {
    const start = cursor;
    cursor += total ? item.amount / total * 100 : 0;
    return `${toneColor[item.category?.tone || "slate"]} ${start}% ${cursor}%`;
  }).join(", ") : "#e8ece8 0 100%";
  const diagnostics = buildDiagnostics(state, month);
  return <main className="page">
    <div className="page-title analysis-title"><h1>Gráficos</h1></div>
    <section className="chart-card category-chart">
      <div className="analysis-month-picker"><MonthPicker value={month} onChange={setMonth} transactionDates={state.transactions.map((item) => item.date)} /><button className="category-access-button icon-only" onClick={onCategories} aria-label="Ver e configurar categorias"><Icon name="filter" size={19} /></button></div>
      <div className="donut-wrap"><div className="donut" style={{ "--segments": `conic-gradient(${segments})` } as CSSProperties}><span><small>Total</small><strong>{state.settings.hiddenValues ? "••••" : money.format(total)}</strong></span></div></div>
      <div className="category-breakdown">{items.map((item) => {
        const share = total ? Math.round(item.amount / total * 100) : 0;
        return <div className="category-line" key={item.categoryId}><div><strong>{item.category?.name || "Outros"}</strong><span>{share}%</span><b>{hideableMoney(item.amount, state.settings.hiddenValues)}</b></div><div className="thin-track"><i style={{ width: share + "%", background: toneColor[item.category?.tone || "slate"] }} /></div></div>;
      })}{!items.length && <EmptyState icon="chart" title="Ainda sem gráfico" text="As despesas deste mês aparecerão aqui por categoria." />}</div>
    </section>
    <ComparisonChart state={state} month={month} kind="income" count={state.settings.incomeComparisonMonths} onCount={(count) => onComparisonMonths("income", count)} />
    <ComparisonChart state={state} month={month} kind="expense" count={state.settings.expenseComparisonMonths} onCount={(count) => onComparisonMonths("expense", count)} />
    {state.settings.diagnosticsEnabled && <section className="diagnostics-section"><div className="section-heading"><div><span className="eyebrow">LEITURA DO SEU MÊS</span><h2>Dicas e avisos personalizados</h2></div><span className="no-ai-badge">Sem IA</span></div>{diagnostics.map((diagnostic) => <div className={"diagnostic-list-item " + diagnostic.tone} key={diagnostic.id}><span><Icon name={diagnostic.icon as IconName} /></span><div><small>{diagnostic.tone === "warning" ? "AVISO" : diagnostic.tone === "positive" ? "BOA NOTÍCIA" : "DICA"}</small><strong>{diagnostic.title}</strong><p>{diagnostic.message}</p></div></div>)}</section>}
  </main>;
}

function BottomNav({ active, settings, onChange, onAdd }: { active: Tab; settings: AppState["settings"]; onChange: (tab: Tab) => void; onAdd: () => void }) {
  const iconSize = settings.navCustomEnabled ? settings.navIconSize : 21;
  const item = (tab: Tab, icon: IconName, label: string) => <button className={`nav-tab ${active === tab ? "active" : ""}`} onClick={() => onChange(tab)}><Icon name={icon} size={iconSize} /><span>{label}</span></button>;
  return <nav className={`bottom-nav ${settings.navCustomEnabled ? "custom-nav" : ""} ${settings.navShowLabels || !settings.navCustomEnabled ? "" : "labels-hidden"} shadow-${settings.navCustomEnabled ? settings.navShadow : "soft"}`} style={navVariables(settings)}>{item("home", "homeTab", "Início")}{item("transactions", "receiptTab", "Extrato")}<button className="add-button" onClick={onAdd} aria-label="Adicionar lançamento"><Icon name="plusTab" size={settings.navCustomEnabled ? Math.max(20, settings.navIconSize - 2) : 22} /></button>{item("plan", "planTab", "Planejar")}{item("analysis", "analysisPieTab", "Análise")}</nav>;
}

function Sheet({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className={"sheet " + (wide ? "wide" : "")} role="dialog" aria-modal="true"><div className="sheet-handle" /><header><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose}><Icon name="close" /></button></header>{children}</section></div>;
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="form-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function TransactionSheet({ state, kind, existing, onClose, onSave, onDelete, onState }: { state: AppState; kind: TransactionKind; existing?: Transaction; onClose: () => void; onSave: (transactions: Transaction[], replacedId?: string, learnedRules?: CategoryRule[], historyUpdate?: HistoryImportUpdate) => void; onDelete: (id: string) => void; onState: (state: AppState) => void }) {
  const [draftKind, setDraftKind] = useState<TransactionKind>(existing?.kind || kind);
  const [description, setDescription] = useState(existing?.description || "");
  const [place, setPlace] = useState(existing?.place || "");
  const [amount, setAmount] = useState(existing ? String(existing.amount).replace(".", ",") : "");
  const [date, setDate] = useState(existing?.date || localISODate());
  const [time, setTime] = useState(existing?.time || localTime());
  const [categoryId, setCategoryId] = useState(existing?.categoryId || (draftKind === "income" ? "salary" : "other"));
  const [accountId, setAccountId] = useState(existing?.accountId || state.accounts[0]?.id || "");
  const [destinationAccountId, setDestinationAccountId] = useState(existing?.destinationAccountId || state.accounts.find((account) => account.id !== accountId)?.id || "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(existing?.paymentMethod || "other");
  const [notes, setNotes] = useState(existing?.notes || "");
  const [installments, setInstallments] = useState(existing?.installment?.total || 1);
  const [recurring, setRecurring] = useState(false);
  const [rememberRule, setRememberRule] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(!!existing);
  const value = Math.abs(parseMoney(amount));
  const imported = !!existing && isImportedTransaction(existing) && !!existing.originalDescription;
  const importPattern = imported ? simplifyBankText(existing?.originalDescription || "") : "";
  const historyMatchCount = imported && existing && importPattern
    ? state.transactions.filter((transaction) => transaction.id !== existing.id && hasSameImportPattern(transaction, importPattern) && importMoment(transaction) < importMoment(existing)).length
    : 0;
  const titleLabel = draftKind === "income" ? "O que você recebeu neste lançamento?" : draftKind === "transfer" ? "Motivo da transferência" : "O que você comprou ou pagou neste lançamento?";
  const titlePlaceholder = draftKind === "income" ? "Ex.: Atendimento de unhas" : draftKind === "transfer" ? "Ex.: Guardar na reserva" : "Ex.: Produtos de limpeza";
  const placeLabel = draftKind === "income" ? "Quem enviou ou de onde veio?" : "Local da compra ou pagamento";
  const placePlaceholder = draftKind === "income" ? "Ex.: Cliente Ana ou Hotmart" : "Ex.: Mercado Livre";

  const changeKind = (next: TransactionKind) => { setDraftKind(next); if (next === "income") setCategoryId("salary"); if (next === "transfer") setCategoryId("other"); };
  const save = (confirmAsIs = false, updateHistory = false) => {
    if (!description.trim() || !value || !accountId || (draftKind === "transfer" && (!destinationAccountId || destinationAccountId === accountId))) return;
    const needsReview = imported ? !confirmAsIs && (isPlaceholderTitle(description) || categoryId === "other") : false;
    const base: Transaction = { id: existing?.id || uid("tx"), kind: draftKind, description: description.trim(), place: draftKind === "transfer" ? undefined : place.trim() || undefined, originalDescription: existing?.originalDescription, needsReview, amount: value, date, time, categoryId, accountId, destinationAccountId: draftKind === "transfer" ? destinationAccountId : undefined, paymentMethod: draftKind === "transfer" ? "transfer" : paymentMethod, notes: notes.trim(), source: existing?.source || "manual", importFingerprint: existing?.importFingerprint };
    const learnedRule = rememberRule && imported && existing?.originalDescription
      ? { id: uid("rule"), keyword: existing.originalDescription, categoryId, place: place.trim() || undefined, matchMode: "simplified" as const }
      : undefined;
    const historyUpdate = updateHistory && learnedRule && importPattern
      ? { pattern: importPattern, place: base.place, categoryId, before: importMoment(base), excludeId: existing?.id }
      : undefined;
    if (!existing && draftKind === "expense" && installments > 1) {
      const group = uid("installment");
      const each = Math.round(value / installments * 100) / 100;
      const list = Array.from({ length: installments }, (_, index): Transaction => ({ ...base, id: uid("tx"), amount: index === installments - 1 ? Math.round((value - each * (installments - 1)) * 100) / 100 : each, date: addMonths(date, index), description: description.trim() + " (" + (index + 1) + "/" + installments + ")", source: "installment", recurrenceGroup: group, installment: { current: index + 1, total: installments } }));
      onSave(list, undefined, learnedRule ? [learnedRule] : []);
    } else if (!existing && recurring && draftKind !== "transfer") {
      const group = uid("recurring");
      onSave(Array.from({ length: 6 }, (_, index): Transaction => ({ ...base, id: uid("tx"), date: addMonths(date, index), recurrenceGroup: group })), undefined, learnedRule ? [learnedRule] : []);
    } else onSave([base], existing?.id, learnedRule ? [learnedRule] : [], historyUpdate);
  };
  const submit = (event: FormEvent) => { event.preventDefault(); save(false); };
  return <Sheet title={existing ? "Editar" : "Adicionar"} onClose={onClose}>
    <form className={"form transaction-form kind-" + draftKind} onSubmit={submit}>
      <div className="transaction-kind-picker" role="tablist" aria-label="Tipo de lançamento">
        <button type="button" className={draftKind === "expense" ? "active expense" : "expense"} onClick={() => changeKind("expense")}><strong>Saída</strong></button>
        <button type="button" className={draftKind === "income" ? "active income" : "income"} onClick={() => changeKind("income")}><strong>Entrada</strong></button>
        <button type="button" className={draftKind === "transfer" ? "active transfer" : "transfer"} onClick={() => changeKind("transfer")}><strong>Transferir</strong></button>
      </div>

      <div className="transaction-amount-panel">
        <span>{draftKind === "expense" ? "VALOR DA SAÍDA" : draftKind === "income" ? "VALOR DA ENTRADA" : "VALOR DA TRANSFERÊNCIA"}</span>
        <div className="money-input"><span>R$</span><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" /></div>
        {!existing && draftKind === "expense" && installments > 1 && <small>{installments} parcelas de aproximadamente {money.format(value / installments || 0)}</small>}
      </div>

      {existing?.needsReview && <div className="review-banner"><Icon name="edit" size={18} /><span><strong>Falta identificar este lançamento</strong><small>Descreva este lançamento. Se quiser, o app pode aprender apenas o local e a categoria.</small></span></div>}

      <Field label={titleLabel} hint={imported ? "Só este lançamento — esta descrição nunca será repetida nas próximas importações." : undefined}><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder={titlePlaceholder} /></Field>

      {draftKind !== "transfer" && <section className="transaction-classification-card">
        <div className="classification-heading"><span><Icon name="rule" size={17} /></span><div><strong>Identificação do local</strong><small>Use um nome que você reconheça no seu extrato.</small></div></div>
        <Field label={placeLabel} hint={imported ? "Pode ser usado para reconhecer o mesmo local em futuras importações, somente se você ativar a opção abaixo." : undefined}><input value={place} onChange={(event) => setPlace(event.target.value)} placeholder={placePlaceholder} /></Field>
        <div className="category-field"><Field label="Categoria" hint={imported ? "Só será aplicada automaticamente no futuro se você escolher aprender." : undefined}><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{state.categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></Field><button className="inline-config-button" type="button" onClick={() => setShowCategories(true)}><Icon name="filter" size={16} /> Ver e configurar categorias</button></div>
      </section>}

      {imported && draftKind !== "transfer" && <section className="import-learning-card">
        <div className="learning-heading"><span><Icon name="repeat" size={18} /></span><div><strong>Ensinar para próximas importações</strong><small>Você decide exatamente o que a regra pode reaproveitar.</small></div></div>
        <label className="toggle-row compact-toggle learning-switch"><span><strong>Usar local e categoria nas próximas importações</strong><small>Nada é reaproveitado sem ativar esta opção.</small></span><input type="checkbox" checked={rememberRule} onChange={(event) => setRememberRule(event.target.checked)} /></label>
        {rememberRule && <div className="learning-impact">
          <p className="learning-repeat"><Icon name="check" size={16} /><span><strong>Vai se repetir:</strong> {place.trim() || "a categoria escolhida"} e a categoria <b>{state.categories.find((category) => category.id === categoryId)?.name || "selecionada"}</b>.</span></p>
          <p className="learning-never-repeat"><Icon name="info" size={16} /><span><strong>Nunca será repetido:</strong> o que você comprou ou recebeu, valor, data, horário e observação.</span></p>
          <details className="bank-description compact-bank-description"><summary>Texto do extrato usado para reconhecer este local</summary><p>{existing?.originalDescription}</p><small>Números e códigos podem mudar; o app reconhece a parte em comum do texto.</small></details>
          {historyMatchCount > 0 && <button className="apply-history-button" type="button" onClick={() => save(false, true)} disabled={!description.trim() || !value}><Icon name="repeat" size={18} /><span><strong>Salvar e atualizar {historyMatchCount} {historyMatchCount === 1 ? "transação anterior" : "transações anteriores"}</strong><small>Atualiza somente local e categoria das transações parecidas.</small></span></button>}
        </div>}
      </section>}

      <button className="automatic-date" type="button" onClick={() => setDetailsOpen(true)}><Icon name="clock" size={17} /><span><strong>{displayDate(date)} às {time}</strong><small>Data e horário preenchidos automaticamente</small></span>{!detailsOpen && <Icon name="edit" size={15} />}</button>

      <button className={"optional-details-toggle " + (detailsOpen ? "open" : "")} type="button" onClick={() => setDetailsOpen((open) => !open)}><Icon name="more" size={18} /><span>{detailsOpen ? "Ocultar outros detalhes" : "Adicionar outros detalhes"}</span><Icon name="chevron" size={16} /></button>

      {detailsOpen && <section className="transaction-optional-fields">
          <div className="form-grid"><Field label={draftKind === "transfer" ? "Conta de origem" : "Conta ou cartão (opcional)"}><select value={accountId} onChange={(event) => { setAccountId(event.target.value); if (destinationAccountId === event.target.value) setDestinationAccountId(state.accounts.find((account) => account.id !== event.target.value)?.id || ""); }}>{state.accounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></Field>
          {draftKind === "transfer" ? <Field label="Conta de destino"><select value={destinationAccountId} onChange={(event) => setDestinationAccountId(event.target.value)}>{state.accounts.filter((account) => account.id !== accountId && account.type !== "credit").map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></Field> : <Field label="Pagamento (opcional)"><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}><option value="other">Não informar</option><option value="pix">Pix</option><option value="debit">Débito</option><option value="credit">Crédito</option><option value="cash">Dinheiro</option><option value="transfer">Transferência</option></select></Field>}</div>
          <div className="form-grid"><Field label="Data"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field><Field label="Horário"><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></Field></div>
          {!existing && draftKind === "expense" && <Field label="Parcelamento"><select value={installments} onChange={(event) => { setInstallments(Number(event.target.value)); if (Number(event.target.value) > 1) setRecurring(false); }}>{Array.from({ length: 24 }, (_, index) => <option key={index + 1} value={index + 1}>{index ? (index + 1) + " parcelas" : "À vista"}</option>)}</select></Field>}
          {!existing && draftKind !== "transfer" && installments === 1 && <label className="toggle-row"><span><strong>Repetir pelos próximos 6 meses</strong><small>Útil para salário, aluguel e assinaturas.</small></span><input type="checkbox" checked={recurring} onChange={(event) => setRecurring(event.target.checked)} /></label>}
          <Field label="Observação (opcional)" hint={imported ? "Fica somente neste lançamento." : undefined}><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Detalhes que podem ser úteis depois" rows={3} /></Field>
          {existing?.originalDescription && !imported && <details className="bank-description"><summary>Ver descrição original do banco</summary><p>{existing.originalDescription}</p></details>}
      </section>}

      <button className="primary-button transaction-save-button" type="submit" disabled={!description.trim() || !value}><Icon name="check" size={19} /> {imported ? "Salvar somente este lançamento" : "Salvar lançamento"}</button>
      {existing?.needsReview && <button className="secondary-review-button" type="button" onClick={() => save(true)}><Icon name="check" size={18} /> Confirmar assim mesmo</button>}
      {existing && <button className="danger-button" type="button" onClick={() => onDelete(existing.id)}><Icon name="trash" size={18} /> Excluir lançamento</button>}
    </form>
    {showCategories && <CategoryManagerSheet state={state} onClose={() => setShowCategories(false)} onState={onState} />}
  </Sheet>;
}

function ImportSheet({ state, onClose, onImport, onState }: { state: AppState; onClose: () => void; onImport: (items: ImportCandidate[]) => void; onState: (state: AppState) => void }) {
  const [accountId, setAccountId] = useState(state.accounts.find((account) => account.type !== "credit")?.id || state.accounts[0]?.id || "");
  const [filename, setFilename] = useState("");
  const [items, setItems] = useState<ImportCandidate[]>([]);
  const [error, setError] = useState("");
  const [showCategories, setShowCategories] = useState(false);
  const updateItem = (tempId: string, patch: Partial<ImportCandidate>) => setItems((current) => current.map((candidate) => candidate.tempId === tempId ? { ...candidate, ...patch } : candidate));
  const updateDetails = (item: ImportCandidate, patch: Partial<ImportCandidate>) => {
    const next = { ...item, ...patch };
    updateItem(item.tempId, { ...patch, needsReview: isPlaceholderTitle(next.description) || next.categoryId === "other" });
  };
  const applyToSimilar = (item: ImportCandidate) => setItems((current) => current.map((candidate) => candidate.pattern && candidate.pattern === item.pattern
    ? { ...candidate, place: item.place, categoryId: item.categoryId, needsReview: isPlaceholderTitle(candidate.description) || item.categoryId === "other" }
    : candidate));
  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      const parsed = parseStatement(file.name, content, state, accountId);
      setItems(parsed);
      setFilename(file.name);
      setError(parsed.length ? "" : "Não encontrei lançamentos reconhecíveis neste arquivo.");
    } catch { setError("Não foi possível ler o arquivo."); }
  };
  const selected = items.filter((item) => item.selected && !item.duplicate);
  const certainCount = selected.filter((item) => item.confidence === "certain" && !item.needsReview).length;
  const suggestedCount = selected.filter((item) => item.confidence === "suggested" || (!item.needsReview && item.confidence !== "certain")).length;
  const pendingCount = selected.filter((item) => item.needsReview).length;
  const downloadExample = () => downloadBlob("data;descricao;valor\n15/08/2026;Supermercado;-125,90\n16/08/2026;Pagamento cliente;350,00", "extrato-exemplo.csv", "text/csv;charset=utf-8");
  return <Sheet title="Importar extrato" subtitle="O arquivo é lido somente no aparelho. Nada é enviado para bancos ou servidores." onClose={onClose} wide>
    <div className="form import-form">
      <div className="privacy-note import-learning-note"><Icon name="rule" /><span><strong>O aprendizado é controlado por você</strong><small>As regras só repetem local e categoria. Descrição, valor, data, horário e observação nunca são copiados.</small></span></div>
      <button className="category-access-button standalone import-categories" type="button" onClick={() => setShowCategories(true)}><Icon name="filter" size={17} /> Ver e configurar categorias</button>
      <Field label="Conta do extrato"><select value={accountId} onChange={(event) => { setAccountId(event.target.value); setItems([]); setFilename(""); }}>{state.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></Field>
      <label className="file-picker"><Icon name="upload" size={26} /><strong>{filename || "Escolher arquivo CSV, OFX ou QFX"}</strong><small>Formatos usados pela maioria dos bancos</small><input type="file" accept=".csv,.ofx,.qfx,text/csv" onChange={handleFile} /></label>
      <button className="text-button" type="button" onClick={downloadExample}><Icon name="download" size={17} /> Baixar CSV de exemplo</button>
      {error && <div className="form-error"><Icon name="alert" size={18} />{error}</div>}
      {!!items.length && <>
        <div className="import-summary detailed"><span><strong>{certainCount}</strong><small>por regras</small></span><span><strong>{suggestedCount}</strong><small>prontos</small></span><span><strong>{pendingCount}</strong><small>para revisar</small></span><span><strong>{items.filter((item) => item.duplicate).length}</strong><small>duplicados</small></span></div>
        <p className="import-explanation">Complete apenas o que pertence a cada lançamento. O aplicativo aprende somente quando você marcar essa opção.</p>
        <div className="import-list detailed-import-list">{items.map((item) => {
          const similarCount = items.filter((candidate) => candidate.pattern && candidate.pattern === item.pattern).length;
          const titleLabel = item.kind === "income" ? "O que você recebeu neste lançamento?" : "O que você comprou ou pagou neste lançamento?";
          const placeLabel = item.kind === "income" ? "Quem enviou ou de onde veio?" : "Local da compra ou pagamento";
          return <article className={"import-row import-detail-row " + (item.duplicate ? "duplicate" : "")} key={item.tempId}>
            <div className="import-row-top"><input type="checkbox" checked={item.selected} disabled={item.duplicate} onChange={(event) => updateItem(item.tempId, { selected: event.target.checked })} /><span><small>{displayDate(item.date)} · {item.time}{item.duplicate ? " · Já existe" : ""}</small><strong className={item.kind}>{item.kind === "expense" ? "−" : "+"}{money.format(item.amount)}</strong></span>{item.needsReview && !item.duplicate && <i className="review-tag">Revisar detalhes</i>}</div>
            <div className="import-edit-grid">
              <Field label={titleLabel} hint="Fica somente nesta transação — nunca é usado como regra."><input value={item.description} onChange={(event) => updateDetails(item, { description: event.target.value, confidence: "suggested" })} /></Field>
              <Field label={placeLabel} hint="Pode ser reconhecido depois, somente se você escolher aprender abaixo."><input value={item.place} onChange={(event) => updateDetails(item, { place: event.target.value })} /></Field>
              <Field label="Categoria" hint="Pode ser aplicada nas próximas importações somente com a opção de aprender."><select value={item.categoryId} onChange={(event) => updateDetails(item, { categoryId: event.target.value })}>{state.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
            </div>
            <details className="original-import-description"><summary>Texto original do extrato</summary><p>{item.originalDescription}</p></details>
            {similarCount > 1 && <button className="apply-similar-button" type="button" onClick={() => applyToSimilar(item)}><Icon name="repeat" size={16} /> Aplicar local e categoria às {similarCount} linhas parecidas deste extrato</button>}
            {!item.duplicate && <div className="import-learning-actions"><label><input type="checkbox" checked={item.rememberRule} onChange={(event) => updateItem(item.tempId, { rememberRule: event.target.checked })} /><span><strong>Aprender local e categoria</strong><small>Para futuras importações com este mesmo texto bancário.</small></span></label>{item.needsReview && <button type="button" onClick={() => updateItem(item.tempId, { needsReview: false })}>Confirmar assim mesmo</button>}</div>}
            {!item.duplicate && item.rememberRule && <p className="import-learning-scope">Não reaproveita: descrição, valor, data, horário ou observação.</p>}
          </article>;
        })}</div>
        <button className="primary-button" disabled={!selected.length} onClick={() => onImport(selected)}>Importar {selected.length} {selected.length === 1 ? "lançamento" : "lançamentos"}{pendingCount ? " e revisar depois" : ""}</button>
      </>}
    </div>
    {showCategories && <CategoryManagerSheet state={state} onClose={() => setShowCategories(false)} onState={onState} />}
  </Sheet>;
}

function AccountSheet({ state, account, onClose, onSave, onDelete }: { state: AppState; account?: Account; onClose: () => void; onSave: (account: Account) => void; onDelete: (account: Account) => void }) {
  const [name, setName] = useState(account?.name || ""); const [type, setType] = useState<AccountType>(account?.type || "checking"); const [balance, setBalance] = useState(account ? String(account.openingBalance).replace(".", ",") : ""); const [limit, setLimit] = useState(account?.creditLimit ? String(account.creditLimit).replace(".", ",") : ""); const [color, setColor] = useState(account?.color || "green");
  return <Sheet title={account ? "Editar conta" : "Nova conta ou cartão"} onClose={onClose}><form className="form" onSubmit={(event) => { event.preventDefault(); if (!name.trim()) return; onSave({ id: account?.id || uid("account"), name: name.trim(), type, openingBalance: Math.abs(parseMoney(balance)), creditLimit: type === "credit" ? Math.abs(parseMoney(limit)) : undefined, color }); }}><Field label="Nome"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Conta Nubank" autoFocus /></Field><Field label="Tipo"><select value={type} onChange={(event) => setType(event.target.value as AccountType)}><option value="checking">Conta corrente</option><option value="savings">Poupança</option><option value="cash">Dinheiro físico</option><option value="investment">Investimento</option><option value="credit">Cartão de crédito</option></select></Field><Field label={type === "credit" ? "Saldo inicial da fatura" : "Saldo inicial"}><input inputMode="decimal" value={balance} onChange={(event) => setBalance(event.target.value)} placeholder="0,00" /></Field>{type === "credit" && <Field label="Limite do cartão"><input inputMode="decimal" value={limit} onChange={(event) => setLimit(event.target.value)} placeholder="0,00" /></Field>}<Field label="Cor"><div className="color-options">{Object.keys(toneColor).slice(0, 8).map((tone) => <button type="button" aria-label={tone} className={color === tone ? "active" : ""} style={{ background: toneColor[tone] }} key={tone} onClick={() => setColor(tone)} />)}</div></Field><button className="primary-button">Salvar conta</button>{account && <button className="danger-button" type="button" onClick={() => onDelete(account)} disabled={state.transactions.some((transaction) => transaction.accountId === account.id || transaction.destinationAccountId === account.id)}><Icon name="trash" size={18} /> {state.transactions.some((transaction) => transaction.accountId === account.id || transaction.destinationAccountId === account.id) ? "Conta tem lançamentos" : "Excluir conta"}</button>}</form></Sheet>;
}

function BudgetSheet({ state, budget, onClose, onSave, onDelete }: { state: AppState; budget?: Budget; onClose: () => void; onSave: (budget: Budget) => void; onDelete: (id: string) => void }) {
  const [categoryId, setCategoryId] = useState(budget?.categoryId || state.categories[0]?.id || ""); const [limit, setLimit] = useState(budget ? String(budget.limit).replace(".", ",") : "");
  return <Sheet title={budget ? "Editar limite" : "Novo limite mensal"} onClose={onClose}><form className="form" onSubmit={(event) => { event.preventDefault(); const value = Math.abs(parseMoney(limit)); if (value) onSave({ id: budget?.id || uid("budget"), categoryId, limit: value }); }}><Field label="Categoria"><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{state.categories.filter((category) => budget?.categoryId === category.id || !state.budgets.some((item) => item.categoryId === category.id)).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field><Field label="Valor máximo por mês"><div className="money-input"><span>R$</span><input inputMode="decimal" value={limit} onChange={(event) => setLimit(event.target.value)} placeholder="0,00" /></div></Field><button className="primary-button">Salvar limite</button>{budget && <button className="danger-button" type="button" onClick={() => onDelete(budget.id)}><Icon name="trash" size={18} /> Excluir limite</button>}</form></Sheet>;
}

function GoalSheet({ goal, onClose, onSave, onDelete }: { goal?: Goal; onClose: () => void; onSave: (goal: Goal) => void; onDelete: (id: string) => void }) {
  const [name, setName] = useState(goal?.name || ""); const [current, setCurrent] = useState(goal ? String(goal.current).replace(".", ",") : ""); const [target, setTarget] = useState(goal ? String(goal.target).replace(".", ",") : ""); const [dueDate, setDueDate] = useState(goal?.dueDate || "");
  return <Sheet title={goal ? "Editar meta" : "Nova meta"} onClose={onClose}><form className="form" onSubmit={(event) => { event.preventDefault(); const targetValue = Math.abs(parseMoney(target)); if (name.trim() && targetValue) onSave({ id: goal?.id || uid("goal"), name: name.trim(), current: Math.abs(parseMoney(current)), target: targetValue, dueDate: dueDate || undefined }); }}><Field label="Nome"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Reserva de emergência" /></Field><div className="form-grid"><Field label="Valor guardado"><input inputMode="decimal" value={current} onChange={(event) => setCurrent(event.target.value)} placeholder="0,00" /></Field><Field label="Objetivo"><input inputMode="decimal" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="0,00" /></Field></div><Field label="Data desejada (opcional)"><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></Field><button className="primary-button">Salvar meta</button>{goal && <button className="danger-button" type="button" onClick={() => onDelete(goal.id)}><Icon name="trash" size={18} /> Excluir meta</button>}</form></Sheet>;
}

function RulesSheet({ state, onClose, onChange }: { state: AppState; onClose: () => void; onChange: (rules: CategoryRule[]) => void }) {
  const [keyword, setKeyword] = useState("");
  const [categoryId, setCategoryId] = useState(state.categories[0]?.id || "");
  const [place, setPlace] = useState("");
  const [matchMode, setMatchMode] = useState<CategoryRule["matchMode"]>("contains");
  return <Sheet title="Regras de importação" subtitle="Ensine o app a preencher somente local e categoria. A descrição de cada lançamento nunca é repetida." onClose={onClose}><div className="form"><div className="rule-builder advanced-rule-builder">
    <Field label="Texto que aparece no banco"><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Ex.: IFOOD XYZ487" /></Field>
    <Field label="Como reconhecer"><select value={matchMode} onChange={(event) => setMatchMode(event.target.value as CategoryRule["matchMode"])}><option value="contains">Contém este texto</option><option value="startsWith">Começa com este texto</option><option value="exact">Exatamente igual</option><option value="simplified">Ignorar números e códigos</option></select></Field>
    <Field label="Local ou pessoa (opcional)" hint="Este é o nome que poderá aparecer de novo em importações parecidas."><input value={place} onChange={(event) => setPlace(event.target.value)} placeholder="Ex.: Lanchonete do João" /></Field>
    <Field label="Categoria"><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{state.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
    <button className="primary-button" disabled={!keyword.trim()} onClick={() => { onChange([{ id: uid("rule"), keyword: keyword.trim(), categoryId, place: place.trim() || undefined, matchMode }, ...state.rules]); setKeyword(""); setPlace(""); }}>Adicionar regra</button>
  </div><div className="rules-list">{state.rules.map((rule) => <div key={rule.id}><span><strong>“{rule.keyword}”</strong><small>{rule.place ? rule.place + " · " : ""}{state.categories.find((category) => category.id === rule.categoryId)?.name}</small></span><button onClick={() => onChange(state.rules.filter((item) => item.id !== rule.id))}><Icon name="trash" size={18} /></button></div>)}</div></div></Sheet>;
}

function CategoryManagerSheet({ state, onClose, onState }: { state: AppState; onClose: () => void; onState: (state: AppState) => void }) {
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState<IconName>("wallet");
  const [newTone, setNewTone] = useState("slate");
  const updateCategory = (id: string, patch: Partial<Category>) => onState({ ...state, demoMode: false, categories: state.categories.map((category) => category.id === id ? { ...category, ...patch } : category) });
  const addCategory = (event: FormEvent) => {
    event.preventDefault();
    if (!newName.trim()) return;
    onState({ ...state, demoMode: false, categories: [...state.categories, { id: uid("category"), name: newName.trim(), icon: newIcon, tone: newTone }] });
    setNewName("");
    setNewIcon("wallet");
    setNewTone("slate");
  };
  const removeCategory = (id: string) => {
    if (id === "other" || !window.confirm("Excluir esta categoria? Os lançamentos dela passarão para Outros.")) return;
    onState({
      ...state,
      demoMode: false,
      categories: state.categories.filter((category) => category.id !== id),
      transactions: state.transactions.map((transaction) => transaction.categoryId === id ? { ...transaction, categoryId: "other", needsReview: true } : transaction),
      budgets: state.budgets.filter((budget) => budget.categoryId !== id),
      rules: state.rules.map((rule) => rule.categoryId === id ? { ...rule, categoryId: "other" } : rule),
    });
  };
  return <Sheet title="Categorias" subtitle="Crie, renomeie e personalize. As alterações são salvas automaticamente." onClose={onClose} wide>
    <form className="category-create" onSubmit={addCategory}>
      <Field label="Nova categoria"><input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Ex.: Produtos de limpeza" /></Field>
      <div className="form-grid"><Field label="Ícone"><select value={newIcon} onChange={(event) => setNewIcon(event.target.value as IconName)}>{categoryIconOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></Field><Field label="Cor"><select value={newTone} onChange={(event) => setNewTone(event.target.value)}>{Object.keys(toneColor).map((tone) => <option value={tone} key={tone}>{tone}</option>)}</select></Field></div>
      <button className="primary-button" disabled={!newName.trim()}><Icon name="plus" size={18} /> Adicionar categoria</button>
    </form>
    <div className="category-manager-list">{state.categories.map((category) => <details className="category-editor" key={category.id}>
      <summary><span className={"category-icon tone-" + category.tone}><Icon name={category.icon as IconName} size={20} /></span><span><strong>{category.name}</strong><small>Toque para editar</small></span><Icon name="chevron" size={18} /></summary>
      <div className="category-editor-body">
        <Field label="Nome"><input value={category.name} onChange={(event) => updateCategory(category.id, { name: event.target.value })} /></Field>
        <div className="form-grid"><Field label="Ícone"><select value={category.icon} onChange={(event) => updateCategory(category.id, { icon: event.target.value })}>{categoryIconOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></Field><Field label="Cor"><select value={category.tone} onChange={(event) => updateCategory(category.id, { tone: event.target.value })}>{Object.keys(toneColor).map((tone) => <option value={tone} key={tone}>{tone}</option>)}</select></Field></div>
        <div className="category-color-preview" aria-label="Prévia da cor">{Object.entries(toneColor).map(([tone, color]) => <button type="button" key={tone} className={category.tone === tone ? "active" : ""} style={{ background: color }} onClick={() => updateCategory(category.id, { tone })} aria-label={tone} />)}</div>
        {category.id === "other" ? <p className="protected-category"><Icon name="info" size={16} /> “Outros” permanece disponível para lançamentos sem categoria identificada.</p> : <button className="danger-button compact-danger" type="button" onClick={() => removeCategory(category.id)}><Icon name="trash" size={17} /> Excluir categoria</button>}
      </div>
    </details>)}</div>
  </Sheet>;
}

function downloadBlob(content: string, filename: string, type = "application/json") { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 500); }
const csvEscape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

function SettingToggle({ title, description, checked, onChange, compact = false }: { title: string; description: string; checked: boolean; onChange: (checked: boolean) => void; compact?: boolean }) {
  return <label className={"toggle-row " + (compact ? "compact-toggle" : "")}><span><strong>{title}</strong><small>{description}</small></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function SettingsSheet({ state, onClose, onState, onRules, onNavLab }: { state: AppState; onClose: () => void; onState: (state: AppState) => void; onRules: () => void; onNavLab: () => void }) {
  const [confirmReset, setConfirmReset] = useState<"demo" | "blank" | null>(null);
  const setSetting = <K extends keyof AppState["settings"]>(key: K, value: AppState["settings"][K]) => {
    onState({ ...state, settings: { ...state.settings, [key]: value } });
  };
  const exportCSV = () => { const header = ["data", "hora", "tipo", "titulo", "local_ou_origem", "valor", "categoria", "conta", "observacao", "descricao_original_banco", "precisa_revisao"].join(";"); const rows = state.transactions.map((transaction) => [transaction.date, transaction.time, transaction.kind, transaction.description, transaction.place || "", transaction.amount.toFixed(2).replace(".", ","), state.categories.find((category) => category.id === transaction.categoryId)?.name || "", state.accounts.find((account) => account.id === transaction.accountId)?.name || "", transaction.notes, transaction.originalDescription || "", transaction.needsReview ? "sim" : "nao"].map(csvEscape).join(";")); downloadBlob([header, ...rows].join("\n"), "meu-dinheiro-lancamentos.csv", "text/csv;charset=utf-8"); };
  const restore = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const decoded = JSON.parse(await file.text()) as AppState | { state?: AppState };
      const parsed = "state" in decoded && decoded.state ? decoded.state : decoded as AppState;
      if (!Array.isArray(parsed.transactions) || !Array.isArray(parsed.accounts)) throw new Error();
      onState({
        ...initialState,
        ...parsed,
        transactions: parsed.transactions,
        accounts: parsed.accounts,
        categories: Array.isArray(parsed.categories) ? parsed.categories : initialState.categories,
        budgets: Array.isArray(parsed.budgets) ? parsed.budgets : [],
        goals: Array.isArray(parsed.goals) ? parsed.goals : [],
        rules: Array.isArray(parsed.rules) ? parsed.rules : [],
        settings: { ...initialState.settings, ...cleanLegacySettings(parsed.settings) },
      });
      onClose();
    } catch {
      window.alert("Este arquivo não parece ser um backup válido do app.");
    }
  };
  const themeOptions: Array<{ value: AppState["settings"]["theme"]; label: string }> = [
    { value: "light", label: "Claro" },
    { value: "system", label: "Sistema" },
    { value: "dark", label: "Escuro" },
  ];
  const incomePresets = ["#55b87a", "#34c759", "#7fcf8b", "#0b8f5a", "#57c7a1"];
  const expensePresets = ["#ff7075", "#ff453a", "#e85d68", "#d94a4a", "#ff8a80"];

  return <Sheet title="Ajustes" onClose={onClose}>
    <div className="settings-list">
      <div className="settings-group appearance-group">
        <span className="eyebrow">APARÊNCIA</span>
        <div className="theme-picker" role="group" aria-label="Tema do aplicativo">
          {themeOptions.map((option) => <button type="button" key={option.value} className={state.settings.theme === option.value ? "active" : ""} onClick={() => setSetting("theme", option.value)}>
            <span className={"theme-swatch " + option.value}><i /></span>
            <strong>{option.label}</strong>
          </button>)}
        </div>
        <div className="finance-colors">
          <ColorSetting label="Cor das entradas" description="Botões e valores recebidos." value={state.settings.incomeColor} presets={incomePresets} onChange={(value) => setSetting("incomeColor", value)} />
          <ColorSetting label="Cor das saídas" description="Botões e valores gastos." value={state.settings.expenseColor} presets={expensePresets} onChange={(value) => setSetting("expenseColor", value)} />
        </div>
      </div>

      <SettingToggle title="Dicas e avisos automáticos" description="Frases calculadas no aparelho, sem IA e sem custos." checked={state.settings.diagnosticsEnabled} onChange={(checked) => setSetting("diagnosticsEnabled", checked)} />

      {state.settings.diagnosticsEnabled && <details className="diagnostic-settings">
        <summary><span className="settings-icon"><Icon name="sparkles" /></span><span><strong>Personalizar dicas e avisos</strong><small>Escolha a quantidade, sensibilidade e tipos de leitura.</small></span><Icon name="chevron" size={18} /></summary>
        <div className="diagnostic-settings-body">
          <div className="setting-block"><span><strong>Cartões na tela inicial</strong><small>Os mais importantes aparecem primeiro.</small></span><div className="number-picker" role="group" aria-label="Quantidade de cartões na tela inicial">{[1, 2, 3, 4, 5].map((count) => <button type="button" key={count} className={state.settings.diagnosticMaxCards === count ? "active" : ""} onClick={() => setSetting("diagnosticMaxCards", count)}>{count}</button>)}</div></div>

          <div className="setting-block"><span><strong>Sensibilidade das comparações</strong><small>Define o tamanho da mudança necessária para gerar uma mensagem.</small></span><div className="sensitivity-picker">{([
            { value: "low", label: "Só grandes", hint: "20%" },
            { value: "balanced", label: "Equilibrada", hint: "10%" },
            { value: "high", label: "Detalhada", hint: "5%" },
          ] as const).map((option) => <button type="button" key={option.value} className={state.settings.diagnosticSensitivity === option.value ? "active" : ""} onClick={() => setSetting("diagnosticSensitivity", option.value)}><strong>{option.label}</strong><small>{option.hint}</small></button>)}</div></div>

          <SettingToggle compact title="Comparar períodos equivalentes" description="Hoje com o mesmo dia do mês passado." checked={state.settings.diagnosticSamePeriod} onChange={(checked) => setSetting("diagnosticSamePeriod", checked)} />

          <div className="diagnostic-subgroup"><span className="eyebrow">TIPOS DE LEITURA</span>
            <SettingToggle compact title="Entradas" description="Mudanças no ritmo do que você recebeu." checked={state.settings.diagnosticIncomeTrends} onChange={(checked) => setSetting("diagnosticIncomeTrends", checked)} />
            <SettingToggle compact title="Saídas" description="Aumento ou queda dos gastos gerais." checked={state.settings.diagnosticExpenseTrends} onChange={(checked) => setSetting("diagnosticExpenseTrends", checked)} />
            <SettingToggle compact title="Categorias" description="Mercado, alimentação, transporte e outras." checked={state.settings.diagnosticCategoryTrends} onChange={(checked) => setSetting("diagnosticCategoryTrends", checked)} />
            <SettingToggle compact title="Limites e ritmo" description="Avisos de orçamento e uso mais cedo." checked={state.settings.diagnosticBudgetPace} onChange={(checked) => setSetting("diagnosticBudgetPace", checked)} />
            <SettingToggle compact title="Projeção do fim do mês" description="Estimativa simples pela média diária." checked={state.settings.diagnosticProjections} onChange={(checked) => setSetting("diagnosticProjections", checked)} />
            <SettingToggle compact title="Contas recorrentes" description="Variações e faixa esperada da energia." checked={state.settings.diagnosticBillAlerts} onChange={(checked) => setSetting("diagnosticBillAlerts", checked)} />
            <SettingToggle compact title="Pequenos gastos" description="Soma despesas menores e frequentes." checked={state.settings.diagnosticSmallExpenses} onChange={(checked) => setSetting("diagnosticSmallExpenses", checked)} />
          </div>

          <div className="diagnostic-subgroup"><span className="eyebrow">TOM DAS MENSAGENS</span>
            <div className="tone-options">
              <label><input type="checkbox" checked={state.settings.diagnosticShowWarnings} onChange={(event) => setSetting("diagnosticShowWarnings", event.target.checked)} /><span className="warning-dot" />Avisos</label>
              <label><input type="checkbox" checked={state.settings.diagnosticShowPositive} onChange={(event) => setSetting("diagnosticShowPositive", event.target.checked)} /><span className="positive-dot" />Boas notícias</label>
              <label><input type="checkbox" checked={state.settings.diagnosticShowNeutral} onChange={(event) => setSetting("diagnosticShowNeutral", event.target.checked)} /><span className="neutral-dot" />Dicas neutras</label>
            </div>
          </div>

          <div className="diagnostic-subgroup"><span className="eyebrow">FAIXAS PESSOAIS</span><div className="form-grid diagnostic-values">
            <Field label="Alerta de energia acima de"><input inputMode="decimal" value={String(state.settings.energyExpectedMax).replace(".", ",")} onChange={(event) => setSetting("energyExpectedMax", Math.max(0, parseMoney(event.target.value)))} /></Field>
            <Field label="Pequeno gasto até"><input inputMode="decimal" value={String(state.settings.smallExpenseLimit).replace(".", ",")} onChange={(event) => setSetting("smallExpenseLimit", Math.max(1, parseMoney(event.target.value)))} /></Field>
          </div><Field label="Avisar a partir de quantos pequenos gastos"><input type="number" inputMode="numeric" min="2" max="30" value={state.settings.smallExpenseCount} onChange={(event) => setSetting("smallExpenseCount", Math.max(2, Math.min(30, Number(event.target.value) || 2)))} /></Field></div>
          <p className="diagnostic-privacy"><Icon name="check" size={16} /> Tudo é calculado no seu aparelho. Nenhum valor é enviado para uma API.</p>
        </div>
      </details>}
      <div className="settings-group">
        <span className="eyebrow">LABORATÓRIO</span>
        <button className="settings-button" onClick={onNavLab}><span className="settings-icon"><Icon name="sparkles" /></span><span><strong>Editor da barra inferior</strong><small>Prévia ao vivo, tamanhos, títulos, cores, borda e sombra.</small></span><Icon name="chevron" size={18} /></button>
      </div>
      <button className="settings-button" onClick={onRules}><span className="settings-icon"><Icon name="rule" /></span><span><strong>Regras de importação</strong><small>Simplifique títulos, locais e categorias automaticamente.</small></span><Icon name="chevron" size={18} /></button>

      <div className="settings-group">
        <span className="eyebrow">BACKUP E EXPORTAÇÃO</span>
        <button className="settings-button" onClick={() => downloadBlob(JSON.stringify(state, null, 2), "backup-meu-dinheiro.json")}><span className="settings-icon"><Icon name="download" /></span><span><strong>Baixar backup completo</strong><small>Arquivo que restaura todo o app.</small></span></button>
        <button className="settings-button" onClick={exportCSV}><span className="settings-icon"><Icon name="file" /></span><span><strong>Exportar lançamentos em CSV</strong><small>Abre em Numbers e planilhas.</small></span></button>
        <label className="settings-button"><span className="settings-icon"><Icon name="upload" /></span><span><strong>Restaurar backup</strong><small>Substitui os dados pelo arquivo escolhido.</small></span><input className="hidden-input" type="file" accept="application/json,.json" onChange={restore} /></label>
      </div>

      <div className="settings-group danger-zone">
        <span className="eyebrow">RECOMEÇAR</span>
        {confirmReset ? <div className="confirm-box"><strong>{confirmReset === "blank" ? "Apagar todos os dados e começar vazio?" : "Restaurar os dados de demonstração?"}</strong><div><button onClick={() => setConfirmReset(null)}>Cancelar</button><button className="confirm-danger" onClick={() => { const next = confirmReset === "blank" ? emptyState() : structuredClone(initialState); onState({ ...next, settings: state.settings }); onClose(); }}>Confirmar</button></div></div> : <>
          <button className="settings-button" onClick={() => setConfirmReset("blank")}><span className="settings-icon danger"><Icon name="trash" /></span><span><strong>Começar com o app vazio</strong><small>Remove lançamentos, limites e metas.</small></span></button>
          <button className="settings-button" onClick={() => setConfirmReset("demo")}><span className="settings-icon"><Icon name="sparkles" /></span><span><strong>Restaurar demonstração</strong><small>Recoloca os exemplos iniciais.</small></span></button>
        </>}
      </div>
      <div className="privacy-footer"><Icon name="check" /><p><strong>Seus dados ficam neste aparelho.</strong><br/>O app não envia seus valores para a OpenAI, bancos ou qualquer servidor.</p></div>
    </div>
  </Sheet>;
}

function NavNumberChoice({ label, description, value, options, suffix = "", onChange }: { label: string; description: string; value: number; options: number[]; suffix?: string; onChange: (value: number) => void }) {
  return <div className="nav-lab-control"><span><strong>{label}</strong><small>{description}</small></span><div className="nav-choice-grid">{options.map((option) => <button type="button" key={option} className={value === option ? "active" : ""} onClick={() => onChange(option)}>{option}{suffix}</button>)}</div></div>;
}

function NavColorControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="nav-color-control"><span className="nav-color-dot" style={{ background: value }} /><strong>{label}</strong><input type="color" value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} /></label>;
}

function NavLabPreview({ settings }: { settings: AppState["settings"] }) {
  const iconSize = settings.navIconSize;
  const previewSettings = { ...settings, navCustomEnabled: true };
  const item = (icon: IconName, label: string, active = false) => <button type="button" className={`nav-tab ${active ? "active" : ""}`}><Icon name={icon} size={iconSize} /><span>{label}</span></button>;
  return <div className="nav-lab-preview-stage"><span className="eyebrow">PRÉVIA AO VIVO</span><nav className={`nav-lab-preview custom-nav ${settings.navShowLabels ? "" : "labels-hidden"} shadow-${settings.navShadow}`} style={navVariables(previewSettings)}>{item("homeTab", "Início", true)}{item("receiptTab", "Extrato")}<button type="button" className="add-button" aria-label="Adicionar"><Icon name="plusTab" size={Math.max(20, iconSize - 2)} /></button>{item("planTab", "Planejar")}{item("analysisPieTab", "Análise")}</nav></div>;
}

function NavLabSheet({ state, onClose, onState }: { state: AppState; onClose: () => void; onState: (state: AppState) => void }) {
  const setSetting = <K extends keyof AppState["settings"]>(key: K, value: AppState["settings"][K]) => onState({ ...state, settings: { ...state.settings, [key]: value } });
  const reset = () => onState({ ...state, settings: { ...state.settings, ...navDefaults } });
  return <Sheet title="Laboratório da barra" subtitle="Monte a navegação do seu jeito. As mudanças aparecem na prévia e são salvas automaticamente." onClose={onClose}>
    <div className="nav-lab">
      <NavLabPreview settings={state.settings} />
      <SettingToggle title="Usar barra personalizada" description="Ativa as escolhas abaixo em todo o app." checked={state.settings.navCustomEnabled} onChange={(checked) => setSetting("navCustomEnabled", checked)} />
      <SettingToggle title="Mostrar títulos" description="Ao ocultar, os ícones ficam centralizados na barra." checked={state.settings.navShowLabels} onChange={(checked) => setSetting("navShowLabels", checked)} />

      <div className="nav-lab-section"><span className="eyebrow">TAMANHOS E FORMA</span>
        <NavNumberChoice label="Tamanho dos ícones" description="O padrão do laboratório é 27 px." value={state.settings.navIconSize} options={[24, 27, 30, 33]} suffix=" px" onChange={(value) => setSetting("navIconSize", value)} />
        <NavNumberChoice label="Tamanho dos títulos" description="Afeta somente os textos abaixo dos ícones." value={state.settings.navTextSize} options={[8, 9, 10, 11]} suffix=" px" onChange={(value) => setSetting("navTextSize", value)} />
        <NavNumberChoice label="Altura da barra" description="54 px cria a versão fina que você preferiu." value={state.settings.navHeight} options={[54, 62, 70, 78]} suffix=" px" onChange={(value) => setSetting("navHeight", value)} />
        <NavNumberChoice label="Arredondamento" description="De mais discreto a bem arredondado." value={state.settings.navCornerRadius} options={[14, 20, 26, 32]} suffix=" px" onChange={(value) => setSetting("navCornerRadius", value)} />
        <NavNumberChoice label="Espaço nas laterais" description="Controla a largura visual da barra." value={state.settings.navSideInset} options={[16, 24, 32, 40]} suffix=" px" onChange={(value) => setSetting("navSideInset", value)} />
        <NavNumberChoice label="Espessura da borda" description="Zero remove completamente o contorno." value={state.settings.navBorderWidth} options={[0, 1, 2, 3]} suffix=" px" onChange={(value) => setSetting("navBorderWidth", value)} />
      </div>

      <div className="nav-lab-section"><span className="eyebrow">SOMBRA</span><div className="nav-shadow-picker">{([{"value":"none","label":"Sem sombra"},{"value":"soft","label":"Suave"},{"value":"strong","label":"Forte"}] as const).map((option) => <button type="button" key={option.value} className={state.settings.navShadow === option.value ? "active" : ""} onClick={() => setSetting("navShadow", option.value)}>{option.label}</button>)}</div></div>

      <div className="nav-lab-section"><span className="eyebrow">CORES</span><div className="nav-color-grid">
        <NavColorControl label="Fundo da barra" value={state.settings.navBackgroundColor} onChange={(value) => setSetting("navBackgroundColor", value)} />
        <NavColorControl label="Borda" value={state.settings.navBorderColor} onChange={(value) => setSetting("navBorderColor", value)} />
        <NavColorControl label="Ícones inativos" value={state.settings.navInactiveColor} onChange={(value) => setSetting("navInactiveColor", value)} />
        <NavColorControl label="Fundo selecionado" value={state.settings.navActiveBackgroundColor} onChange={(value) => setSetting("navActiveBackgroundColor", value)} />
        <NavColorControl label="Ícone selecionado" value={state.settings.navActiveColor} onChange={(value) => setSetting("navActiveColor", value)} />
        <NavColorControl label="Botão +" value={state.settings.navAddBackgroundColor} onChange={(value) => setSetting("navAddBackgroundColor", value)} />
      </div></div>

      <button type="button" className="secondary-review-button nav-reset-button" onClick={reset}><Icon name="repeat" size={18} /> Restaurar padrão da barra</button>
    </div>
  </Sheet>;
}

function ColorSetting({ label, description, value, presets, onChange }: { label: string; description: string; value: string; presets: string[]; onChange: (value: string) => void }) {
  return <div className="color-setting">
    <div className="color-setting-heading">
      <span className="color-preview" style={{ background: value }} />
      <span className="grow"><strong>{label}</strong><small>{description}</small></span>
      <label className="custom-color" title="Escolher outra cor"><span>Personalizar</span><input type="color" value={value} aria-label={label} onChange={(event) => onChange(event.target.value)} /></label>
    </div>
    <div className="color-presets" aria-label={"Cores sugeridas para " + label.toLowerCase()}>{presets.map((color) => <button type="button" key={color} className={value.toLowerCase() === color.toLowerCase() ? "active" : ""} style={{ background: color }} aria-label={color} onClick={() => onChange(color)} />)}</div>
  </div>;
}

function EmptyState({ icon, title, text }: { icon: IconName; title: string; text: string }) { return <div className="empty-state"><span><Icon name={icon} /></span><strong>{title}</strong><p>{text}</p></div>; }

function InfoSheet({ type, onClose }: { type: "demo" | "available"; onClose: () => void }) {
  return <Sheet title={type === "demo" ? "Dados de demonstração" : "Valor disponível"} onClose={onClose}><div className="info-sheet-content"><span><Icon name="info" size={25} /></span>{type === "demo" ? <><strong>Estes valores são apenas exemplos.</strong><p>Eles existem para você explorar as telas e funções antes de registrar seus próprios dados. Quando quiser começar, abra Ajustes e escolha “Começar com o app vazio”.</p></> : <><strong>Este é o dinheiro livre nas contas de uso diário.</strong><p>Poupança, investimentos, valores separados em metas e limite do cartão não entram nesse cálculo. Assim, o app evita mostrar como disponível um dinheiro que já possui outro destino.</p></>}</div></Sheet>;
}

export default function App() {
  const [state, setState] = useState<AppState>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<Tab>("home");
  const [reviewPending, setReviewPending] = useState(false);
  const [month, setMonth] = useState(currentMonthKey());
  const [modal, setModal] = useState<Modal>(null);
  useEffect(() => { loadState().then((stored) => {
    if (stored) {
      const nextState = stored.demoMode && stored.version < initialState.version ? initialState : stored;
      setState({ ...nextState, settings: { ...initialState.settings, ...cleanLegacySettings(nextState.settings) } });
    }
    setHydrated(true);
  }); }, []);
  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      void saveState(state).catch((error) => console.error("Falha ao salvar o estado do app", error));
    }, 250);
    return () => clearTimeout(timer);
  }, [state, hydrated]);
  useEffect(() => { document.body.classList.toggle("modal-open", !!modal); return () => document.body.classList.remove("modal-open"); }, [modal]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolved = state.settings.theme === "system" ? (media.matches ? "dark" : "light") : state.settings.theme;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#101713" : "#f7f8f6");
    };
    applyTheme();
    if (state.settings.theme === "system") media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [state.settings.theme]);

  const saveTransactions = (transactions: Transaction[], replacedId?: string, learnedRules: CategoryRule[] = [], historyUpdate?: HistoryImportUpdate) => {
    setState((current) => {
      const updatedHistory = historyUpdate ? current.transactions.map((item) => {
        const shouldUpdate = item.id !== historyUpdate.excludeId
          && hasSameImportPattern(item, historyUpdate.pattern)
          && importMoment(item) < historyUpdate.before;
        return shouldUpdate ? { ...item, place: historyUpdate.place, categoryId: historyUpdate.categoryId, needsReview: isPlaceholderTitle(item.description) || historyUpdate.categoryId === "other" } : item;
      }) : current.transactions;
      return { ...current, demoMode: false, rules: mergeLearnedRules(current.rules, learnedRules), transactions: [...updatedHistory.filter((item) => item.id !== replacedId), ...transactions] };
    });
    setModal(null);
  };
  const importTransactions = (items: ImportCandidate[]) => {
    const transactions: Transaction[] = items.map((item) => ({ id: uid("tx"), kind: item.kind, description: item.description.trim(), place: item.place.trim() || undefined, originalDescription: item.originalDescription, needsReview: item.needsReview, amount: item.amount, date: item.date, time: item.time, categoryId: item.categoryId, accountId: item.accountId, paymentMethod: "other", notes: "Importado de extrato.", source: item.source, importFingerprint: item.fingerprint }));
    const learnedRules: CategoryRule[] = items.filter((item) => item.rememberRule).map((item) => ({ id: uid("rule"), keyword: item.originalDescription, categoryId: item.categoryId, place: item.place.trim() || undefined, matchMode: "simplified" }));
    saveTransactions(transactions, undefined, learnedRules);
  };
  const deleteTransaction = (id: string) => { if (window.confirm("Excluir este lançamento?")) { setState((current) => ({ ...current, transactions: current.transactions.filter((item) => item.id !== id), demoMode: false })); setModal(null); } };
  const setAndClose = <T,>(key: "accounts" | "budgets" | "goals", value: T, id: string) => { setState((current) => ({ ...current, demoMode: false, [key]: [...(current[key] as T[]).filter((item) => (item as { id: string }).id !== id), value] })); setModal(null); };

  if (!hydrated) return <div className="splash"><span className="brand-mark"><PigMark /></span><strong>Meu Dinheiro</strong><small>Organizando seu app…</small></div>;
  return <div className="app-shell" style={{ "--income-color": state.settings.incomeColor, "--expense-color": state.settings.expenseColor } as CSSProperties}>
    <AppHeader state={state} onSettings={() => setModal({ type: "settings" })} onDemoInfo={() => setModal({ type: "demoInfo" })} onToggleValues={() => setState((current) => ({ ...current, settings: { ...current.settings, hiddenValues: !current.settings.hiddenValues } }))} />
    {tab === "home" && <HomeView state={state} month={month} setMonth={setMonth} onModal={setModal} onTab={setTab} onReviewPending={() => { const latestPending = state.transactions.filter((item) => item.needsReview).sort((a, b) => b.date.localeCompare(a.date))[0]; if (latestPending) setMonth(latestPending.date.slice(0, 7)); setReviewPending(true); setTab("transactions"); }} />}
    {tab === "transactions" && <TransactionsView state={state} month={month} setMonth={setMonth} reviewPending={reviewPending} onCategories={() => setModal({ type: "categories" })} onEdit={(transaction) => setModal({ type: "transaction", kind: transaction.kind, transaction })} />}
    {tab === "plan" && <PlanView state={state} month={month} onModal={setModal} />}
    {tab === "analysis" && <AnalysisView state={state} month={month} setMonth={setMonth} onCategories={() => setModal({ type: "categories" })} onComparisonMonths={(kind, count) => setState((current) => ({ ...current, settings: { ...current.settings, [kind === "income" ? "incomeComparisonMonths" : "expenseComparisonMonths"]: count } }))} />}
    <BottomNav active={tab} settings={state.settings} onChange={(next) => { if (next === "transactions") setReviewPending(false); setTab(next); }} onAdd={() => setModal({ type: "transaction", kind: "expense" })} />
    {modal?.type === "transaction" && <TransactionSheet state={state} kind={modal.kind} existing={modal.transaction} onClose={() => setModal(null)} onSave={saveTransactions} onDelete={deleteTransaction} onState={setState} />}
    {modal?.type === "import" && <ImportSheet state={state} onClose={() => setModal(null)} onImport={importTransactions} onState={setState} />}
    {modal?.type === "settings" && <SettingsSheet state={state} onClose={() => setModal(null)} onState={setState} onRules={() => setModal({ type: "rules" })} onNavLab={() => setModal({ type: "navLab" })} />}
    {modal?.type === "navLab" && <NavLabSheet state={state} onClose={() => setModal({ type: "settings" })} onState={setState} />}
    {modal?.type === "rules" && <RulesSheet state={state} onClose={() => setModal({ type: "settings" })} onChange={(rules) => setState((current) => ({ ...current, rules }))} />}
    {modal?.type === "categories" && <CategoryManagerSheet state={state} onClose={() => setModal(null)} onState={setState} />}
    {modal?.type === "account" && <AccountSheet state={state} account={modal.account} onClose={() => setModal(null)} onSave={(account) => setAndClose("accounts", account, account.id)} onDelete={(account) => { setState((current) => ({ ...current, accounts: current.accounts.filter((item) => item.id !== account.id) })); setModal(null); }} />}
    {modal?.type === "budget" && <BudgetSheet state={state} budget={modal.budget} onClose={() => setModal(null)} onSave={(budget) => setAndClose("budgets", budget, budget.id)} onDelete={(id) => { setState((current) => ({ ...current, budgets: current.budgets.filter((item) => item.id !== id) })); setModal(null); }} />}
    {modal?.type === "goal" && <GoalSheet goal={modal.goal} onClose={() => setModal(null)} onSave={(goal) => setAndClose("goals", goal, goal.id)} onDelete={(id) => { setState((current) => ({ ...current, goals: current.goals.filter((item) => item.id !== id) })); setModal(null); }} />}
    {modal?.type === "demoInfo" && <InfoSheet type="demo" onClose={() => setModal(null)} />}
    {modal?.type === "availableInfo" && <InfoSheet type="available" onClose={() => setModal(null)} />}
  </div>;
}
