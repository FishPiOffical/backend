import { clone, parseObject, type JsonObject } from './configuration'
export const newLevel = (index = 0): JsonObject => ({ levelCode: `level${index + 1}`, sortOrder: index, requiredTotalExperience: index * 100, displayName: `等级 ${index + 1}`, shortName: '', description: '', achievementDescription: '', isTopLevel: true, presentations: [], rewards: [] })
export function schemeDraft(source: Record<string, unknown>, professionId: string, revisionId: string): JsonObject {
  const levels = Array.isArray(source.levels) ? source.levels as Record<string, unknown>[] : [newLevel()]
  return { professionId, professionRevisionId: String(source.professionRevisionId || revisionId), migrationPolicy: String(source.migrationPolicy || 'NEW_USERS_ONLY'), rewardMigrationPolicy: String(source.rewardMigrationPolicy || 'NO_GRANT'), migrationConfig: parseObject(source.migrationConfigJson), levels: levels.map((level, i) => ({ ...newLevel(i), ...Object.fromEntries(['levelCode', 'sortOrder', 'requiredTotalExperience', 'displayName', 'shortName', 'description', 'achievementDescription', 'isTopLevel'].filter(k => level[k] !== undefined).map(k => [k, level[k]])), presentations: ((level.presentations || []) as Record<string, unknown>[]).map(p => ({ positionCode: String(p.positionCode), lightConfig: parseObject(p.lightConfigJson), darkConfig: parseObject(p.darkConfigJson) })), rewards: ((level.rewards || []) as Record<string, unknown>[]).map(r => ({ rewardCode: String(r.rewardCode), rewardType: String(r.rewardType), grantPolicy: String(r.grantPolicy || 'FIRST_REACH'), downgradePolicy: String(r.downgradePolicy || 'KEEP'), sortOrder: Number(r.sortOrder || 0), rewardConfig: parseObject(r.rewardConfigJson) })) } as JsonObject)) }
}
export function schemePayload(draft: JsonObject): JsonObject {
  const result = clone(draft)
  const levels = result.levels as JsonObject[]
  if (!result.professionId || !result.professionRevisionId) throw new Error('请选择职业定义版本')
  if (!levels.length || levels.length > 100) throw new Error('等级数量必须在 1–100 之间')
  const codes = new Set<string>(), orders = new Set<number>(); let previous = -1
  for (const [i, l] of levels.entries()) {
    const code = String(l.levelCode), order = Number(l.sortOrder), xp = Number(l.requiredTotalExperience)
    if (!/^[a-z][a-z0-9._-]{0,63}$/.test(code) || codes.has(code)) throw new Error('等级代码格式错误或重复')
    if (!String(l.displayName || '').trim()) throw new Error('请填写等级名称')
    if (!Number.isSafeInteger(order) || order < 0 || orders.has(order)) throw new Error('等级排序必须是不重复的非负整数')
    if (!Number.isSafeInteger(xp) || xp < 0 || xp <= previous || (i === 0 && xp !== 0)) throw new Error('经验门槛必须从 0 开始严格递增')
    if (Boolean(l.isTopLevel) !== (i === levels.length - 1)) throw new Error('只有最后一个等级可标记为顶级')
    codes.add(code); orders.add(order); previous = xp
    l.presentations = (l.presentations as JsonObject[]).map(p => ({ positionCode: p.positionCode!, lightConfigJson: JSON.stringify(p.lightConfig), darkConfigJson: JSON.stringify(p.darkConfig) }))
    l.rewards = (l.rewards as JsonObject[]).map(r => { const { rewardConfig, ...rest } = r; return { ...rest, rewardConfigJson: JSON.stringify(rewardConfig) } })
  }
  result.migrationConfigJson = JSON.stringify(result.migrationConfig); delete result.migrationConfig
  return result
}
