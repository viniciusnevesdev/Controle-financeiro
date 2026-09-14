import type { AppState, CategoryRule, ImportCandidate } from "./types";

const normalize = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .trim();

export const isPlaceholderTitle = (value: string) => /^(compra|pagamento|entrada|movimenta[cç][aã]o) (n[aã]o detalhad[ao]|importad[ao])$/i.test(value.trim());

export const simplifyBankText = (value: string) => normalize(value)
  .replace(/\b(compra|pagamento|pgto|cartao|credito|debito|pix|recebido|enviado|transferencia|transf)\b/g, " ")
  .replace(/\d+/g, " ")
  .replace(/[^a-z]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const titleCase = (value: string) => value.toLowerCase().replace(/(^|\s)([a-záàâãéèêíïóôõöúç])/g, (_, space, letter) => space + letter.toUpperCase());

export const cleanBankPlace = (value: string) => {
  const cleaned = value
    .replace(/[ *_]+/g, " ")
    .replace(/\b(compra|pagamento|pgto|cart[aã]o|cr[eé]dito|d[eé]bito|pix recebido|pix enviado|transfer[eê]ncia)\b/gi, " ")
    .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, " ")
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/\d+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Local não identificado";
  return titleCase(cleaned).slice(0, 70);
};

const cleanHeader = (value: string) => normalize(value).replace(/[^a-z0-9]/g, "");

export const parseMoney = (raw: string | number): number => {
  if (typeof raw === "number") return raw;
  let value = String(raw ?? "").trim();
  if (!value) return 0;
  const negativeByParentheses = value.startsWith("(") && value.endsWith(")");
  value = value.replace(/[R$\s()]/g, "").replace(/[^\d,.-]/g, "");
  const hasComma = value.includes(",");
  const hasDot = value.includes(".");
  if (hasComma && hasDot) {
    if (value.lastIndexOf(",") > value.lastIndexOf(".")) value = value.replace(/\./g, "").replace(",", ".");
    else value = value.replace(/,/g, "");
  } else if (hasComma) {
    const parts = value.split(",");
    value = parts.length === 2 && parts[1].length <= 2 ? parts[0].replace(/\./g, "") + "." + parts[1] : value.replace(/,/g, "");
  } else if (hasDot) {
    const parts = value.split(".");
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) value = value.replace(/\./g, "");
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return negativeByParentheses ? -Math.abs(parsed) : parsed;
};

export const normalizeDate = (raw: string): { date: string; time: string } => {
  const value = String(raw ?? "").trim();
  const ofx = value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?/);
  if (ofx) return { date: ofx[1] + "-" + ofx[2] + "-" + ofx[3], time: ofx[4] ? ofx[4] + ":" + (ofx[5] || "00") : "12:00" };
  const iso = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (iso) return { date: iso[1] + "-" + iso[2].padStart(2, "0") + "-" + iso[3].padStart(2, "0"), time: iso[4] ? iso[4].padStart(2, "0") + ":" + iso[5] : "12:00" };
  const br = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (br) {
    const year = br[3].length === 2 ? "20" + br[3] : br[3];
    return { date: year + "-" + br[2].padStart(2, "0") + "-" + br[1].padStart(2, "0"), time: br[4] ? br[4].padStart(2, "0") + ":" + br[5] : "12:00" };
  }
  return { date: new Date().toISOString().slice(0, 10), time: "12:00" };
};

const ruleMatches = (description: string, rule: CategoryRule) => {
  const value = normalize(description);
  const keyword = normalize(rule.keyword);
  if (rule.matchMode === "exact") return value === keyword;
  if (rule.matchMode === "startsWith") return value.startsWith(keyword);
  if (rule.matchMode === "simplified") {
    const simplifiedKeyword = simplifyBankText(rule.keyword);
    return !!simplifiedKeyword && simplifyBankText(description).includes(simplifiedKeyword);
  }
  return value.includes(keyword);
};

export const findImportRule = (description: string, rules: CategoryRule[]) => rules.find((rule) => ruleMatches(description, rule));

export const suggestCategory = (description: string, rules: CategoryRule[], fallback = "other") =>
  findImportRule(description, rules)?.categoryId ?? fallback;

const importDetails = (originalDescription: string, kind: "expense" | "income", state: AppState) => {
  const rule = findImportRule(originalDescription, state.rules);
  const place = rule?.place?.trim() || cleanBankPlace(originalDescription);
  const description = kind === "expense" ? "Compra não detalhada" : "Entrada não detalhada";
  const categoryId = rule?.categoryId || "other";
  const confidence = rule && categoryId !== "other" ? "certain" as const : "unknown" as const;
  return {
    description,
    place,
    categoryId,
    confidence,
    needsReview: isPlaceholderTitle(description) || categoryId === "other",
    originalDescription,
    rememberRule: false,
    pattern: simplifyBankText(originalDescription),
  };
};

export const makeFingerprint = (date: string, amount: number, description: string, accountId: string) =>
  [date, amount.toFixed(2), normalize(description).replace(/\s+/g, " "), accountId].join("|");

const splitCSVLine = (line: string, delimiter: string) => {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else current += char;
  }
  cells.push(current.trim());
  return cells;
};

const detectDelimiter = (line: string) => {
  const options = [";", ",", "\t"];
  return options.sort((a, b) => line.split(b).length - line.split(a).length)[0];
};

const headerIndex = (headers: string[], candidates: string[]) => headers.findIndex((header) => candidates.includes(header));

const parseCSV = (content: string, state: AppState, accountId: string): ImportCandidate[] => {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const delimiter = detectDelimiter(lines[0]);
  const first = splitCSVLine(lines[0], delimiter);
  const cleaned = first.map(cleanHeader);
  const dateNames = ["data", "date", "datalancamento", "datamovimento", "datatransacao", "postingdate"];
  const descriptionNames = ["descricao", "description", "historico", "lancamento", "estabelecimento", "memo", "nome", "detalhes"];
  const amountNames = ["valor", "amount", "quantia", "total", "valortransacao"];
  const debitNames = ["debito", "debit", "saida", "valordebito"];
  const creditNames = ["credito", "credit", "entrada"];
  const typeNames = ["tipo", "type", "natureza", "creditodebito"];
  const timeNames = ["hora", "time", "horario"];
  const recognized = cleaned.some((header) => [...dateNames, ...descriptionNames, ...amountNames, ...debitNames, ...creditNames].includes(header));
  const headers = recognized ? cleaned : ["data", "descricao", "valor"];
  const start = recognized ? 1 : 0;
  const dateIndex = headerIndex(headers, dateNames);
  const descriptionIndex = headerIndex(headers, descriptionNames);
  const amountIndex = headerIndex(headers, amountNames);
  const debitIndex = headerIndex(headers, debitNames);
  const creditIndex = headerIndex(headers, creditNames);
  const typeIndex = headerIndex(headers, typeNames);
  const timeIndex = headerIndex(headers, timeNames);
  const existing = new Set(state.transactions.map((transaction) => transaction.importFingerprint || makeFingerprint(transaction.date, transaction.amount, transaction.description, transaction.accountId)));

  return lines.slice(start).map((line, index) => {
    const cells = splitCSVLine(line, delimiter);
    const rawDate = cells[dateIndex >= 0 ? dateIndex : 0] || "";
    const normalizedDate = normalizeDate(rawDate);
    if (timeIndex >= 0 && cells[timeIndex]) normalizedDate.time = cells[timeIndex].slice(0, 5);
    const originalDescription = cells[descriptionIndex >= 0 ? descriptionIndex : 1] || "Movimentação importada";
    let signedAmount = amountIndex >= 0 ? parseMoney(cells[amountIndex]) : 0;
    if (!signedAmount && debitIndex >= 0) signedAmount = -Math.abs(parseMoney(cells[debitIndex]));
    if (!signedAmount && creditIndex >= 0) signedAmount = Math.abs(parseMoney(cells[creditIndex]));
    const type = typeIndex >= 0 ? normalize(cells[typeIndex]) : "";
    const kind = signedAmount < 0 || /debito|saida|despesa/.test(type) ? "expense" as const : "income" as const;
    const amount = Math.abs(signedAmount);
    const fingerprint = makeFingerprint(normalizedDate.date, amount, originalDescription, accountId);
    const details = importDetails(originalDescription, kind, state);
    return {
      tempId: "csv-" + index + "-" + Date.now(),
      selected: amount > 0 && !existing.has(fingerprint),
      duplicate: existing.has(fingerprint),
      kind,
      ...details,
      amount,
      date: normalizedDate.date,
      time: normalizedDate.time,
      accountId,
      source: "csv" as const,
      fingerprint,
    };
  }).filter((item) => item.amount > 0);
};

const getOFXTag = (block: string, tag: string) => {
  const match = block.match(new RegExp("<" + tag + ">([^<\\r\\n]+)", "i"));
  return match?.[1]?.trim() || "";
};

const parseOFX = (content: string, state: AppState, accountId: string): ImportCandidate[] => {
  const blocks = content.split(/<STMTTRN>/i).slice(1);
  const existing = new Set(state.transactions.map((transaction) => transaction.importFingerprint || makeFingerprint(transaction.date, transaction.amount, transaction.description, transaction.accountId)));
  return blocks.map((block, index) => {
    const signedAmount = parseMoney(getOFXTag(block, "TRNAMT"));
    const rawDate = getOFXTag(block, "DTPOSTED") || getOFXTag(block, "DTUSER");
    const normalizedDate = normalizeDate(rawDate);
    const originalDescription = getOFXTag(block, "MEMO") || getOFXTag(block, "NAME") || getOFXTag(block, "TRNTYPE") || "Movimentação importada";
    const amount = Math.abs(signedAmount);
    const kind = signedAmount < 0 ? "expense" as const : "income" as const;
    const fingerprint = makeFingerprint(normalizedDate.date, amount, originalDescription, accountId);
    const details = importDetails(originalDescription, kind, state);
    return {
      tempId: "ofx-" + index + "-" + Date.now(),
      selected: amount > 0 && !existing.has(fingerprint),
      duplicate: existing.has(fingerprint),
      kind,
      ...details,
      amount,
      date: normalizedDate.date,
      time: normalizedDate.time,
      accountId,
      source: "ofx" as const,
      fingerprint,
    };
  }).filter((item) => item.amount > 0);
};

export const parseStatement = (filename: string, content: string, state: AppState, accountId: string): ImportCandidate[] => {
  const extension = filename.toLowerCase().split(".").pop();
  if (extension === "ofx" || extension === "qfx" || /<OFX>|<STMTTRN>/i.test(content)) return parseOFX(content, state, accountId);
  return parseCSV(content, state, accountId);
};
