// 单一数据源：站点/国家 列表与国旗 URL。
// 供 Market 站点选择器、各分析工具的国家选择、Listing 工作台站点选择等复用。

export const FLAG_URL = (code: string) =>
  `https://flagcdn.com/w20/${code === "UK" ? "gb" : code.toLowerCase()}.png`;

export interface Marketplace {
  code: string;
  name: string;
}

export const MARKETPLACES: Marketplace[] = [
  { code: "US", name: "美国" },
  { code: "UK", name: "英国" },
  { code: "DE", name: "德国" },
  { code: "FR", name: "法国" },
  { code: "CA", name: "加拿大" },
  { code: "JP", name: "日本" },
  { code: "ES", name: "西班牙" },
  { code: "IT", name: "意大利" },
  { code: "MX", name: "墨西哥" },
  { code: "AU", name: "澳大利亚" },
];

const NAME_BY_CODE: Record<string, string> = Object.fromEntries(
  MARKETPLACES.map((m) => [m.code, m.name]),
);

/** 由站点代码数组生成 SheetSelect 选项（带国旗、中文名作为副标题）。 */
export function marketplaceOptions(codes: string[] = MARKETPLACES.map((m) => m.code)) {
  return codes.map((code) => ({
    value: code,
    label: code,
    sub: NAME_BY_CODE[code] || "",
    flag: FLAG_URL(code),
  }));
}
