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
  this.sharedWorker = new SharedWorker('../dist/msg_bridge_shared_worker.js?v=0.1.3'); //创建一个实例
  // 监听 SharedWorker 发送的消息
  this.sharedWorker.port.addEventListener("message", (event) => {
    console.log("Message from MsgBridge SharedWorker:", event.data);
    if(this.onMessage){
      return this.onMessage(event);
    }
    // if(typeof event.data === 'string' && event.data.startsWith('sse:')){
    //   this.cbMap['sse:*'] && this.cbMap['sse:*'](JSON.parse(event.data.slice(4)));
    //   return;
    // }
    // this.cbMap['browser:*'] && this.cbMap['browser:*'](event.data.data);
  });
  this.sharedWorker.port.start();
  this.sharedWorker.port.postMessage({ type: "init", pageId: this.pageId, clientId:this.clientId });
  this.initClearFn();
};
MsgBridge.prototype.reg = function(msgTypes, cb){
  this.cbMap[msgTypes] = cb;
};

/**
 * 配置默认的全局默认callback 
 * @param {Function} cb 默认回调
 * 回调函数格式定义: cb = function(msg_type, msg_body){...}
 */
MsgBridge.prototype.setDefaultCallBack = function(cb){
  this.defaultCallBack = cb|| window.msgBridgeDefaultCallBack || (()=>{});
};

//消息到达时的处理函数
MsgBridge.prototype.onMessage = function(event){
  console.log('event:got:', event);
  let msg = event.data; //msg_type@msg_data
  let isJSONMsg = false;
  let msgType = '';
  let msg_body = '';
  if(typeof msg !=='string'){
    if(typeof msg ==='object' && !!msg.type){
      msgType = msg.type;
      msg_body = msg;
    }else{
      console.log('异常数据类型,请检查:', event);
      return;
    }
  }else{
    let index = msg.slice(0,256).indexOf('@');
    if(index===-1){
      console.log('异常数据类型,请检查:', event);
      return;
    }
    msgType = msg.slice(0, index);
    msg_body = msg.slice(index+1);
    if(msg_body.startsWith('base64:')){
      msg_body = msg_body.slice(7);
      console.log('msg base64: todo: ', msg_body);
      throw new Error('暂不支持base64,开发中...');
    }
    if(msg_body.startsWith('{')){
      msg_body = JSON.parse(msg_body);
      isJSONMsg = true;
    }
  }
  let cbMapKeys = Object.keys(this.cbMap).filter(x=>{ //查询当前页面支持该消息类型的回调函数.
    return x.replace(/\*$/,"").startsWith(msgType);
  });
  if(cbMapKeys.length===0){ //没有找到监听函数时,交给defaultCallBack处理
    this.defaultCallBack && this.defaultCallBack(msgType, msg_body);
    return;
  }
  cbMapKeys.forEach(key=>{
    if(key.startsWith('client') && msg_body.pageId===this.pageId){
      return; //不处理本页面产生的client消息
    }
    this.cbMap[key](msg_body); //是JSON格式的提前转好,不是JSON格式的原样返回
  });
};

/**
 * 发送消息
 * @parmas Object msg, 消息内容; 会自动追加pageId和clientId;
 *         String msg.type, 消息种类,必选字段;标识消息类型,对应msg_type
 *         String|Object msg.body, 消息内容实体,必选字段;对应msg_body;允许为空字符串
 *         String msg.pageId, 页面标识,可选字段;默认使用本页面pageId
 *         String msg.clientId, 客户端标识,可选字段;默认使用本浏览器clientId
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