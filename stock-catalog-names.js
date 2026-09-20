export function attachCatalogNames(products, records) {
  if (!Array.isArray(products) || !Array.isArray(records)) throw new Error("型錄格式不正確");
  const byId = new Map(records.map(record => [record.recordId, record]));
  if (byId.size !== records.length || byId.size !== products.length) throw new Error("型錄筆數或 ID 不一致");
  return products.map(product => {
    const name = byId.get(product.recordId);
    if (!name || name.chineseName !== product.displayNameZh ||
        ![product.productCode, product.officialProductCode].includes(name.model) || !name.englishName) {
      throw new Error(`型錄名稱無法對應：${product.recordId}`);
    }
    return { ...product, displayNameEn: name.englishName };
  });
}

export function getOfficialStockCode(product) {
  return product?.officialProductCode === "CX-19"
    ? "CX-19"
    : product?.productCode || "";
}

export function getStockCatalogLabel(product) {
  const code = getOfficialStockCode(product);
  const name = product?.displayNameZh || "";
  // Keep the four CX-00 Chinese-only cards from the existing display policy.
  const english = code === "CX-19" ? product?.displayNameEn : "";
  return [code, name + (english ? `／${english}` : "")].filter(Boolean).join(" ");
}

export function getStockVariantLabel(product) {
  return getOfficialStockCode(product) === "CX-19"
    ? `（顏色 ${String(product.variantIndex || "").padStart(2, "0")}）`
    : "";
}
