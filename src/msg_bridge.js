//初始化MsgBridge构造器
//动态加载SharedWorker
function MsgBridge(url, clientId, pageId){
  this.url = url;
  this.clientId= this.getClientId(clientId); //浏览器客户端标识id,存储在本地,没有的时候创建一个
  this.pageId=pageId || location.pathname;
  this.msgCenter = {};
  this.cbMap = {};
  this.sharedWorker = null;
  this.init();
}
//创建worker,建立连接,建立消息监听
MsgBridge.prototype.init = function(){
  this.sharedWorker = new SharedWorker('msg_bridge_shared_worker.js?v=0.1.0'); //创建一个实例
  // 监听 SharedWorker 发送的消息
  this.sharedWorker.port.addEventListener("message", (event) => {
    console.log("Message from MsgBridge SharedWorker:", event.data);
    if(this.onMessage){
      return this.onMessage(event);
    }
    if(typeof event.data === 'string' && event.data.startsWith('sse:')){
      this.cbMap['sse:*'] && this.cbMap['sse:*'](JSON.parse(event.data.slice(4)));
      return;
    }
    this.cbMap['browser:*'] && this.cbMap['browser:*'](event.data.data);
  });
  this.sharedWorker.port.start();
  this.sharedWorker.port.postMessage({ type: "init", pageId: this.pageId, clientId:this.clientId });
  this.initClearFn();
};
MsgBridge.prototype.reg = function(msgTypes, cb){
  this.cbMap[msgTypes] = cb;
};

//默认的全局默认callback
MsgBridge.prototype.setDefaultCallBack = function(cb){
  this.defaultCallBack = cb|| window.msgBridgeDefaultCallBack || (()=>{});
};

//消息到达时的处理函数
MsgBridge.prototype.onMessage = function(event){
  let msg = event.data;
  if(typeof msg !=='string'){
    console.log('异常数据类型,请检查:', event);
    return;
  }
  let index = msg.indexOf('{');
  if(index===-1){
    index = msg.indexOf(':');
  }
  if(index===-1){
    console.log('异常数据类型,请检查:', event);
    return;
  }
  let msgType = msg.slice(0, index);
  let cbMapKeys = Object.keys(this.cbMap).filter(x=>{
    return msgType.startsWith(x.replace(/\*$/,""));
  });
  let msgObj = JSON.parse(msg.slice(index+1));
  cbMapKeys.forEach(key=>{
    if(key == 'client' && msgObj.pageId===this.pageId){
      return; //不处理本页面产生的client消息
    }
    this.cbMap[key](msgObj);
  });
};

/**
 * 发送消息
 * @parmas Object msg, 消息内容; 会自动追加pageId和clientId;
 *         String msg.type, 消息种类,必选字段;标识消息类型
 */
MsgBridge.prototype.send = function(msg){
  if(!msg.type){
    console.error('消息格式不合法,必须包含type字段,请检查;', msg);
    return;
  }
  this.sharedWorker.port.postMessage(Object.assign({pageId: this.pageId, clientId:this.clientId},msg));
};

//页面关闭时自动释放当前对SharedWorker的连接和绑定,避免内存泄漏
MsgBridge.prototype.initClearFn = function(){
  let port = this.sharedWorker.port;
  window.addEventListener('beforeunload', () => {
    port.postMessage({type: 'close',  pageId: this.pageId, clientId:this.clientId});
  });
};


//客户端id,传入的话进行记录,供下一次使用;没有传入的话通过时间戳+随机数生成;建议使用外部的统一生成.
MsgBridge.prototype.getClientId = function(clientId){
  if(!clientId){
    clientId = localStorage.getItem('_MSG_BRIDGE_CLIENT_ID') || (Date.now()+(Math.random()+'').slice(2)).slice(1,17);
  }
  localStorage.setItem('_MSG_BRIDGE_CLIENT_ID', clientId); //缓存到localStorage
  return clientId;
};