import { BrowserWindow } from 'electron'

// ─── 从阅读器 ReaderPage.tsx 完整照搬的反打乱算法 ─────────────────
// 该 HTML 页面在隐藏 BrowserWindow 中运行，与阅读器使用完全相同的
// Canvas drawImage 逻辑，确保结果逐像素一致。

function buildDescrambleHtml(): string {
  return `<!DOCTYPE html><html><body>
<canvas id="c" style="display:none"></canvas>
<img id="img" style="display:none" crossorigin="anonymous" />
<script>
// ── MD5（与 ReaderPage.tsx 完全一致）────────────────
function md5(str) {
  function safeAdd(x, y) { var lsw=(x&0xffff)+(y&0xffff); var msw=(x>>16)+(y>>16)+(lsw>>16); return (msw<<16)|(lsw&0xffff) }
  function bitRol(num, cnt) { return (num<<cnt)|(num>>>(32-cnt)) }
  function cmn(q, a, b, x, s, t) { return safeAdd(bitRol(safeAdd(safeAdd(a,q),safeAdd(x,t)),s),b) }
  function ff(a,b,c,d,x,s,t){return cmn((b&c)|(~b&d),a,b,x,s,t)}
  function gg(a,b,c,d,x,s,t){return cmn((b&d)|(c&~d),a,b,x,s,t)}
  function hh(a,b,c,d,x,s,t){return cmn(b^c^d,a,b,x,s,t)}
  function ii(a,b,c,d,x,s,t){return cmn(c^(b|~d),a,b,x,s,t)}
  function binlMD5(x,len){
    x[len>>5]|=0x80<<(len%32); x[(((len+64)>>>9)<<4)+14]=len;
    var a=1732584193,b=-271733879,c=-1732584194,d=271733878;
    for(var i=0;i<x.length;i+=16){
      var oa=a,ob=b,oc=c,od=d;
      a=ff(a,b,c,d,x[i],7,-680876936); d=ff(d,a,b,c,x[i+1],12,-389564586); c=ff(c,d,a,b,x[i+2],17,606105819); b=ff(b,c,d,a,x[i+3],22,-1044525330);
      a=ff(a,b,c,d,x[i+4],7,-176418897); d=ff(d,a,b,c,x[i+5],12,1200080426); c=ff(c,d,a,b,x[i+6],17,-1473231341); b=ff(b,c,d,a,x[i+7],22,-45705983);
      a=ff(a,b,c,d,x[i+8],7,1770035416); d=ff(d,a,b,c,x[i+9],12,-1958414417); c=ff(c,d,a,b,x[i+10],17,-42063); b=ff(b,c,d,a,x[i+11],22,-1990404162);
      a=ff(a,b,c,d,x[i+12],7,1804603682); d=ff(d,a,b,c,x[i+13],12,-40341101); c=ff(c,d,a,b,x[i+14],17,-1502002290); b=ff(b,c,d,a,x[i+15],22,1236535329);
      a=gg(a,b,c,d,x[i+1],5,-165796510); d=gg(d,a,b,c,x[i+6],9,-1069501632); c=gg(c,d,a,b,x[i+11],14,643717713); b=gg(b,c,d,a,x[i],20,-373897302);
      a=gg(a,b,c,d,x[i+5],5,-701558691); d=gg(d,a,b,c,x[i+10],9,38016083); c=gg(c,d,a,b,x[i+15],14,-660478335); b=gg(b,c,d,a,x[i+4],20,-405537848);
      a=gg(a,b,c,d,x[i+9],5,568446438); d=gg(d,a,b,c,x[i+14],9,-1019803690); c=gg(c,d,a,b,x[i+3],14,-187363961); b=gg(b,c,d,a,x[i+8],20,1163531501);
      a=gg(a,b,c,d,x[i+13],5,-1444681467); d=gg(d,a,b,c,x[i+2],9,-51403784); c=gg(c,d,a,b,x[i+7],14,1735328473); b=gg(b,c,d,a,x[i+12],20,-1926607734);
      a=hh(a,b,c,d,x[i+5],4,-378558); d=hh(d,a,b,c,x[i+8],11,-2022574463); c=hh(c,d,a,b,x[i+11],16,1839030562); b=hh(b,c,d,a,x[i+14],23,-35309556);
      a=hh(a,b,c,d,x[i+1],4,-1530992060); d=hh(d,a,b,c,x[i+4],11,1272893353); c=hh(c,d,a,b,x[i+7],16,-155497632); b=hh(b,c,d,a,x[i+10],23,-1094730640);
      a=hh(a,b,c,d,x[i+13],4,681279174); d=hh(d,a,b,c,x[i],11,-358537222); c=hh(c,d,a,b,x[i+3],16,-722521979); b=hh(b,c,d,a,x[i+6],23,76029189);
      a=hh(a,b,c,d,x[i+9],4,-640364487); d=hh(d,a,b,c,x[i+12],11,-421815835); c=hh(c,d,a,b,x[i+15],16,530742520); b=hh(b,c,d,a,x[i+2],23,-995338651);
      a=ii(a,b,c,d,x[i],6,-198630844); d=ii(d,a,b,c,x[i+7],10,1126891415); c=ii(c,d,a,b,x[i+14],15,-1416354905); b=ii(b,c,d,a,x[i+5],21,-57434055);
      a=ii(a,b,c,d,x[i+12],6,1700485571); d=ii(d,a,b,c,x[i+3],10,-1894986606); c=ii(c,d,a,b,x[i+10],15,-1051523); b=ii(b,c,d,a,x[i+1],21,-2054922799);
      a=ii(a,b,c,d,x[i+8],6,1873313359); d=ii(d,a,b,c,x[i+15],10,-30611744); c=ii(c,d,a,b,x[i+6],15,-1560198380); b=ii(b,c,d,a,x[i+13],21,1309151649);
      a=ii(a,b,c,d,x[i+4],6,-145523070); d=ii(d,a,b,c,x[i+11],10,-1120210379); c=ii(c,d,a,b,x[i+2],15,718787259); b=ii(b,c,d,a,x[i+9],21,-343485551);
      a=safeAdd(a,oa); b=safeAdd(b,ob); c=safeAdd(c,oc); d=safeAdd(d,od)
    }
    return [a,b,c,d]
  }
  function binl2rstr(input){ var o=''; for(var i=0;i<input.length*32;i+=8) o+=String.fromCharCode((input[i>>5]>>>(i%32))&0xff); return o }
  function rstr2binl(input){ var o=[]; for(var i=0;i<input.length*8;i+=8) o[i>>5]|=(input.charCodeAt(i/8)&0xff)<<(i%32); return o }
  function rstrMD5(s){ return binl2rstr(binlMD5(rstr2binl(s),s.length*8)) }
  function rstr2hex(input){ var ht='0123456789abcdef',o=''; for(var i=0;i<input.length;i++){ var x=input.charCodeAt(i); o+=ht.charAt((x>>>4)&0x0f)+ht.charAt(x&0x0f) } return o }
  return rstr2hex(rstrMD5(str))
}

// ── getNum（与 ReaderPage.tsx 完全一致）────────────────
function getNum(scrambleId, aid, filename) {
  if (scrambleId === 0) return 0
  if (aid < scrambleId) return 0
  if (aid < 268850) return 10
  var x = aid < 421926 ? 10 : 8
  var s = md5('' + aid + filename)
  var num = s.charCodeAt(s.length - 1) % x
  return num * 2 + 2
}

// ── 反打乱主函数（与 ReaderPage DescrambledImage.handleLoad 完全一致）──
// 参数由 executeJavaScript 传入，返回 descrambled base64（无 data: 前缀）
window.doDescramble = function(base64Data, scrambleId, imageUrl) {
  return new Promise(function(resolve, reject) {
    var img = document.getElementById('img')
    img.onload = function() {
      try {
        var w = img.naturalWidth
        var h = img.naturalHeight

        var aidMatch = imageUrl.match(/\\/(?:photos?|albums?)\\/(\\d+)\\//)
        var aid = aidMatch ? parseInt(aidMatch[1]) : 0
        var filename = imageUrl.split('/').pop().replace(/\\.[^.]+$/, '')

        var c = getNum(scrambleId, aid, filename)
        if (c === 0) {
          resolve(base64Data)
          return
        }

        var canvas = document.getElementById('c')
        canvas.width = w
        canvas.height = h
        var ctx = canvas.getContext('2d')

        // ── 以下逐行复制自 ReaderPage.tsx DescrambledImage ──
        var s = h
        var r = w
        var f = s % c

        for (var g = 0; g < c; g++) {
          var stripH = Math.floor(s / c)
          var dstY = stripH * g
          var srcY = s - stripH * (g + 1) - f
          if (g === 0) {
            stripH += f
          } else {
            dstY += f
          }
          ctx.drawImage(img, 0, srcY, r, stripH, 0, dstY, r, stripH)
        }
        // ── 复制结束 ──

        // 导出为 base64（去掉 data:...;base64, 前缀）
        var dataUrl = canvas.toDataURL('image/jpeg', 0.92)
        var base64 = dataUrl.split(',')[1]
        resolve(base64)
      } catch(e) {
        reject('descramble error: ' + e.message)
      }
    }
    img.onerror = function(e) { reject('image load error') }
    img.src = 'data:image/jpeg;base64,' + base64Data
  })
}
</script></body></html>`
}

let _descrambleWin: BrowserWindow | null = null

function getDescrambleWindow(): BrowserWindow {
  if (_descrambleWin && !_descrambleWin.isDestroyed()) return _descrambleWin

  _descrambleWin = new BrowserWindow({
    show: false,
    width: 200,
    height: 200,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      offscreen: true
    }
  })

  _descrambleWin.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(buildDescrambleHtml())}`
  )

  _descrambleWin.on('closed', () => {
    _descrambleWin = null
  })

  return _descrambleWin
}

async function doDescramble(
  inputBuffer: Buffer,
  scrambleId: number,
  imageUrl: string
): Promise<Buffer> {
  if (scrambleId <= 0) return inputBuffer

  const base64 = inputBuffer.toString('base64')
  const win = getDescrambleWindow()

  // 等待页面加载完成（首次调用时）
  await win.webContents.executeJavaScript('1')

  const resultBase64: string = await win.webContents.executeJavaScript(
    `window.doDescramble(${JSON.stringify(base64)}, ${scrambleId}, ${JSON.stringify(imageUrl)})`
  )

  return Buffer.from(resultBase64, 'base64')
}

// 反打乱窗口是单例，多个下载任务并发调用 executeJavaScript 会互相干扰，
// 这里用 Promise 链串行化所有反打乱请求。
let descrambleQueue: Promise<unknown> = Promise.resolve()

/**
 * 反打乱一张图片。算法与阅读器 ReaderPage.tsx 的 DescrambledImage
 * 组件完全一致，通过隐藏 BrowserWindow 中的 Canvas drawImage 实现。
 */
export function descrambleImage(
  inputBuffer: Buffer,
  scrambleId: number,
  imageUrl: string
): Promise<Buffer> {
  const run = descrambleQueue.then(() => doDescramble(inputBuffer, scrambleId, imageUrl))
  descrambleQueue = run.catch(() => {})
  return run
}
