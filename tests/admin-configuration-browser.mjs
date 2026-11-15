// 使用本地 Vite + 独立浏览器上下文；所有 API 均为夹具，不接触真实账号和业务数据。
import assert from 'node:assert/strict'
import fs from 'node:fs'
const {chromium} = await import(process.env.ADMIN_PLAYWRIGHT_MODULE || 'playwright-core')
const origin = process.env.ADMIN_TEST_ORIGIN || 'http://127.0.0.1:5186'
const output = process.env.ADMIN_TEST_OUTPUT || '/tmp/admin-configuration-qa'
fs.mkdirSync(output,{recursive:true})
const browser = await chromium.launch({executablePath:process.env.ADMIN_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
const context = await browser.newContext({viewport:{width:1440,height:900}})
const page = await context.newPage(), errors=[], writes=[]
page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept())
const benefits={bold:true,underline:false,checkinCard:3,color:'rainbow',extra:{enabled:false,values:[1,'test']}}
const revision={oId:'r1',status:'PUBLISHED',displayName:'社区探索者',shortName:'探索',description:'参与社区获得成长',defaultPresentationJson:'{}'}
const scheme={oId:'s1',status:'PUBLISHED',professionRevisionId:'r1',migrationPolicy:'NEW_USERS_ONLY',rewardMigrationPolicy:'NO_GRANT',migrationConfigJson:'{}',levels:[{levelCode:'first',displayName:'初见',sortOrder:0,requiredTotalExperience:0,isTopLevel:true,presentations:[],rewards:[]}]}
const detail={oId:'p1',professionCode:'explorer',displayName:'社区探索者',status:'PUBLISHED',revisions:[revision],schemes:[scheme],automations:[]}
await context.route('**/api/v3/**',async route=>{
 const req=route.request(), path=new URL(req.url()).pathname;let data={}
 if(req.method()!=='GET' && !path.includes('/auth/')) writes.push({path,body:req.postDataJSON()})
 if(path.endsWith('/auth/refresh'))data={accessToken:'fixture-only'}
 else if(path==='/api/v3/me')data={id:'fixture',userName:'fixture',userNickname:'测试管理员'}
 else if(path.endsWith('/capabilities'))data={canEnterConsole:true,canAccessAdmin:true,isAdmin:true,isSecurityOperator:true,userName:'fixture',permissions:{},menus:{workbench:true,membershipAssets:true,professionsPets:true,systemSecurity:true},actions:{vipManage:true}}
 else if(path.endsWith('/vip/levels')) data=req.method()==='GET'?{items:[{oId:'vip1',lvCode:'VIP4',lvName:'月度会员',durationType:'MONTH',durationValue:30,price:1000,benefits:JSON.stringify(benefits)}]}:{oId:'vip1'}
 else if(path.endsWith('/vip/users'))data={items:[{userId:'u1',userName:'示例用户',lvCode:'VIP4',state:1,configJson:JSON.stringify(benefits)}],pagination:{page:1,pageSize:20,total:1,totalPages:1}}
 else if(path.endsWith('/coupons'))data={items:[]}
 else if(path.endsWith('/catalog-summary'))data={items:[detail],total:1,page:1,pageSize:20}
 else if(path.endsWith('/professions/p1'))data=detail
 else if(path.endsWith('/definition/metadata'))data={positions:['default','homeProfile'],presets:{shape:['ROUND']}}
 else if(path.endsWith('/automation/metadata'))data={triggers:[{triggerType:'article.created',schemaVersion:1,fields:[{fieldCode:'length',fieldType:'NUMBER',operators:['GT']}]}]}
 else if(path.endsWith('/draft'))data={id:'draft1'}
 else if(path.endsWith('/config/precheck'))data={valid:true,total:1,ready:1}
 else if(path.endsWith('/security/monitor'))data={total:12,last10Minutes:3,retention:'本次启动内，最多保留100条记录',counts:{BLOCK:2,PASS:10},observations:[{time:'10:30',ip:'192.0.2.1',kind:'shield',state:'PASS',detail:'测试观测'}],events:[{time:'10:30',ip:'192.0.2.1',uri:'/example',method:'GET',type:'shield',result:'PASS',reason:'夹具记录'}],crawlers:{groups:[{key:'search',name:'搜索爬虫',verified:true,count:5}],selectedGroup:'search',paths:[{path:'/example',count:5}],sources:[{ip:'192.0.2.2',reason:'DNS 已验证',ptr:'crawler.example',cached:true}],sourceOmitted:0},switches:{firewallEnabled:true,threshold:120,verificationEnabled:true,firstVisitCaptchaEnabled:true,runtimeMode:'PRODUCTION',editable:false}}
 else if(path.endsWith('/security/self-check'))data={status:'PASS',checkedAt:'2026-11-15',runtimeMode:'PRODUCTION',checks:[{name:'路由结构',passed:true,detail:'通过'}],note:'结构自检不替代真实链路测试'}
 await route.fulfill({json:{code:0,data}})
})
try {
 await page.goto(origin+'/manage/assets/vip');await page.getByRole('button',{name:'VIP 等级配置',exact:true}).click();await page.getByRole('button',{name:'编辑套餐与权益',exact:true}).click()
 await page.getByLabel('等级名称',{exact:true}).fill('更新会员');await page.getByRole('button',{name:'保存套餐与权益'}).click();await page.getByText('会员套餐及权益模板已保存').waitFor()
 const vipWrite=writes.find(w=>w.path.endsWith('/vip/levels/vip1'));assert(vipWrite);assert.equal(vipWrite.body.lvName,'更新会员');assert.deepEqual(JSON.parse(vipWrite.body.benefits),benefits)
 await page.screenshot({path:output+'/vip-desktop.png',fullPage:true})
 await page.goto(origin+'/manage/professions');await page.getByRole('button',{name:'版本树',exact:true}).click();await page.getByText('职业版本树详情：p1').waitFor();await page.getByRole('button',{name:'等级方案',exact:true}).click();await page.getByLabel('编辑来源').selectOption('s1')
 await page.getByLabel('累计经验门槛').fill('1');await page.getByRole('button',{name:'保存为新草稿'}).click();await page.getByText('经验门槛必须从 0 开始严格递增').waitFor();assert.equal(writes.filter(w=>w.path.endsWith('/scheme/draft')).length,0)
 await page.getByLabel('累计经验门槛').fill('0');await page.getByRole('button',{name:'添加积分奖励'}).click();await page.getByRole('button',{name:'保存为新草稿'}).click();await page.getByText('草稿已保存：draft1',{exact:false}).waitFor();const write=writes.find(w=>w.path.endsWith('/scheme/draft'));assert.equal(JSON.parse(write.body.levels[0].rewards[0].rewardConfigJson).amount,1)
 await page.screenshot({path:output+'/profession-desktop.png',fullPage:true})
 await page.getByRole('button',{name:'自动化规则',exact:true}).click();await page.getByLabel('规则代码',{exact:true}).fill('article.growth');await page.getByRole('button',{name:'添加经验计算',exact:true}).click();await page.getByRole('button',{name:'保存为新草稿'}).click();await page.getByText('草稿已保存：draft1',{exact:false}).waitFor();const automation=writes.find(w=>w.path.endsWith('/automation/draft'));assert.equal(JSON.parse(automation.body.configurationJson).actions[0].calculator.calculatorType,'FIXED')
 await page.getByRole('button',{name:'职业定义',exact:true}).click();await page.getByLabel('编辑来源').selectOption('r1');await page.getByRole('button',{name:'保存为新草稿'}).click();await page.getByText('草稿已保存：draft1',{exact:false}).waitFor();assert.equal(writes.find(w=>w.path.endsWith('/definition/draft')).body.professionCode,'explorer')

 const input=page.getByPlaceholder('粘贴职业配置 JSON');await input.fill('{}');await page.getByRole('button',{name:'1. 导入预检'}).click();await page.getByText('预检完成，请核对差异后再执行导入').waitFor();assert(await page.getByRole('button',{name:'2. 确认导入'}).isEnabled());await input.fill('{"changed":true}');assert(await page.getByRole('button',{name:'2. 确认导入'}).isDisabled())
 await page.goto(origin+'/manage/system/security-tools');await page.getByRole('heading',{name:'请求事件',exact:true}).waitFor();assert(await page.getByRole('button',{name:'保存临时开关'}).isDisabled());await page.getByRole('button',{name:'执行安全自检'}).click();await page.getByText('路由结构',{exact:true}).waitFor();await page.getByLabel('事件关键词').fill('not-found');assert(await page.getByText('当前快照暂无记录',{exact:true}).count()>0)
 for(const width of [1440,1024,768,390]) { await page.setViewportSize({width,height:900});for(const theme of ['classic-light','classic-dark']) {await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.screenshot({path:`${output}/security-${width}-${theme}.png`,fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`security overflow ${width}`)}}
 for(const path of ['assets/vip','professions']) {await page.goto(origin+'/manage/'+path);await page.waitForTimeout(200);if(path==='assets/vip') await page.getByRole('button',{name:'VIP 等级配置',exact:true}).click();await page.screenshot({path:`${output}/${path.replace('/','-')}-mobile.png`,fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${path} overflow`)}
 assert.deepEqual(errors,[]);console.log('PASS: 浏览器表单提交、真实字段、方案校验、预检失效、监控自检、生产只读、四宽度明暗主题；无页面异常')
} catch(error) { await page.screenshot({path:output+'/failure.png',fullPage:true});console.error(await page.locator('body').innerText());throw error } finally { await browser.close() }
