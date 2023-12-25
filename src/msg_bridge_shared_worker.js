console.log('启动SharedWorker,',new Date());
const connectedPorts = {};
const connectedPageIds = [];
const clientId = '';
let clients = [];
let sse = null;
let lastSseUrl = ''; //连接服务器的sse地址, 建议所有服务器连接合并为一个推送通道.
let ssePageIds = [];
//为Chrome49增加Object.keys的polyfill
if (!Object.keys) { Object.keys = (function () { var hasOwnProperty = Object.prototype.hasOwnProperty, hasDontEnumBug = !({ toString: null }).propertyIsEnumerable('toString'), dontEnums = ['toString', 'toLocaleString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'constructor'], dontEnumsLength = dontEnums.length; return function (obj) { if (typeof obj !== 'object' && typeof obj !== 'function' || obj === null) throw new TypeError('Object.keys called on non-object'); var result = []; for (var prop in obj) { if (hasOwnProperty.call(obj, prop)) result.push(prop); } if (hasDontEnumBug) { for (var i = 0; i < dontEnumsLength; i++) { if (hasOwnProperty.call(obj, dontEnums[i])) result.push(dontEnums[i]); } } return result; } })() };

self.onconnect = function (e) {
  var port = e.ports[0];
  console.log('connect', e);
  // clients.push(port);
  port.addEventListener('message', function (e) {
    console.log('on message', e);
    if (typeof e.data === 'string') {
      console.log('暂不支持的消息格式,请确定传递的参数是否为合法JSON');
      return;
    }
    let data = e.data; //data应该为对象格式
    if (data.type == 'init') {
      return init(port, data);
    }
    if (data.type == 'close') {
      return close(port, data);
    }
    if (data.type == 'sseCreate') {
      return sseCreate(port, data);
    }
    if (data.type == 'clinet') {
      return gotClientMsg(port, data);
    }
  });
  port.addEventListener('close',function(e){
    console.log('close, ', e);
  });
  port.addEventListener('err',function(e){
    console.log('error, ', e);
  })
  port.start();
};
self.onerror = function(err){
  console.log('self error', err);
};

function init(port, data) {
  let { clientId = '', pageId = '' } = data;
  console.log('=========', clientId, pageId);
  connectedPorts[pageId] = port;
  connectedPageIds.push(pageId);
}

function close(port, data) {
  let { clientId = '', pageId = '' } = data;
  console.log('=====close====', clientId, pageId);
  delete connectedPorts[pageId];
  let index = connectedPageIds.indexOf(pageId);
  connectedPageIds.splice(index,1);
  if(Object.keys(connectedPorts).length===0){
    console.log('=====close sse====');
    sse && sse.close();
    sse = null;
  }
}

//多窗口间消息广播
function gotClientMsg(port, data) {
  let { clientId = '', pageId = '' } = data;
  console.log('=========', clientId, pageId, data);
  connectedPageIds.forEach(pageId => {
    connectedPorts[pageId] && connectedPorts[pageId].postMessage(data);
  });
}

function sseCreate(port, data){
  ssePageIds.push(data.pageId);
  sseInit(data.sseUrl);
}

//连接SSE,并接收数据
function sseInit(sseUrl) {
  lastSseUrl = sseUrl;
  if (sse) { //已经创建, 则复用;不创建新的
    return;
  }
  sse = new EventSource(sseUrl);
  sse.inited = false;
  sse.last_msg_id = 0;
  sse.addEventListener('msg', function (d) {
    console.log('msg:data', d);
    //找到所有监听了sse的页面port,向其发送消息;有页面自行判定该消息要不要处理.
    let msgPageId = d.data.sse_id || '*';
    //let clients = ssePageIds.filter(x=>msgPageId==x||msgPageId===''||msgPageId=='*').map(x=>connectedPorts[x]||null).filter(x=>!!x);
    // let clients = ssePageIds.map(x=>connectedPorts[x]||null).filter(x=>!!x);
    let clients = Object.values(connectedPorts);
    for (var i = 0; i < clients.length; i++) {
      var eElement = clients[i];
      eElement.postMessage('sse:'+JSON.stringify(d.data));
    }
  });
  sse.addEventListener('error', function(err){
    console.log(err);
    setTimeout(reloadSSE, 1000);
  });
}

function reloadSSE(){
  if(sse && sse.ready_state == 2){ //连接状态正常, 则不需要重连
    return;
  }
  sse =null;
  sseInit(lastSseUrl);
}

//根据msg信息搜索到监听了此类消息的port的数组.
function getClientsByMsgInfo(msg) {
  let pageIds = Object.keys(connectedPorts);
  let ans = [];
  return pageIds.filter(x => isTypeOK(x, msg));
}

function isTypeOK(pageId, msg) {
  if (msg.clientId == clientId && msg.pageId) {
    return msg.pageId == pageId;
  }
  return false;
}
//myWorker.port.postMessage('sse')