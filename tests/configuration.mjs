import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64')
const configUrl = moduleUrl(fs.readFileSync('src/utils/configuration.ts','utf8'))
const {parseObject, mergeBenefits, vipLevelPayload} = await import(configUrl)
const {schemeDraft,schemePayload} = await import(moduleUrl(fs.readFileSync('src/utils/professionConfiguration.ts','utf8').replace("'./configuration'",JSON.stringify(configUrl))))
const benefits = {bold:false,checkinCard:0,color:'rainbow',extension:{items:[1,false,null,'保留']}}
assert.deepEqual(parseObject(JSON.stringify(benefits)),benefits)
assert.throws(()=>parseObject('[]'));assert.throws(()=>parseObject('{invalid'))
assert.deepEqual(mergeBenefits({bold:true,extra:1},benefits),{extra:1,...benefits})
const vip = vipLevelPayload({lvCode:' VIP4 ',lvName:'会员',price:0,durationType:'MONTH',durationValue:30},benefits)
assert.equal(vip.lvCode,'VIP4');assert.deepEqual(JSON.parse(vip.benefits),benefits);assert.equal(vip.durationValue,30)
assert.throws(()=>vipLevelPayload({...vip,durationValue:0},benefits))
const source={professionRevisionId:'r1',migrationConfigJson:'{}',levels:[{levelCode:'first',sortOrder:0,requiredTotalExperience:0,displayName:'起点',isTopLevel:true,presentations:[{positionCode:'default',lightConfigJson:'{"primaryColor":"#000000"}',darkConfigJson:'{}'}],rewards:[{rewardCode:'point',rewardType:'POINT',rewardConfigJson:'{"amount":5,"memo":"首次"}',grantPolicy:'FIRST_REACH',downgradePolicy:'KEEP',sortOrder:0}]}]}
const draft=schemeDraft(source,'p1','r2'),before=JSON.stringify(draft),payload=schemePayload(draft)
assert.equal(JSON.stringify(draft),before)
assert.equal(payload.levels[0].rewards[0].rewardConfigJson,'{"amount":5,"memo":"首次"}')
assert.equal(payload.levels[0].presentations[0].lightConfigJson,'{"primaryColor":"#000000"}')
assert.deepEqual(schemePayload(schemeDraft(payload,'p1','r1')),payload)
for (const mutate of [d=>{d.levels=[]},d=>{d.levels[0].requiredTotalExperience=1},d=>{d.levels[0].isTopLevel=false},d=>{d.levels[0].levelCode='Invalid'},d=>{d.professionRevisionId=''}]) {const d=structuredClone(draft);mutate(d);assert.throws(()=>schemePayload(d))}
console.log('PASS: VIP 真实字段、复杂权益类型、损坏配置拦截、方案往返无损与门槛/顶级校验')
