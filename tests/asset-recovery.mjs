import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'

// 运行真实恢复模块，网络边界注入可控的断流和身份变化。
const httpSource = ts.createSourceFile('http.ts', fs.readFileSync('src/api/http.ts', 'utf8'), ts.ScriptTarget.Latest, true)
const errorHelpers = httpSource.statements.filter(node => ['ApiError', 'isUnknownOutcomeError'].includes(node.name?.text)).map(node => node.getText(httpSource)).join('\n')
assert.equal(httpSource.statements.filter(node => ['ApiError', 'isUnknownOutcomeError'].includes(node.name?.text)).length, 2)
const realErrors = ts.transpileModule(errorHelpers, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const mock = `
${realErrors}
export let version=0; let listener; export const calls=[]; let fail=true; let failure=new ApiError('断流',502,'network',undefined,true);
export function getAuthContextVersion(){return version}
export function onAccessTokenChange(fn){listener=fn}
export function identityChange(){version++;listener()}
export function refresh(){listener()}
export function succeed(){fail=false}
export function reset(){fail=true}
export function setFailure(error){fail=true;failure=error}
export async function requestData(path,options){calls.push({path,options});if(fail)throw failure;return {successCount:1,results:[{success:true}]}}
`
const mockUrl = 'data:text/javascript;base64,' + Buffer.from(mock).toString('base64')
const source = fs.readFileSync('src/stores/assetRecovery.ts','utf8')
  .replace("'vue'", JSON.stringify(import.meta.resolve('vue')))
  .replace("'@/api/http'", JSON.stringify(mockUrl))
const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const recovery = await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'))
const network = await import(mockUrl)
const options = {method:'POST',idempotentWrite:true,headers:{'Idempotency-Key':'original'},body:JSON.stringify({amount:10})}
await assert.rejects(recovery.assetRequestData('/api/v3/admin/points/charge', options))
options.body = JSON.stringify({amount:999})
assert.ok(recovery.pendingAssetWrite.value)
await assert.rejects(recovery.assetRequestData('/api/v3/admin/salary/pay', options))
assert.equal(network.calls.length,1)
network.refresh()
assert.ok(recovery.pendingAssetWrite.value)
await recovery.recoverAssetWrite()
assert.ok(recovery.pendingAssetWrite.value)
network.succeed()
await recovery.recoverAssetWrite()
assert.equal(network.calls.at(-1).options.headers.get('Idempotency-Key'),'original')
assert.equal(JSON.parse(network.calls.at(-1).options.body).amount,10)
assert.equal(recovery.pendingAssetWrite.value,null)
assert.equal(recovery.assetRecoveryReceipt.value.successCount,1)
network.reset()
await assert.rejects(recovery.assetRequestData('/api/v3/admin/vip/users', options))
network.identityChange()
assert.equal(recovery.pendingAssetWrite.value,null)
assert.equal(recovery.assetRecoveryReceipt.value,null)
network.setFailure(new network.ApiError('结果未知',409,'operation_outcome_unknown'))
await assert.rejects(recovery.assetRequestData('/api/v3/admin/fish-games/import', options))
assert.ok(recovery.pendingAssetWrite.value)
network.refresh()
assert.ok(recovery.pendingAssetWrite.value)
network.succeed()
await recovery.recoverAssetWrite()
assert.equal(recovery.pendingAssetWrite.value,null)
assert.equal(network.calls.at(-1).path,'/api/v3/admin/fish-games/import')
assert.equal(network.calls.at(-1).options.headers.get('Idempotency-Key'),'original')
console.log('PASS: 未知结果保留、阻止新操作、刷新保留、重复恢复、原键与正文快照、批量回执、换号清理')
