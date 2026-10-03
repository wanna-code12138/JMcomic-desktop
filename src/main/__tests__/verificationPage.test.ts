import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isVerificationPageReady } from '../verificationPage'

function page(controls: Array<{text:string;tag?:string;href?:string;visible?:boolean}>, content=true): Document {
  return {
    title:'网站首页',body:{innerText:'普通首页内容'},defaultView:{getComputedStyle:()=>({visibility:'visible',display:'block'})},
    querySelector:()=>content?{}:null,
    querySelectorAll:()=>controls.map(control=>({
      textContent:control.text,tagName:control.tag??'BUTTON',getAttribute:(name:string)=>name==='href'?control.href:null,
      getBoundingClientRect:()=>({width:control.visible===false?0:100,height:30})
    }))
  } as unknown as Document
}

test('visible age confirmation must block readiness even when content exists behind it',()=>{
  assert.equal(isVerificationPageReady(page([{text:'我已滿18歲'}])),false)
  assert.equal(isVerificationPageReady(page([{text:'我已滿18歲',visible:false}])),true)
})
test('ordinary book titles mentioning age are not confirmation controls',()=>{
  assert.equal(isVerificationPageReady(page([{text:'我18岁之后的日记',tag:'A',href:'/album/101'}])),true)
  assert.equal(isVerificationPageReady(page([{text:'我已成年之后的故事',tag:'A',href:'/photo/101'}])),true)
})
test('a long unrelated page is not verification evidence',()=>{
  assert.equal(isVerificationPageReady(page([],false)),false)
})
