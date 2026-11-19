const riskOperations = new Map<string, string>(Object.entries({
  adoption: '领养宠物',
  readoption: '重新领养',
  'story-claim': '领取事件奖励',
  name: '宠物改名',
  action: '日常照顾',
  supplies: '领取每日补给',
  purchase: '购买宠物道具',
  coffee: '购买宠物咖啡',
  craft: '制作道具',
  'activity-start': '开始活动',
  'activity-claim': '领取活动奖励',
  'brawl-fight': '发起历练战斗',
  'brawl-upgrade': '强化武器',
  'brawl-enroll': '报名宠物乱斗',
  'brawl-match': '匹配乱斗对手',
  'brawl-quote': '获取强化报价',
  'brawl-confirm': '确认强化订单',
  'brawl-socket': '调整装备镶嵌',
  'brawl-season-claim': '领取乱斗赛季奖励',
  'brawl-invite': '发起好友约战',
  'brawl-invite-decision': '处理好友约战邀请',
  'parking-start': '开始停车',
}))

const riskReasons = new Map<string, string>(Object.entries({
  rate_limited: '操作过于频繁，触发账号限流',
  verification_required: '需要完成安全验证',
  challenge_issued: '已发起安全验证',
  verification_passed: '安全验证通过',
  verification_failed: '安全验证失败',
  verification_unavailable: '安全验证服务暂不可用',
  idempotency_conflict: '同一请求编号对应了不同操作内容',
  幂等键冲突: '同一请求编号对应了不同操作内容',
  coffee_off_sale: '宠物咖啡已下架',
  coffee_price_changed: '宠物咖啡价格已变更',
  coffee_daily_limit: '今日咖啡购买次数已用完',
  date_changed: '日期已变更，请刷新后重试',
  care_cooldown: '照顾操作仍在冷却',
  already_full: '对应属性已满',
  not_enough_energy: '宠物精力不足',
  not_enough_coins: '游园币余额不足',
  not_enough_hunger: '宠物饱食度不足',
  not_enough_water: '宠物水分不足',
  not_enough_items: '所需道具数量不足',
  not_enough_food: '口粮数量不足',
  income_limit: '已达到今日活动收益上限',
  activity_running: '活动仍在进行',
  activity_claimed: '活动奖励已领取',
  supply_claimed: '今日补给已登记领取',
  pet_resting: '宠物正在休息',
  pet_busy: '宠物正在进行其他活动',
  story_claimed: '事件奖励已领取',
  collection_owned: '已拥有该收藏',
  brawl_season_open: '乱斗赛季尚未结算',
  brawl_season_unranked: '本赛季没有有效排名',
  brawl_level_locked: '宠物等级未达到乱斗要求',
  brawl_stage_locked: '历练关卡尚未解锁',
  brawl_stale_level: '武器强化等级已变更',
  brawl_materials: '强化材料不足',
  brawl_version_changed: '乱斗配置版本已更新',
  brawl_profile_changed: '出战配置已变更',
  brawl_pvp_limit: '今日乱斗匹配次数已用完',
  brawl_no_opponent: '暂时没有符合条件的对手',
  brawl_quote_expired: '强化报价已过期',
  brawl_quote_changed: '强化报价已变更',
  insufficient_points: '站点积分不足',
  brawl_gear_changed: '装备配置已变更',
  brawl_gear_unowned: '尚未拥有该装备',
  brawl_slot_locked: '镶嵌槽位尚未解锁',
  brawl_gem_in_use: '配件已镶嵌在其他武器上',
  brawl_artifact_locked: '武器尚未达到神器进阶要求',
  brawl_equipment_unavailable: '武器或招式不适用于当前宠物',
}))

export function petRiskOperationLabel(value: string) {
  return riskOperations.get(value) ?? readableLabel(value, '未知操作')
}

export function petRiskReasonLabel(value: string) {
  const label = riskReasons.get(value.replace(/^business_/, ''))
  if (label) return value.startsWith('business_') ? `业务未完成 · ${label}` : label
  return readableLabel(value, '未识别原因')
}

function readableLabel(value: string, fallback: string) {
  if (!value) return '—'
  return /^[a-z0-9_-]+$/i.test(value) ? `${fallback}（${value}）` : value
}
