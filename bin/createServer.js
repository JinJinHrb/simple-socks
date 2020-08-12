
/* 
	【测试步骤】
	(1) 创建 socks5 服务器（port=1081）
	node "/Users/alexwang/Documents/workspace/github/simple-socks-copy/bin/createServer.js"
	
	(2) 创建 TCP 转发
	node "/Users/alexwang/Documents/workspace/github/simple-socks-copy/bin/forwarder.js" 1080 127.0.0.1:1081

	(3) 测试网页
	curl http://www.baidu.com --socks5 127.0.0.1:1080
*/

const
	socks5 = require('../src/socks5'),
	server = socks5.createServer();

// start listening!
server.listen(1080);

server.on('handshake', function (socket) {
	console.log();
	console.log('------------------------------------------------------------');
	console.log('new socks5 client from %s:%d', socket.remoteAddress, socket.remotePort);
});

// When a reqest arrives for a remote destination
server.on('proxyConnect', function (info, destination) {
	console.log('connected to remote server at %s:%d', info.address, info.port);

	destination.on('data', function (data) {
		console.log(data.length);
	});
});

server.on('proxyData', function (data) {
	console.log(data.length);
});

// When an error occurs connecting to remote destination
server.on('proxyError', function (err) {
	console.error('unable to connect to remote server');
	console.error(err);
});

// When a proxy connection ends
server.on('proxyEnd', function (response, args) {
	console.log('socket closed with code %d', response);
	console.log(args);
	console.log();
});
