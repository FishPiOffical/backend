/** 配置序列化保留未知字段与值类型，拒绝静默吞掉损坏的历史配置。 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }
export function parseObject(value: unknown): JsonObject {
  const parsed = typeof value === 'string' ? JSON.parse(value || '{}') : value ?? {}
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('配置必须是对象')
  return JSON.parse(JSON.stringify(parsed)) as JsonObject
}
export function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
export function mergeBenefits(template: unknown, current: unknown): JsonObject {
  return { ...parseObject(template), ...parseObject(current) }
}
export function vipLevelPayload(value: JsonObject, benefits: JsonObject) {
  if (!String(value.lvCode || '').trim() || !String(value.lvName || '').trim() || !String(value.durationType || '').trim()) throw new Error('请填写等级代码、名称和周期类型')
  const price = Number(value.price)
  const days = Number(value.durationValue)
  if (!Number.isFinite(price) || price < 0 || !Number.isSafeInteger(days) || days < 1) throw new Error('积分价格不得为负，有效天数必须是正整数')
  return { lvCode: String(value.lvCode).trim(), lvName: String(value.lvName).trim(), price, durationType: String(value.durationType).trim(), durationValue: days, benefits: JSON.stringify(benefits) }
}
