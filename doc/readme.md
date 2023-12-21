# 整体设计

## 客户端clientId
由于需要一个唯一的id标识当前浏览器, `MsgBridge`的实例将此id记录到`localStorage`中, key为:`_MSG_BRIDGE_CLIENT_ID`. 如果初始化时没有指定, 则优先读取`_MSG_BRIDGE_CLIENT_ID`的值, 如果该值为空, 则生成一个新的并记录.
如果初始化时指定了特定的clientId, 则会主动更新`_MSG_BRIDGE_CLIENT_ID`为新的值.(不影响已经在运行的MsgBridge实例,仅影响后续new的实例)


## SDK层

```javascript
// <script src="./msg_bridge.min.js"></script>
let url = BASE_URL + '/msg';
let msgBridge = new MsgBridge(url, clientId=null, pageId=uuid());

/**
 * 向服务器声明要监听的范围,
msgBridge.reg('监听范围',function(msg){ //监听的回调函数
  //do something with msg
});
*/
msgBridge.reg('event:*', callBack1);
msgBridge.reg('sse:room:*', callBack2);
msgBridge.reg('*', callBack3);
msgBridge.reg('broswer:*', callBack4); //注册浏览器内部各网页间的消息
msgBridge.reg('system:*', callBackDefault) //sdk会默认监听system:*类型的所有消息,无需业务层面处理,此函数在new完毕后自动执行
```

### 消息格式设计
//TODO

### 消息监听设计

每种消息都有消息类型: msg_type 和消息实体 msg_body两部分组成, 需要处理消息时针对消息类型或者消息类型的前缀注册回调函数, 形式如下:
```javascript
/**
 * 向服务器声明要监听的范围,
msgBridge.reg(msg_type, callBackFunc); //注册浏览器内部各网页间的消息
msgBridge.reg('监听范围',function(msg){ //监听的回调函数
  //do something with msg
});
*/
msgBridge.reg('broswer:*', callBack4); //注册浏览器内部各网页间的消息
msgBridge.reg('system:*', callBackDefault) //sdk会默认监听system:*类型的所有消息,无需业务层面处理,此函数在new完毕后自动执行
```

`broswer:*` 标识所有消息类型为`broser:`开头的消息均可以由回调函数`callBack4`来处理;

`callBackFunc`的定义如下:
```javascript
callBackFunc = function(msg_body){
  console.log(msg_body); //消息实体.
}
```

支持对同一scene_type配置多个callBack回调, 配置多个则执行多次;

支持对同一scene_type通过不同的过滤规则进行配置, 命中多个则执行多次; 如:
```javascript
msgBridge.reg('broswer:*', callBack4);
msgBridge.reg('broswer:111', callBack5);
```
均会匹配`broser:111`这个类型的消息, 且callBack4和callBack5均会执行; 【待优化，考虑控制是否改为阻止后续回调执行？】

* 支持自定义消息类型
msgBridge.reg('abc', func1), 

* 暂不支持解除回调的监听
暂不支持`msgBridge.unreg`, 需要此种用法的话考虑回调函数内部控制. 当前建议的用法是绑定正确,需要调整时析构当前的msgBrige对象, 并创建新的. 曲线实现.

## SharedWorker层
