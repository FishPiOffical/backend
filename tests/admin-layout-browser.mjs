// 使用本地 Vite + 独立浏览器上下文；所有 API 均为夹具，不接触真实账号和业务数据。
import assert from 'node:assert/strict'
import fs from 'node:fs'
const {chromium} = await import(process.env.ADMIN_PLAYWRIGHT_MODULE || 'playwright-core')
const origin = process.env.ADMIN_TEST_ORIGIN || 'http://127.0.0.1:5186'
const output = process.env.ADMIN_TEST_OUTPUT || '/tmp/admin-configuration-qa'
fs.mkdirSync(output,{recursive:true})
const browser = await chromium.launch({executablePath:process.env.ADMIN_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
const context = await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'})
const page = await context.newPage(), errors=[], writes=[]
page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept())
const benefits={bold:true,underline:false,checkinCard:3,color:'rainbow',extra:{enabled:false,values:[1,'test']}}
const revision={oId:'r1',status:'PUBLISHED',displayName:'社区探索者',shortName:'探索',description:'参与社区获得成长',defaultPresentationJson:'{}'}
const scheme={oId:'s1',status:'PUBLISHED',professionRevisionId:'r1',migrationPolicy:'NEW_USERS_ONLY',rewardMigrationPolicy:'NO_GRANT',migrationConfigJson:'{}',levels:[{levelCode:'first',displayName:'初见',sortOrder:0,requiredTotalExperience:0,isTopLevel:true,presentations:[],rewards:[]}]}
const detail={oId:'p1',professionCode:'explorer',displayName:'社区探索者',status:'PUBLISHED',revisions:[revision],schemes:[scheme],automations:[]}
await context.route('**/api/v3/**',async route=>{
 const req=route.request(), path=new URL(req.url()).pathname;let data={items:[],list:[],rows:[],options:[],permissions:[],roleOptions:[],operations:{},pagination:{p:1,size:20,total:0,pageCount:1,page:1,pageSize:20,totalPages:1},page:1,total:0,canManageAdminPerms:true,meta:{statsNote:'夹具统计'},communityStats:{},capabilities:{menus:{},actions:{},permissions:{}},todos:{},stats:{},runtime:{},recentOperations:[],quickLinks:[],counts:{},settings:{},firewallEnabled:false,threshold:120}
 if(path.endsWith('/roles'))assert(Number(new URL(req.url()).searchParams.get('size'))<=50,'角色列表超过后端分页上限');
 if(req.method()!=='GET' && !path.includes('/auth/')) writes.push({path,body:req.postDataJSON()})
 if(path.endsWith('/auth/refresh'))data={accessToken:'fixture-only'}
 else if(path==='/api/v3/me')data={id:'fixture',userName:'fixture',userNickname:'测试管理员'}
 else if(path.endsWith('/capabilities'))data={canEnterConsole:true,canAccessAdmin:true,isAdmin:true,isSecurityOperator:true,userName:'fixture',permissions:Object.fromEntries(['menuAdmin','menuAdminReports','menuAdminUsers','menuAdminArticles','menuAdminComments','menuAdminBreezemoons','menuAdminRoles','menuAdminIcs','menuAdminMisc','menuAdminMilestone','menuAdminDomains','menuAdminTags','menuAdminRWs','menuAdminAD','ipManage','userGiveMetal','userRemoveMetal','articleReindexArticleIndex','articleReindexArticlesIndex'].map(k=>[k,true])),isIdentityReviewer:true,menus:{workbench:true,review:true,users:true,content:true,communityOps:true,openPlatform:true,membershipAssets:true,professionsPets:true,systemSecurity:true},actions:{vipManage:true}}
 else if(path.endsWith('/identity-applications'))data={list:[{id:'review1',type:'enterprise',status:'pending',createdAt:1,materialReadAt:1,reviewedAt:0,note:''}],pagination:{p:1,size:20,total:1,pageCount:1}}
 else if(path.endsWith('/fish-games'))data={items:[{oId:'fish1',fishGameName:'本地待审鱼游',fishGameTag:'示例',fishGameStatus:0,fishGameEditPending:0,fishGameUrl:'https://example.com/game',fishGameDescription:'布局测试'}],pagination:{page:1,pageSize:20,total:1,totalPages:1}}
 else if(path.endsWith('/roles'))data={pagination:{page:1,pageSize:50,total:1,totalPages:1},items:[{oId:'testRole',roleName:'测试角色',roleDescription:'用于长字段测试',userCount:1,removable:true}],canManageAdminPerms:true}
 else if(path.endsWith('/roles/testRole/permissions'))data={items:[{oId:'permission.read.long.value',permissionCategory:1,categoryLabel:'管理权限',permissionLabel:'查看内容和长说明文字测试'.repeat(5),permissionGrant:true,adminOnly:false}],canManageAdminPerms:true,role:{oId:'testRole'}}
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
const paths=['workbench','review/reports','review/identity','review/fish-games','review/milestones','review/images','users','users/test-user','users/roles','users/invitecodes','content/articles','content/articles/new','content/articles/test-article','content/comments','content/breezemoons','assets/vip','assets/medals','assets/points-bags','ops/domains-tags','ops/reserved-ad','ops/community-records','oauth/clients','professions','professions/pet-logs','system/site-settings','system/security-tools','system/audit-logs'];const report=[];
try {
for(const route of paths){
 const start=errors.length;await page.setViewportSize({width:1920,height:1080});await page.goto(origin+'/manage/'+route);await page.waitForTimeout(180);
 if(route==='users/roles'){await page.getByRole('button',{name:'配置权限',exact:true}).click();await page.locator('.perm-item').first().waitFor()}
 if(['users','users/test-user','users/roles','users/invitecodes'].includes(route)){const active=await page.locator('.shell-nav__item.is-active').evaluateAll(es=>es.map(e=>new URL(e.href).pathname));const expected=route==='users/test-user'?'users':route;assert.deepEqual(active,['/manage/'+expected],`${route} menu selection`)}
 const desktop=await page.evaluate(()=>{const content=document.querySelector('.shell-content__inner');const child=content?.lastElementChild;return {overflow:document.documentElement.scrollWidth>innerWidth,content:content?.getBoundingClientRect().width,child:child?.getBoundingClientRect().width,text:document.body.innerText.slice(-250),checkboxes:[...document.querySelectorAll('input[type=checkbox],input[type=radio]')].map(e=>({type:e.type,name:e.name,w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height,label:e.closest('label')?.getBoundingClientRect().height,disabled:e.disabled}))}});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(50);const mobile=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,offenders:[...document.querySelectorAll('body *')].filter(e=>{let r=e.getBoundingClientRect();return r.width>0&&r.right>innerWidth+2&&!e.closest('.admin-table-wrap,.shell-sidebar,pre')}).slice(0,8).map(e=>e.tagName+'.'+e.className)}));
 report.push({route,desktop,mobile,errors:errors.slice(start)});
 if(['review/identity','users/roles','assets/points-bags','system/site-settings','review/images'].includes(route)){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:output+'/audit-'+route.replaceAll('/','-')+'-mobile.png',fullPage:true})}
}
// 验证原生单选框方向键分组，夹具材料已读，不请求一次性材料。
await page.goto(origin+'/manage/review/identity');await page.locator('input[type=radio]').first().focus();await page.keyboard.press('ArrowRight');report.push({radioArrowNavigation:await page.locator('input[type=radio]').evaluateAll(es=>es.map(e=>({name:e.name,checked:e.checked,value:e.value})))})
await page.goto(origin+'/manage/assets/vip');await page.getByRole('button',{name:'VIP 等级配置',exact:true}).click();await page.getByRole('button',{name:'编辑套餐与权益',exact:true}).click();await page.locator('input[type=checkbox]').first().focus();const checkedBefore=await page.locator('input[type=checkbox]').first().isChecked();await page.keyboard.press('Space');report.push({checkboxSpaceToggle:checkedBefore !== await page.locator('input[type=checkbox]').first().isChecked()});

for(const row of report.filter(r=>r.route)) {assert.deepEqual(row.errors,[],`${row.route} render`);assert(!row.mobile.overflow,`${row.route} mobile overflow`);assert(row.desktop.content>1440,`${row.route} content cap`)}
assert(report.find(r=>r.checkboxSpaceToggle)?.checkboxSpaceToggle)
await page.goto(origin+'/manage/review/identity');const choiceHeight=await page.locator('.admin-choice').first().evaluate(e=>e.getBoundingClientRect().height);assert(choiceHeight>=44,`choice target ${choiceHeight}`);assert.equal(await page.locator('input[type=radio]').first().getAttribute('name'),'identity-decision')
await page.goto(origin+'/manage/users/roles');await page.getByRole('button',{name:'测试角色',exact:true}).click();await page.locator('.perm-content').waitFor();const permissionWidth=await page.locator('.perm-content').evaluate(e=>e.getBoundingClientRect().width);assert(permissionWidth>180,`permission description squeezed ${permissionWidth}`)
await page.goto(origin+'/manage/review/images');await page.getByText('45 天内暂无待审核图片',{exact:true}).waitFor()
// 非空列表且未选详情时必须铺满，打开／关闭详情后重新分配宽度。
for(const width of [1920,1440,1024,768,390]) {
 await page.setViewportSize({width,height:900});await page.goto(origin+'/manage/review/fish-games');await page.getByRole('button',{name:'查看 / 审核',exact:true}).waitFor();
 const widths=await page.locator('.split-layout').evaluate(e=>({layout:e.getBoundingClientRect().width,list:e.querySelector('.admin-table-wrap').getBoundingClientRect().width}));assert(Math.abs(widths.layout-widths.list)<2,`fish empty detail width ${width}`)
 if(width===1440)await page.screenshot({path:output+'/fish-list-full-width.png',fullPage:true})
 await page.getByRole('button',{name:'查看 / 审核',exact:true}).click();await page.getByRole('button',{name:'关闭详情',exact:true}).waitFor();assert(!(await page.locator('.split-layout').getAttribute('class')).includes('is-single-column'));
 await page.getByRole('button',{name:'关闭详情',exact:true}).click();assert((await page.locator('.split-layout').getAttribute('class')).includes('is-single-column'))
 await page.goto(origin+'/manage/content/articles');await page.locator('.al-keyword-input').waitFor();
 if(width>=1440){const rects=await page.locator('.admin-filters').evaluate(e=>[e.querySelector('select'),e.querySelector('input'),e.querySelector('button[type=submit]')].map(x=>{const r=x.getBoundingClientRect();return {bottom:r.bottom,height:r.height}}));assert(Math.max(...rects.map(r=>r.bottom))-Math.min(...rects.map(r=>r.bottom))<2,`article filter alignment ${width}`)}
 if(width===1440)await page.screenshot({path:output+'/article-filter-aligned.png',fullPage:true})
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`article filter overflow ${width}`)
}
// 搜索区不重复展示 placeholder 标题，且同一套宽度／间距规则覆盖各列表。
for(const route of ['content/articles','content/comments','content/breezemoons','system/audit-logs','users']) {
 for(const width of [1440,390]) {await page.setViewportSize({width,height:900});await page.goto(origin+'/manage/'+route);await page.locator('.admin-filters,.admin-search-bar').first().waitFor();
 const labels=await page.locator('label.admin-field').evaluateAll(es=>es.filter(e=>e.querySelector('[placeholder]')&&e.querySelector('.admin-field__label')&&!e.querySelector('.admin-field__label').classList.contains('admin-sr-only')).length);assert.equal(labels,0,`${route} duplicate label`)
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${route} search overflow`)
 await page.screenshot({path:output+`/search-${route.replaceAll('/','-')}-${width}.png`,fullPage:true})
 }
}
console.log('PASS: 搜索重复标题移除及五个列表的桌面／手机搜索布局')
console.log('PASS: 非空鱼游列表／详情切换及五种宽度，文章筛选控件底边对齐')
console.log('PASS: 27 路由满宽与手机布局、选择控件触控、原生键盘、角色长权限与名称入口、空状态文案')

fs.writeFileSync(output+'/all-pages-audit.json',JSON.stringify(report,null,2));/*console.log(JSON.stringify(report.map(r=>r.route?{route:r.route,desktopOverflow:r.desktop.overflow,content:r.desktop.content,child:r.desktop.child,mobile:r.mobile,errors:r.errors}:r),null,2));*/
} finally {await browser.close()}
