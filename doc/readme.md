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
msgBridge.reg('*', callBack3); //监听所有消息
msgBridge.reg('client:*', callBack4); //注册浏览器内部各网页间的消息
msgBridge.reg('system:*', callBackDefault) //sdk会默认监听system:*类型的所有消息,无需业务层面处理,此函数在new完毕后自动执行
```

### 消息格式设计
每种消息都有消息类型: msg_type 和消息实体 msg_body两部分组成 

* 消息类型: msg_type
字符串格式,可以运行有`0-N`个`:`作为分隔符, 最大长度不超过256字符. 建议仅使用英文+下划线.
不能使用@符号, 该符号会用于数据序列化时标识msg_type.

* 消息实体: msg_body
字符串格式, 长度不限, 建议范围`0-200kB`; 建议采用JSON格式的字符串,方便传递复杂数据结构;
二进制数据需要采用Base64编码后传输
建议数据较大时在可以压缩的情况下先进行一次压缩;

* 序列化
由于涉及到部分场景(如推送\跨页面消息传递)时需要先对数据进行序列化;序列化后的格式以 `msg_type@msg_body`形式存在,即整个字符串的第一个@符号作为msg_type和msg_body的分隔符.
如果是Base64格式的msg_body,则需要以`base64:`开头,后面跟着base64以后的字符串.
举例如下
```javascript
let msg_type = "sse:room:/url/to/page1";
let msg_body = '{"msg_type":"sse:room:/url/to/page1","user_id":"xxxxx","action_type":"1111","list":[1,2,3]}';

//序列化后的数据
let msg_serialized = 'sse:room:/url/to/page1@{"msg_type":"sse:room:/url/to/page1","user_id":"xxxxx","action_type":"1111","list":[1,2,3]}';
let msg_serialized_2 = 'sse:room:/url/to/page1@base64:xxxxxxxxxxxxxxxxxxxxxxx';
```


### 默认消息类型
* system
平台从服务端推送到客户端的消息, 此类消息与`room`无关, 一般用于全局控制, 如登出\在其他页面登录\在其他客户端登录\邮件、通知提醒等

* client
本客户端内部传递的消息，排除掉本页面消息；用于同一客户端各个不同页面间的消息互传，采用广播机制，从当前页面向所有同一域名下注册了相同SharedWorker的页面发送。
【待分析：SharedWorker是否可以跨域加载】

* sse
服务端sse推送的消息. 与system类型的消息不同, 此类消息为某些业务逻辑触发\某些用户操作触发,一般是上游消息的后续操作,或者单个页面的事件结束通知等.

* sse:room:$roomId
sse消息的一种常见形式,通过room及`$roomId`来细化此条消息是归属于那个room. room的设计借鉴了socke.io, 最简但得情况就是roomId取值当前页面URL,来实现不同页面消息的相互隔离.

* event
系统类事件,与服务器无关. 常见的有页面关闭\页面失去焦点\网络断开\sse中断等, 与客户端状态相关.


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
msgBridge.reg('client:*', callBack4); //注册浏览器内部各网页间的消息
msgBridge.reg('system:*', callBackDefault) //sdk会默认监听system:*类型的所有消息,无需业务层面处理,此函数在new完毕后自动执行
```

`client:*` 标识所有消息类型为`client:`开头的消息均可以由回调函数`callBack4`来处理;

`callBackFunc`的定义如下:
```javascript
callBackFunc = function(msg_body){
  console.log(msg_body); //消息实体.
}
```

支持对同一scene_type配置多个callBack回调, 配置多个则执行多次;

支持对同一scene_type通过不同的过滤规则进行配置, 命中多个则执行多次; 如:
```javascript
msgBridge.reg('client:*', callBack4);
msgBridge.reg('client:111', callBack5);
```
均会匹配`client:111`这个类型的消息, 且callBack4和callBack5均会执行; 【待优化，考虑控制是否改为阻止后续回调执行？】

* 支持自定义消息类型
msgBridge.reg('abc', func1), 

* 暂不支持解除回调的监听
暂不支持`msgBridge.unreg`, 需要此种用法的话考虑回调函数内部控制. 当前建议的用法是绑定正确,需要调整时析构当前的msgBrige对象, 并创建新的. 曲线实现.

## SharedWorker层
